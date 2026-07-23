-- panel_config: token compartilhado VPS <-> painel (single-tenant), sem secret manual.
-- O setup-installer gera/lê esse token e o injeta no .install_env.sh da VPS;
-- validatePanelToken (edge) valida o header X-Panel-Token contra ele (fallback do
-- secret PANEL_TOKEN). Assim a instalação roda ponta-a-ponta, sem colar secret.
create table if not exists public.panel_config (
  id smallint primary key default 1,
  panel_token text not null,
  created_at timestamptz not null default now(),
  constraint panel_config_single_row check (id = 1)
);

-- Apenas service_role (edge functions) acessa. anon/authenticated NÃO leem o token.
alter table public.panel_config enable row level security;
revoke all on public.panel_config from anon, authenticated;
