# HANDOFF — VPS OpenClaw, Lívia e Mission Control

Última atualização: **2026-08-07**, após a janela de manutenção.
Commit de referência: `7eff3a0` na `main`.

Este documento é para quem for continuar a demanda sem ter participado das
conversas anteriores. Ele diz o que está funcionando, **como isso foi provado**,
o que ainda está quebrado e por onde começar.

> **Nenhuma senha, token ou chave está neste arquivo.** Onde cada segredo mora
> está indicado na seção [Segredos](#segredos-onde-cada-um-mora).

---

## 1. O terreno

São **dois sistemas separados**, e confundi-los custa tempo:

| | O que é | Onde roda | Endereço |
|---|---|---|---|
| **Painel Financeiro** | Painel, Pagamentos, Auditoria, chat da Lívia | Vercel (nuvem) | `financeiro.hktcdobrasil.com.br` |
| **VPS OpenClaw** | Automações de produção da HKTC + o agente da Lívia | Servidor próprio | `178.104.108.79` / `openclaw.hktcstore.com.br` |

Repositório: `HKTCprojeto/financeironovo`, branch `main` (é de onde a Vercel publica).
Supabase do time: projeto `utowspmmukczjinwgfdv`.

### ⚠️ A restrição que não é negociável

A VPS é um **OpenClaw de produção** com automações vivas da HKTC — motor de
cobrança, fluxo de aprovação de demandas do Daniel via Teams, sincronização do
SGI, alertas de saldo, relatórios por e-mail, ponte da supervisora. São ~10
tarefas agendadas no `crontab` do usuário `openclaw`.

Disso decorrem três regras:

1. **Não rodar o instalador oficial do `agente-cfo`** (`install/setup.sh` do
   repo `MindOpsTeam/agente-cfo`, nem qualquer `curl | bash`). Ele sobrescreve
   `~/.agente-cfo/.env`, reescreve units systemd e aplica a identidade CFO no
   `agent main` — que é o agente das automações de produção. Além disso ele
   configura `hooks.enabled/hooks.token`, que **não existem** nesta versão do
   OpenClaw, e falha em silêncio (`2>/dev/null || warn`). O motivo completo está
   em [`livia-vps-bridge.md`](livia-vps-bridge.md).
2. **Alinhar antes de cada mudança na VPS.** Mudanças ali afetam outras pessoas,
   não só quem está mexendo.
3. **Acesso é por senha**, não por chave SSH: `openclaw` → `sudo -i` para root.
   Quem digita a senha é uma pessoa; não há automação com acesso ao servidor.

### Colar comandos na VPS

O terminal embola **colagem de múltiplas linhas** (bracketed paste). Duas saídas:

- comandos de **uma linha só**; ou
- `bind 'set enable-bracketed-paste off'` antes de colar; ou
- para scripts, mandar em **base64 numa linha só** (foi o método usado na janela):
  `echo '<base64>' | base64 -d > /root/janela.sh && bash /root/janela.sh check`

---

## 2. Como a Lívia responde no `/chat`

```
painel /chat → chat-send-message → cloudflared-cfo (quick tunnel)
   → cfo-hooks-bridge (127.0.0.1:18790) → openclaw agent --agent livia
   → o bridge posta em chat-marcos-reply → resposta na tela
```

O desenho, e **por que** cada peça é assim, está em
[`livia-vps-bridge.md`](livia-vps-bridge.md). O resumo indispensável:

- O agente **`livia`** é isolado do `main` (workspace próprio, modelo
  `anthropic/claude-haiku-4-5`). O `main` e suas automações não são tocados.
- **O bridge posta a resposta, não o agente.** O agente não tem `exec`/`bash`, e
  dar isso a ele exigiria mexer em config **global** do OpenClaw, compartilhada
  com o agente de produção.
- **O túnel da Lívia roda com `HOME` isolado** (`Environment=HOME=/home/openclaw/.agente-cfo/cf`).
  ⚠️ Sem isso o `cloudflared` lê `~/.cloudflared/` e se registra como conexão
  extra do **túnel nomeado de produção**. Já aconteceu uma vez.
- O quick tunnel **muda de URL a cada reinício**. Isso se corrige sozinho: o
  `heartbeat.sh` (cron `*/4`) lê a URL nova em
  `~/.agente-cfo/logs/cloudflared.log`, atualiza o `.env` e a envia ao painel.
  Levou **menos de 4 minutos** no teste de reboot de 07/08.

---

## 3. O que foi feito em 2026-08-07 (concluído e verificado)

Script usado: [`scripts/janela-manutencao-vps.sh`](../scripts/janela-manutencao-vps.sh)
(subcomandos `check` / `fix` / `rollback` / `pre-reboot` / `reboot --confirmo` /
`pos-reboot`).

### 3.1 Ingress do túnel corrigido — Mission Control saiu do 502

O catch-all de `openclaw.hktcstore.com.br` apontava para `http://100.110.4.56:18789`
(o IP tailscale da própria máquina), mas o gateway escuta **só em loopback**.
Trocado por `http://127.0.0.1:18789` em `/etc/cloudflared/config.yml`.

**Prova:** a rota externa saiu de **502 → 200**; nenhuma outra rota mudou.

| Rota | Antes | Depois |
|---|---|---|
| `https://openclaw.hktcstore.com.br/` | 502 | **200** |
| `.../supervisora/` | 404 | 404 |
| `.../api/messages` | 502 | 502 (ver §4) |
| `.../hermes-api/` | 404 | 404 |
| `https://monitor.hktcstore.com.br/` | 200 | 200 |

Os `404` são **saudáveis**: significam que a requisição chegou na aplicação de
destino e ela respondeu. `502` é o cloudflared não conseguindo alcançar o destino.

**Backup:** `/etc/cloudflared/config.yml.bak-20260807-104852`
**Desfazer:** `bash /root/janela.sh rollback` (restaura e religa o túnel), ou
copiar o `.bak` por cima e `systemctl restart cloudflared`.

### 3.2 Colisão de porta eliminada — a Lívia agora sobrevive a um reboot

**Três** units tentavam ocupar `127.0.0.1:18789` no boot:

| Nível | Unit | Estado antes | Ação |
|---|---|---|---|
| sistema | `openclaw-gateway.service` | enabled, **rodando** | mantida |
| usuário (`openclaw`) | `openclaw-gateway.service` | enabled, parada | **desabilitada** |
| usuário (`openclaw`) | `openclaw-node.service` (v2026.4.8, parada desde 22/06) | enabled, parada | **desabilitada** |

Enquanto ninguém reiniciava, isso era invisível. Num boot viraria uma corrida
pela porta, com resultado diferente a cada vez — e se o perdedor fosse o gateway,
a Lívia e o Mission Control cairiam por um motivo quase impossível de achar
depois. Tem cara de migração antiga (`openclaw-node` → `openclaw-gateway`) em
que ninguém desmarcou o serviço velho do boot.

**Desfazer** (só se houver motivo — o padrão é ficar como está):

```bash
U="sudo -u openclaw XDG_RUNTIME_DIR=/run/user/1000 systemctl --user"; $U enable openclaw-node.service; $U enable openclaw-gateway.service
```

### 3.3 Reboot testado — depois de 134 dias de uptime

Tudo voltou sozinho: os 4 serviços principais, as 5 rotas idênticas à foto
anterior, gateway e bridge respondendo 200. O quick tunnel da Lívia trocou de
endereço (`rosa-found-rapid-vampire` → `wide-manual-handled-garden`) e **o
heartbeat corrigiu sozinho** antes da primeira conferência — a autocorreção
descrita no §2 deixou de ser teoria.

`supervisora-bridge` (3001) e `hermes-gateway` (8642) são units **de usuário** e
só voltam porque `Linger=yes` está ligado no usuário `openclaw`. **Conferir isso
antes de qualquer reboot futuro** — sem linger, esses dois não sobem.

### 3.4 Mission Control abrindo no lugar certo (mudança no app)

`instances.ingress_url` guarda o endereço do **bridge da Lívia**, e o
`heartbeat` o reescreve a cada 4 minutos. O Mission Control e o botão "Abrir
OpenClaw" liam esse mesmo campo — então abriam no bridge e recebiam
`{"error": "not found"}`, porque o bridge só atende dois caminhos.

Um campo, dois destinos diferentes. Corrigido com coluna própria:

- `supabase/migrations/20260807000000_openclaw_dashboard_url.sql` — cria
  `instances.openclaw_dashboard_url` (que o heartbeat **não** toca) e a preenche
  com `https://openclaw.hktcstore.com.br`.
- `supabase/functions/openclaw-dashboard-url/index.ts` e
  `supabase/functions/openclaw-ws-url/index.ts` — passam a usar a coluna nova,
  com fallback para `ingress_url` (instalação antiga não quebra).

**Migration aplicada e funções publicadas em 07/08.** Verificado: o botão abre o
painel do OpenClaw de verdade (`openclaw.hktcstore.com.br/chat?session=main`).

### 3.5 Numeração de migrations

`20260806000000_chat_realtime.sql` foi renumerada para `20260806010000` porque
colidia com `20260806000000_acesso_allowlist.sql` — o histórico de migrations
usa a versão como chave única e o `db push` falhou com
`duplicate key value violates unique constraint "schema_migrations_pkey"`.
**Ao criar duas migrations no mesmo dia, use horas diferentes no nome.**

---

## 4. ❌ O que continua em falha: porta 3978 (Teams)

**Sintoma:** `https://openclaw.hktcstore.com.br/api/messages` responde **502**.

**Já estava assim antes da janela de 07/08** — não é efeito de nada que fizemos,
e a janela não mudou esse número nem para melhor nem para pior.

**O que já foi apurado:**

- `/etc/cloudflared/config.yml` tem a regra
  `hostname: openclaw.hktcstore.com.br, path: /api/messages → http://127.0.0.1:3978`.
- **Nada escuta na porta 3978** (`ss -ltnp` não retorna nada para ela).
- **Nenhuma unit systemd menciona 3978**, nem em `/etc/systemd/system/` nem em
  `/home/openclaw/.config/systemd/user/`.
- As outras rotas de path do mesmo hostname (`/supervisora/*` → 3001 e
  `/hermes-api/*` → 8642) respondem 404, o que prova que o **mecanismo de
  roteamento funciona**. O problema é o destino não existir.
- 3978 é a porta padrão do Bot Framework (bots do Teams).
- Existe um `demanda-aprovacao-watcher.service` **rodando** (unit de usuário),
  descrito como "Watcher realtime - fluxo de aprovacao de demandas do Daniel".

**A hipótese principal:** o fluxo de aprovação do Daniel migrou de um bot HTTP
(que escutava em 3978) para o watcher em tempo real, e a regra do túnel ficou
para trás — órfã. Se for isso, a correção é **remover a regra**, não ressuscitar
o serviço.

**A hipótese alternativa:** o bot deveria existir, morreu em algum momento e
ninguém percebeu — inclusive porque não havia nada monitorando.

### Por onde começar

1. **Perguntar antes de mexer.** Quem usa o fluxo de aprovação do Daniel ainda
   recebe os cards no Teams? Se sim, ele já roda por outro caminho e a regra é
   lixo. Se não, alguém está sem um serviço e não sabe. Essa resposta decide
   tudo e não custa nada.
2. Procurar rastro do serviço na máquina (leitura, seguro):
   ```bash
   grep -rl 3978 /home/openclaw /etc/systemd /opt 2>/dev/null | head -20; echo "--- crontab:"; crontab -u openclaw -l | grep -iE 'teams|bot|3978'
   ```
3. Ver desde quando não há registro dele:
   ```bash
   journalctl --since '90 days ago' | grep -iE '3978|botframework|teams' | tail -30
   ```
4. Conferir o watcher que está vivo, para saber se ele já cobre o fluxo:
   ```bash
   sudo -u openclaw XDG_RUNTIME_DIR=/run/user/1000 systemctl --user status demanda-aprovacao-watcher.service --no-pager -l | head -30
   ```

Se a conclusão for "regra órfã", remover as 3 linhas de `/api/messages` do
`config.yml` — e fazer isso **com o mesmo cuidado da janela**: backup, validar
com `cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate`,
recarregar, medir as rotas antes e depois.

---

## 5. Outras pendências (nenhuma é falha)

| Item | Situação | Caminho |
|---|---|---|
| **Latência da Lívia** (~15-20s por resposta) | Esperado e **já medido — não reinvestigar** | Sobe um processo `openclaw agent` por mensagem: ~5s de runtime + ~10s do turn. `--session-key` **não** acelera (13,9s vs 13,7s). WebSocket direto economizaria só os ~5s ao custo de implementar o protocolo do gateway — **decidido não fazer**. O alvo barato é enxugar o prompt gigante que `chat-send-message` monta por mensagem (protocolo de write, few-shots, contexto de tools, 8 mensagens de histórico): corta tempo e custo junto. |
| `heartbeat.sh` loga HTTP 204 como anomalia | Cosmético | A função `heartbeat` responde 204; o script só trata 200/201 como OK. |
| Segredos em texto no wizard de onboarding | Aberto, fora do escopo desta demanda | Chaves devem entrar por secret/cofre, não pelo wizard (que grava em texto puro). |
| `cost-monitor-daily` (cron de produção) em `error (3x)` | Observado em 06/08, não investigado | Não tem relação com a Lívia. |

---

## 6. Diagnóstico rápido

**"A Lívia não responde" ou "Mission Control não faz nada"** — conferir **nesta
ordem**, porque a causa mais comum não está no código:

1. A tabela `instances` do Supabase tem linha, e `last_heartbeat` é de **menos de
   5 minutos** atrás? Sem isso, `chat-send-message` devolve 503 e o Mission
   Control devolve 422. Já derrubou os dois de uma vez.
2. Na VPS:
   ```bash
   systemctl is-active cfo-hooks-bridge cloudflared-cfo; curl -s http://127.0.0.1:18790/healthz; tail -n 20 /home/openclaw/.agente-cfo/logs/bridge.log
   ```

No `bridge.log`, um turn saudável é
`dispatch run_id=panel_…` → `done … rc=0` → `reply … http=204 status=sent`.
Onde a sequência para diz o que quebrou:

| Sintoma | Causa |
|---|---|
| "Lívia está offline" no chat | `last_heartbeat` velho — ver o cron `*/4` e o `INSTANCE_ID` no `.env` |
| sem `dispatch` | o painel não alcançou a VPS — túnel caiu ou a URL no painel está velha |
| `rc` ≠ 0 | o `stderr` no log aponta (modelo, chave da Anthropic) |
| `reply … http=401` | `PANEL_TOKEN` diferente de `panel_config.panel_token` |
| resposta só aparece com F5 | Realtime — ver `20260806010000_chat_realtime.sql` |

**Estado do túnel e das rotas, a qualquer momento** (só leitura):

```bash
bash /root/janela.sh check
```

---

## 7. Serviços e portas da VPS

| Porta | Serviço | Nível | Volta no boot? |
|---|---|---|---|
| 18789 | `openclaw-gateway.service` | sistema | ✅ enabled |
| 18790 | `cfo-hooks-bridge.service` (bridge da Lívia) | sistema | ✅ enabled |
| — | `cloudflared.service` (túnel **nomeado**, produção) | sistema | ✅ enabled |
| — | `cloudflared-cfo.service` (quick tunnel da Lívia) | sistema | ✅ enabled |
| 3000 | `grafana-server.service` (`monitor.hktcstore.com.br`) | sistema | ✅ enabled |
| 3001 | `supervisora-bridge.service` | **usuário** | ✅ via `Linger=yes` |
| 8642 | `hermes-gateway.service` | **usuário** | ✅ via `Linger=yes` |
| — | `demanda-aprovacao-watcher.service` | **usuário** | ✅ via `Linger=yes` |
| — | `cloudflared-hermes-api.service` | **usuário** | ✅ via `Linger=yes` |
| **3978** | **nada** | — | ❌ **ver §4** |

Regras de ingress em `/etc/cloudflared/config.yml` (túnel `e95a968e-…`):
`openclaw.hktcstore.com.br` com `/supervisora/*`→3001, `/api/messages`→3978,
`/hermes-api/*`→8642 e catch-all→18789; `monitor.hktcstore.com.br`→3000; e um
`http_status:404` final.

### Antes de qualquer reboot futuro

O checklist óbvio (serviços ativos e habilitados) **não bastou** — foi o que
quase deixou passar a colisão da porta 18789. Levantar também:

```bash
loginctl show-user openclaw -p Linger
for p in 3000 3001 3978 8642 18789 18790; do pid=$(ss -ltnp 2>/dev/null | grep ":$p " | grep -oP 'pid=\K[0-9]+' | head -1); if [ -z "$pid" ]; then echo "porta $p -> NADA ESCUTANDO"; else echo "porta $p -> pid $pid ($(cat /proc/$pid/comm 2>/dev/null)) unidade: $(grep -o '[a-zA-Z0-9@._-]*\.service' /proc/$pid/cgroup 2>/dev/null | head -1 || echo 'FORA-DO-SYSTEMD')"; fi; done
sudo -u openclaw XDG_RUNTIME_DIR=/run/user/1000 systemctl --user list-unit-files --state=enabled --no-pager
```

O que procurar: `Linger=no` (units de usuário não voltam), processos
`FORA-DO-SYSTEMD` (não voltam), e units **`enabled` porém paradas** — essas não
aparecem hoje e sobem no boot, que foi exatamente o caso do `openclaw-node`.

---

## 8. Segredos: onde cada um mora

Nenhum valor está neste arquivo nem deve ser colado em conversa.

| Segredo | Onde | Observação |
|---|---|---|
| `PANEL_TOKEN` | tabela `panel_config`, `id=1` (Supabase) e `~/.agente-cfo/.env` na VPS | fonte da verdade é a tabela; **não existe** secret `PANEL_TOKEN` no projeto |
| `HOOKS_TOKEN`, `INGRESS_URL`, `INSTANCE_ID` | `~/.agente-cfo/.env` (chmod 600) | o `INGRESS_URL` é reescrito pelo heartbeat |
| Chave da Anthropic | env do gateway (`/home/openclaw/.hermes/.env`, `.openclaw/.env`) | ⚠️ **nunca** pelo wizard de onboarding, que grava em texto puro |
| Token do dashboard | `instances.openclaw_dashboard_token` | ⚠️ o `setup.sh` original tem bug: lê `gateway.token`, mas o token mora em `gateway.auth.token` |
| Senha do servidor / do banco | com o Rodrigo | acesso à VPS é por senha; não há chave SSH |

---

## 9. Leitura complementar

- [`livia-vps-bridge.md`](livia-vps-bridge.md) — o desenho da integração e **por
  que** cada decisão foi tomada. Leia antes de propor mudar a arquitetura: as
  três decisões não-óbvias (bridge posta a resposta, reescrita de workspace,
  `HOME` isolado) existem para não tocar na produção.
- [`../scripts/janela-manutencao-vps.sh`](../scripts/janela-manutencao-vps.sh) —
  o script da janela, com o baseline de 07/08 nos comentários.
- Commit `7eff3a0` — tudo desta janela.
