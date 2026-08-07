# Lívia na VPS — como ela responde no `/chat`

Integração feita em 2026-08-06. Documenta o que roda na VPS OpenClaw
(`178.104.108.79`) para a Lívia responder no painel, e **por que** foi feita
assim — a VPS é um OpenClaw de produção com automações vivas da HKTC.

## O problema

O painel dispara o agente com `POST {ingress_url}/hooks/agent` +
`Authorization: Bearer <hooks_token>` (`supabase/functions/_shared/agent-dispatch.ts`).
Esse endpoint **não existe no OpenClaw 2026.7.1**: `/hooks/agent` devolve 404, não
há chave `hooks` no `openclaw.json`, e `openclaw hooks` nessa versão são hooks
internos de evento (`hooks.internal.entries.*`), não HTTP. O `admin-http-rpc` é
bundled mas `disabled` e fora do allowlist; o caminho oficial para app externo é
WebSocket RPC.

Consequência prática: rodar o instalador oficial do `agente-cfo`
(`MindOpsTeam/agente-cfo`, `install/setup.sh`) **não** resolveria — ele executa
`openclaw config set hooks.enabled/hooks.token` com `2>/dev/null || warn`, ou
seja falharia em silêncio, registraria a instância, e a Lívia nunca responderia.
Além disso o instalador sobrescreve `~/.agente-cfo/.env`, reescreve units
systemd e aplica a identidade CFO no `agent main` — que é o agente das ~10
automações de produção (modelo `openai/gpt-5.4-mini`). **Não rodar o instalador.**

## O desenho

```
painel /chat → chat-send-message → cloudflared-cfo (quick tunnel)
   → cfo-hooks-bridge (127.0.0.1:18790) → openclaw agent --agent livia
   → bridge posta em chat-marcos-reply → resposta na tela
```

Peças, todas em `/home/openclaw`:

| Peça | Onde | Papel |
|---|---|---|
| Agente `livia` | workspace `~/.openclaw/workspaces/livia`, modelo `anthropic/claude-haiku-4-5` | isolado do `main`; sem bindings de canal |
| Skill `agente-cfo` | `~/.openclaw/workspaces/livia/skills/` | prompts + identity da Lívia |
| `cfo_hooks_bridge.py` | `~/.agente-cfo/`, unit `cfo-hooks-bridge.service` | fala o dialeto do painel |
| Túnel | unit `cloudflared-cfo.service` | expõe só a porta do bridge |
| `.env` (chmod 600) | `~/.agente-cfo/.env` | PANEL_BASE_URL, PANEL_TOKEN, HOOKS_TOKEN, INGRESS_URL, INSTANCE_ID |
| Heartbeat | `heartbeat.sh` da skill, cron `*/4` | mantém `last_heartbeat` fresco (o painel exige < 5 min) |

### Três decisões que não são óbvias

**1. O bridge posta a resposta, não o agente.** O prompt do painel manda a Lívia
executar `panel_post_reply.sh`, mas o agente não tem exec/bash: `tools.profile` e
o allowlist de approvals são config **global** do OpenClaw, compartilhada com o
agente de produção. Em vez de mexer nisso, o bridge captura o `stdout` do turn e
faz ele mesmo o POST em `chat-marcos-reply` — mesmo contrato, uma peça a menos.

**2. O bridge reescreve o caminho do workspace.** O painel monta o prompt com
`$HOME/.openclaw/workspace/skills/agente-cfo/...` (hardcoded no workspace do
`main`, ver `chat-send-message/index.ts`). Instalar a skill lá exporia a skill CFO
ao agente de produção, então ela vive no workspace da Lívia e o bridge troca
`.openclaw/workspace/skills` → `.openclaw/workspaces/livia/skills`.

**3. O túnel roda com `HOME` isolado.** ⚠️ Sem `Environment=HOME=~/.agente-cfo/cf`,
o `cloudflared` lê `~/.cloudflared/` e carrega as credenciais do **túnel nomeado
de produção** (`e95a968e-…`), registrando-se como conexão extra dele — aconteceu
na integração e o processo foi morto na hora. O `HOME` vazio força um quick
tunnel de verdade.

O nome da unit `cloudflared-cfo` e o log em `~/.agente-cfo/logs/cloudflared.log`
também são deliberados: é exatamente onde o `heartbeat.sh` procura a URL do
túnel. Quando o quick tunnel reinicia com URL nova, o heartbeat detecta,
atualiza o `.env` e manda a URL no corpo do heartbeat — o painel se corrige
sozinho em ≤ 4 minutos, sem re-registrar a instância.

