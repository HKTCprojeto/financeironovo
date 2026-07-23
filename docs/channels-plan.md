# Plano de Canais — Sprint 33+

## Objetivo

Tudo que o user faz no `/chat` web precisa também funcionar via WhatsApp e
Telegram. Pareamento de canais 100% pelo painel — **sem SSH, sem editar
arquivo no servidor, sem rodar comando manual**.

A Lívia (CFO virtual) é o mesmo cérebro em qualquer canal: mesmo histórico,
mesmas tools, mesmas regras de confirmação. O canal é só transporte.

## Channels suportados (meta)

| Canal | Status hoje | Pareamento | Prioridade |
|-------|-------------|------------|------------|
| `/chat` painel web | ✅ funciona (SSE via `chat-stream`) | login Supabase | em uso |
| WhatsApp via Evolution API | 🟡 estrutura existe (Sprint 27) | QR no painel — **falta validar** | **alta** |
| Telegram nativo | ❌ não existe | bot token (sem QR) | média |
| OpenClaw nativo (WhatsApp/Discord/Slack) | ❌ não habilitado | depende do gateway | baixa |

## Princípio plug-and-play

Um único fluxo no painel:

1. **Settings → Canais → Adicionar canal**
2. Escolhe tipo (WhatsApp / Telegram / …)
3. Pra cada tipo:
   - **Form de credencial** (ex: Telegram bot token) **OU**
   - **Botão "Parear"** que abre QR code dentro do painel (WhatsApp via
     Evolution)
4. Painel salva credencial em `vault.secrets` + registro em
   `channel_instances`
5. Daemon `cfo-channels-sync` (novo, roda na VPS) detecta canais ativos via
   query no Supabase e (re)configura no OpenClaw — sem intervenção humana

Nenhum passo exige SSH, edição de `config.toml` no servidor, ou cópia de
token via terminal.

## Componentes a construir

### Frontend (painel)

- `/_authenticated/settings/channels.tsx` — lista de canais + botão "Adicionar"
- `<ChannelCard />` — status (online/offline/pareando), última atividade,
  botão remover
- `<PairWhatsAppDialog />` — exibe QR retornado pela Evolution, faz polling
  de status até "connected"
- `<PairTelegramDialog />` — form de bot token + validação ao vivo (chama
  `/getMe` da API do Telegram)

### Backend (Edge Functions)

- `channels-list` — lista canais do user
- `channels-create` — cria registro + dispara pareamento
- `channels-delete` — remove canal + revoga credencial no vault
- `channels-pair-whatsapp` — pede QR à Evolution, retorna pro front
- `channels-pair-telegram` — valida bot token, registra webhook
- `channels-status` — polling de status de pareamento

### Database

```sql
create table public.channel_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel_type text not null check (channel_type in ('whatsapp', 'telegram', 'openclaw_native')),
  display_name text not null,
  status text not null default 'pending' check (status in ('pending', 'pairing', 'online', 'offline', 'error')),
  vault_secret_id uuid,                -- referência opaca no vault
  external_id text,                    -- instance id na Evolution / chat id no Telegram
  metadata jsonb default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.channel_instances enable row level security;
create policy "user_owns_channel" on public.channel_instances
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Daemon (VPS)

`cfo-channels-sync` (Deno ou Node, roda como systemd unit):

- Subscribe em `channel_instances` via Supabase Realtime
- Quando `status='online'` aparece, registra rota no OpenClaw gateway
  (`POST /admin/channels`)
- Quando deletado, remove do gateway
- Heartbeat a cada 30s pra atualizar `last_seen_at`

## Critério de aceite (Sprint 33)

- [ ] User cria canal WhatsApp pelo painel, escaneia QR, manda mensagem pro
      número, Lívia responde
- [ ] User cria canal Telegram, cola bot token, manda `/start` no bot,
      Lívia responde
- [ ] Histórico unificado: mensagem do WhatsApp aparece no `/chat` web
      (mesmo `thread_id` por user+canal, ou agrupamento visível)
- [ ] Remover canal pelo painel revoga credencial e para de receber
      mensagens em < 10s
- [ ] Zero comandos no terminal da VPS

## Fora de escopo (Sprint 33)

- OpenClaw nativo (Discord/Slack/WhatsApp via gateway) — Sprint 34+
- Roteamento avançado (regra "alertas críticos só no WhatsApp") — Sprint 35+
- Multi-instância por canal (vários números WhatsApp no mesmo user) — backlog

---

**Spec only — não implementar nesta sprint.**
