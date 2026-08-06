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
- Mission Control / dashboard remoto seguem em 502: a regra de ingress do túnel
  de produção aponta `openclaw.hktcstore.com.br` para `http://100.110.4.56:18789`
  (IP tailscale da própria máquina), mas o gateway escuta só em loopback. Fix =
  trocar por `127.0.0.1:18789` no `/etc/cloudflared/config.yml` — **arquivo de
  produção, exige alinhamento antes.**
