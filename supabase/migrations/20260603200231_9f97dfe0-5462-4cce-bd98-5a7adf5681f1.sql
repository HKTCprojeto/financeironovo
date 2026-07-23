create table if not exists public.panel_config (
  id smallint primary key default 1,
  panel_token text not null,
  created_at timestamptz not null default now(),
  constraint panel_config_single_row check (id = 1)
);

alter table public.panel_config enable row level security;
revoke all on public.panel_config from anon, authenticated;
grant all on public.panel_config to service_role;