## Diagnóstico rápido

```bash
systemctl is-active cfo-hooks-bridge cloudflared-cfo
curl -s http://127.0.0.1:18790/healthz
tail -n 20 ~/.agente-cfo/logs/bridge.log
```

No `bridge.log`, a sequência de um turn saudável é `dispatch run_id=panel_…` →
`done … rc=0` → `reply … http=204 status=sent`. Onde ela para diz o que quebrou:

| Sintoma | Causa |
|---|---|
| "Lívia está offline" no chat | `instances.last_heartbeat` > 5 min — ver cron e `INSTANCE_ID` no `.env` |
| sem `dispatch` | painel não alcançou a VPS — túnel caiu ou `ingress_url` desatualizada |
| `rc` ≠ 0 | o `stderr` no log aponta (modelo, chave Anthropic) |
| `reply … http=401` | `PANEL_TOKEN` diferente de `panel_config.panel_token` |
| resposta só aparece com F5 | Realtime — ver `20260806000000_chat_realtime.sql` |

## Pendências

- Latência de ~16-20s por resposta: sobe um processo `openclaw agent` por
  mensagem. Avaliar `--session-key agent:livia:<thread_id>` (dá também memória
  de conversa nativa) ou falar direto com o gateway.
- `heartbeat.sh` trata HTTP 204 como anomalia no log (a função `heartbeat`
  responde 204). Cosmético.
- Porta 3978 (`/api/messages`, bot do Teams): a regra de ingress existe mas
  **nenhum processo da máquina escuta nessa porta** e nenhuma unit systemd a
  menciona. Regra órfã — decidir se remove ou se o serviço volta.
- Os dois arquivos `20260806000000_*` nasceram com o mesmo número de versão; o
  do realtime foi renumerado para `20260806010000` porque o histórico de
  migrations usa a versão como chave única. Conferir isso ao criar migrations
  no mesmo dia.

## Janela de manutenção de 2026-08-07

`scripts/janela-manutencao-vps.sh` (subcomandos `check`/`fix`/`rollback`/
`pre-reboot`/`reboot --confirmo`/`pos-reboot`). Instalar na VPS por **linha
única base64** — multi-linha embola no bracketed paste. O `fix` mede as 5 rotas
do túnel antes e depois, faz backup datado, valida com `cloudflared tunnel
ingress validate` e **restaura sozinho** se alguma rota saudável virar 5xx.

Três coisas mudaram na VPS:

1. **Ingress corrigido** — o catch-all de `openclaw.hktcstore.com.br` apontava
   `100.110.4.56:18789` (IP tailscale) e o gateway só escuta loopback. Trocado
   por `127.0.0.1:18789`: rota externa **502 → 200**. Backup em
   `/etc/cloudflared/config.yml.bak-20260807-104852`.
2. **Colisão de porta eliminada** — três units disputavam a 18789 no boot:
   `openclaw-gateway` do sistema (a que roda), `openclaw-gateway` de usuário e
   `openclaw-node` de usuário (v2026.4.8, parado desde 22/06). As duas de
   usuário foram desabilitadas (`systemctl --user disable`; desfazer =
   `enable`). Sem isso o reboot era uma corrida: se o gateway perdesse a porta,
   Lívia e Mission Control caíam — e o motivo seria quase impossível de achar
   depois.
3. **Reboot testado** (o uptime era de 134 dias). Tudo voltou sozinho, as 5
   rotas idênticas, e o quick tunnel da Lívia trocou de URL com o heartbeat
   corrigindo sozinho — a autocorreção descrita acima deixou de ser teoria.

`supervisora-bridge` (3001) e `hermes-gateway` (8642) são units **de usuário** e
só voltam porque `Linger=yes` no usuário `openclaw`. Conferir antes de qualquer
reboot futuro, junto com o que ocupa cada porta e o que está `enabled` mas
parado.

## O dashboard não usa o mesmo endereço da Lívia

`instances.ingress_url` guarda o endereço do **bridge** e é reescrito pelo
`heartbeat` a cada 4 min. O Mission Control e o "Abrir OpenClaw" precisam do
**gateway** — enquanto liam o mesmo campo, abriam no bridge e recebiam
`{"error":"not found"}`. Desde `20260807000000_openclaw_dashboard_url.sql` existe
a coluna `instances.openclaw_dashboard_url`, que o heartbeat não toca;
`openclaw-dashboard-url` e `openclaw-ws-url` a usam com fallback para
`ingress_url`.
