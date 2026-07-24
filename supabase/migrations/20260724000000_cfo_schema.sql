-- ===================================================================
-- Schema do Agente CFO (Lívia) — recuperado do backend Lovable (kcjmkjgvcflvekltkizh)
-- e adaptado para aplicar no Supabase do time (utowspmmukczjinwgfdv).
-- Ajustes vs. dump original: CREATE ... IF NOT EXISTS, constraints inline,
-- FKs movidas para o fim (ordem de dependência), políticas com DROP IF EXISTS.
-- Não inclui as tabelas fin_* (Financeiro) — essas já existem no projeto do time.
-- ===================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------- FUNCTIONS ----------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;

-- ---------------- SEQUENCES ----------------
CREATE SEQUENCE IF NOT EXISTS public.alerts_history_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.audit_log_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.automation_runs_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.chat_messages_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.dashboard_snapshots_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.events_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.instance_metrics_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.llm_usage_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.marcos_insights_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.omie_errors_id_seq;
CREATE SEQUENCE IF NOT EXISTS public.whatsapp_status_id_seq;

-- ---------------- TABLES ----------------
CREATE TABLE IF NOT EXISTS public.alerts_config (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL,
  condition jsonb DEFAULT '{}'::jsonb NOT NULL,
  channels jsonb DEFAULT '["panel"]'::jsonb NOT NULL,
  cooldown_min integer DEFAULT 30 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.alerts_history (
  id bigint DEFAULT nextval('alerts_history_id_seq'::regclass) NOT NULL PRIMARY KEY,
  alert_id uuid,
  triggered_at timestamptz DEFAULT now() NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'fired'::text NOT NULL,
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigint DEFAULT nextval('audit_log_id_seq'::regclass) NOT NULL PRIMARY KEY,
  actor_user_id uuid,
  action text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.automations (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  description text,
  trigger jsonb NOT NULL,
  conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
  actions jsonb DEFAULT '[]'::jsonb NOT NULL,
  active boolean DEFAULT true NOT NULL,
  require_confirmation boolean DEFAULT true NOT NULL,
  template_key text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id bigint DEFAULT nextval('automation_runs_id_seq'::regclass) NOT NULL PRIMARY KEY,
  automation_id uuid,
  status text NOT NULL,
  trigger_payload jsonb,
  steps jsonb DEFAULT '[]'::jsonb NOT NULL,
  result jsonb,
  error text,
  confirmation_token text,
  confirmation_message_id text,
  started_at timestamptz DEFAULT now() NOT NULL,
  finished_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.cfo_write_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  instance_id text,
  channel text NOT NULL,
  thread_id text NOT NULL,
  run_id text,
  action text NOT NULL,
  erp text,
  erp_record_id text,
  amount numeric,
  supplier text,
  due_date date,
  category text,
  raw_text text,
  dedup_key text UNIQUE,
  status text DEFAULT 'success'::text NOT NULL CHECK (status = ANY (ARRAY['success'::text, 'error'::text, 'duplicate'::text])),
  error text,
  confirmed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  origin text DEFAULT 'chat'::text NOT NULL CHECK (origin = ANY (ARRAY['chat'::text, 'erp_sync'::text, 'manual'::text, 'reconciliation'::text, 'system'::text]))
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id bigint DEFAULT nextval('chat_messages_id_seq'::regclass) NOT NULL PRIMARY KEY,
  thread_id text NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'marcos'::text, 'system'::text])),
  content text NOT NULL,
  status text DEFAULT 'sent'::text CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'error'::text, 'streaming'::text, 'expired'::text, 'cancelled'::text])),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  channel text DEFAULT 'panel'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.dashboard_snapshots (
  id bigint DEFAULT nextval('dashboard_snapshots_id_seq'::regclass) NOT NULL PRIMARY KEY,
  data jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz DEFAULT (now() + '00:05:00'::interval) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.instances (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  hostname text,
  openclaw_version text,
  agente_cfo_version text,
  ingress_url text,
  hooks_token text,
  last_heartbeat timestamptz,
  status text DEFAULT 'unknown'::text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  connected_integrations jsonb DEFAULT '{}'::jsonb NOT NULL,
  openclaw_dashboard_token text,
  system_prompt text
);

CREATE TABLE IF NOT EXISTS public.events (
  id bigint DEFAULT nextval('events_id_seq'::regclass) NOT NULL PRIMARY KEY,
  instance_id uuid NOT NULL,
  type text NOT NULL,
  severity text DEFAULT 'info'::text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.evolution_config (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  base_url text NOT NULL,
  api_key_encrypted text NOT NULL,
  webhook_secret text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  last_test_at timestamptz,
  last_test_status text,
  last_test_detail text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.goals (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  metric text NOT NULL,
  operator text DEFAULT 'gte'::text NOT NULL,
  target_value numeric(14,2) NOT NULL,
  period text DEFAULT 'monthly'::text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.hooks_dedup (
  dedup_key text NOT NULL PRIMARY KEY,
  channel text NOT NULL,
  external_id text NOT NULL,
  source text DEFAULT 'unknown'::text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz DEFAULT (now() + '00:01:00'::interval) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.installer_tokens (
  token text NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  expires_at timestamptz DEFAULT (now() + '00:30:00'::interval) NOT NULL,
  used_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.instance_metrics (
  id bigint DEFAULT nextval('instance_metrics_id_seq'::regclass) NOT NULL PRIMARY KEY,
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  labels jsonb DEFAULT '{}'::jsonb NOT NULL,
  recorded_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  skill_name text NOT NULL UNIQUE,
  credentials_encrypted text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  last_test_at timestamptz,
  last_test_status text,
  last_test_detail text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.llm_usage (
  id bigint DEFAULT nextval('llm_usage_id_seq'::regclass) NOT NULL PRIMARY KEY,
  instance_id uuid NOT NULL,
  session_id text NOT NULL,
  model text DEFAULT 'unknown'::text NOT NULL,
  input_tokens integer DEFAULT 0 NOT NULL,
  output_tokens integer DEFAULT 0 NOT NULL,
  cost_brl numeric(10,2) DEFAULT 0 NOT NULL,
  period character(7) NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.marcos_insights (
  id bigint DEFAULT nextval('marcos_insights_id_seq'::regclass) NOT NULL PRIMARY KEY,
  section text NOT NULL,
  text text NOT NULL,
  severity text DEFAULT 'info'::text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  expires_at timestamptz DEFAULT (now() + '00:30:00'::interval) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.omie_errors (
  id bigint DEFAULT nextval('omie_errors_id_seq'::regclass) NOT NULL PRIMARY KEY,
  instance_id uuid NOT NULL,
  command text,
  http_status integer,
  message text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.panel_config (
  id smallint DEFAULT 1 NOT NULL PRIMARY KEY,
  panel_token text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT panel_config_single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS public.report_issues_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  user_id uuid NOT NULL,
  subject text NOT NULL,
  issue_url text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.scenarios (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  inputs jsonb DEFAULT '{}'::jsonb NOT NULL,
  result jsonb,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.supabase_projects (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  name text NOT NULL,
  project_url text NOT NULL,
  service_role_key_encrypted text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  description text,
  last_test_at timestamptz,
  last_test_status text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.telegram_bots (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  bot_name text NOT NULL,
  bot_username text NOT NULL UNIQUE,
  bot_token_encrypted text NOT NULL,
  webhook_secret text NOT NULL,
  receives_marcos_chat boolean DEFAULT false NOT NULL,
  active boolean DEFAULT true NOT NULL,
  last_test_at timestamptz,
  last_test_status text,
  last_test_detail text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_id uuid NOT NULL PRIMARY KEY,
  current_step integer DEFAULT 1 NOT NULL,
  data jsonb DEFAULT '{}'::jsonb NOT NULL,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  instance_name text NOT NULL UNIQUE,
  display_name text,
  phone_number text,
  status text DEFAULT 'pending'::text NOT NULL,
  qr_code_b64 text,
  receives_marcos_chat boolean DEFAULT false NOT NULL,
  last_seen timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.whatsapp_status (
  id bigint DEFAULT nextval('whatsapp_status_id_seq'::regclass) NOT NULL PRIMARY KEY,
  instance_id uuid NOT NULL,
  status text NOT NULL,
  jid text,
  last_check timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- ---------------- FOREIGN KEYS (após todas as tabelas existirem) ----------------
DO $$ BEGIN
  ALTER TABLE public.alerts_history ADD CONSTRAINT alerts_history_alert_id_fkey FOREIGN KEY (alert_id) REFERENCES public.alerts_config(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.automation_runs ADD CONSTRAINT automation_runs_automation_id_fkey FOREIGN KEY (automation_id) REFERENCES public.automations(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.events ADD CONSTRAINT events_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.instances(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.llm_usage ADD CONSTRAINT llm_usage_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.instances(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.omie_errors ADD CONSTRAINT omie_errors_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.instances(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.report_issues_log ADD CONSTRAINT report_issues_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.whatsapp_status ADD CONSTRAINT whatsapp_status_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.instances(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------- INDEXES ----------------
CREATE INDEX IF NOT EXISTS idx_alerts_history_alert_time ON public.alerts_history USING btree (alert_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON public.automation_runs USING btree (automation_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_runs_pending ON public.automation_runs USING btree (status) WHERE (status = 'pending_confirm'::text);
CREATE INDEX IF NOT EXISTS idx_automation_runs_token ON public.automation_runs USING btree (confirmation_token) WHERE (confirmation_token IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_automations_active_next_run ON public.automations USING btree (active, next_run_at);
CREATE INDEX IF NOT EXISTS idx_cfo_write_events_created ON public.cfo_write_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cfo_write_events_origin ON public.cfo_write_events USING btree (origin, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cfo_write_events_thread ON public.cfo_write_events USING btree (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_thread_idx ON public.chat_messages USING btree (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_thread ON public.chat_messages USING btree (channel, thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dashboard_snapshots_expires_idx ON public.dashboard_snapshots USING btree (expires_at);
CREATE INDEX IF NOT EXISTS events_created_idx ON public.events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS events_instance_idx ON public.events USING btree (instance_id);
CREATE INDEX IF NOT EXISTS events_type_idx ON public.events USING btree (type);
CREATE INDEX IF NOT EXISTS idx_hooks_dedup_expires ON public.hooks_dedup USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_instance_metrics_name_time ON public.instance_metrics USING btree (metric_name, recorded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS instances_hostname_unique ON public.instances USING btree (hostname);
CREATE INDEX IF NOT EXISTS instances_last_heartbeat_idx ON public.instances USING btree (last_heartbeat);
CREATE INDEX IF NOT EXISTS llm_usage_period_idx ON public.llm_usage USING btree (period);
CREATE UNIQUE INDEX IF NOT EXISTS llm_usage_upsert_key ON public.llm_usage USING btree (instance_id, session_id, period);
CREATE INDEX IF NOT EXISTS marcos_insights_expires_idx ON public.marcos_insights USING btree (expires_at);
CREATE INDEX IF NOT EXISTS marcos_insights_section_idx ON public.marcos_insights USING btree (section, created_at DESC);
CREATE INDEX IF NOT EXISTS omie_errors_created_idx ON public.omie_errors USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_issues_log_user_created ON public.report_issues_log USING btree (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_supabase_projects_url ON public.supabase_projects USING btree (project_url);
CREATE INDEX IF NOT EXISTS idx_wa_instances_status ON public.whatsapp_instances USING btree (status);
CREATE INDEX IF NOT EXISTS whatsapp_status_instance_idx ON public.whatsapp_status USING btree (instance_id, created_at DESC);

-- ---------------- TRIGGERS ----------------
DROP TRIGGER IF EXISTS user_onboarding_touch ON public.user_onboarding;
CREATE TRIGGER user_onboarding_touch BEFORE UPDATE ON public.user_onboarding FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------- RLS ----------------
ALTER TABLE public.alerts_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cfo_write_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evolution_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hooks_dedup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installer_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marcos_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.omie_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panel_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_issues_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supabase_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_status ENABLE ROW LEVEL SECURITY;

-- ---------------- RLS POLICIES ----------------
DROP POLICY IF EXISTS auth_all ON public.alerts_config;
CREATE POLICY auth_all ON public.alerts_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS sr_all ON public.alerts_config;
CREATE POLICY sr_all ON public.alerts_config FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS auth_read ON public.alerts_history;
CREATE POLICY auth_read ON public.alerts_history FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS sr_all ON public.alerts_history;
CREATE POLICY sr_all ON public.alerts_history FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS auth_select ON public.audit_log;
CREATE POLICY auth_select ON public.audit_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS service_role_all ON public.audit_log;
CREATE POLICY service_role_all ON public.audit_log FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS authenticated_read ON public.automation_runs;
CREATE POLICY authenticated_read ON public.automation_runs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS service_role_all ON public.automation_runs;
CREATE POLICY service_role_all ON public.automation_runs FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS authenticated_all ON public.automations;
CREATE POLICY authenticated_all ON public.automations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON public.automations;
CREATE POLICY service_role_all ON public.automations FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS auth_select ON public.cfo_write_events;
CREATE POLICY auth_select ON public.cfo_write_events FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS service_role_all ON public.cfo_write_events;
CREATE POLICY service_role_all ON public.cfo_write_events FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS auth_delete_own_thread ON public.chat_messages;
CREATE POLICY auth_delete_own_thread ON public.chat_messages FOR DELETE TO authenticated USING (thread_id = ('panel:'::text || (auth.uid())::text));
DROP POLICY IF EXISTS auth_insert_own_thread ON public.chat_messages;
CREATE POLICY auth_insert_own_thread ON public.chat_messages FOR INSERT TO authenticated WITH CHECK (thread_id = ('panel:'::text || (auth.uid())::text));
DROP POLICY IF EXISTS auth_select ON public.chat_messages;
CREATE POLICY auth_select ON public.chat_messages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS auth_update_own_thread ON public.chat_messages;
CREATE POLICY auth_update_own_thread ON public.chat_messages FOR UPDATE TO authenticated USING (thread_id = ('panel:'::text || (auth.uid())::text)) WITH CHECK (thread_id = ('panel:'::text || (auth.uid())::text));
DROP POLICY IF EXISTS service_role_all ON public.chat_messages;
CREATE POLICY service_role_all ON public.chat_messages FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS auth_select ON public.dashboard_snapshots;
CREATE POLICY auth_select ON public.dashboard_snapshots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS service_role_all ON public.dashboard_snapshots;
CREATE POLICY service_role_all ON public.dashboard_snapshots FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS auth_select ON public.events;
CREATE POLICY auth_select ON public.events FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS service_role_all ON public.events;
CREATE POLICY service_role_all ON public.events FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS authenticated_all ON public.evolution_config;
CREATE POLICY authenticated_all ON public.evolution_config FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON public.evolution_config;
CREATE POLICY service_role_all ON public.evolution_config FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS authenticated_all ON public.goals;
CREATE POLICY authenticated_all ON public.goals FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON public.goals;
CREATE POLICY service_role_all ON public.goals FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS service_role_all ON public.hooks_dedup;
CREATE POLICY service_role_all ON public.hooks_dedup FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS service_role_all_tokens ON public.installer_tokens;
CREATE POLICY service_role_all_tokens ON public.installer_tokens FOR ALL TO public USING (auth.role() = 'service_role'::text);
DROP POLICY IF EXISTS user_select_own_tokens ON public.installer_tokens;
CREATE POLICY user_select_own_tokens ON public.installer_tokens FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS authenticated_read ON public.instance_metrics;
CREATE POLICY authenticated_read ON public.instance_metrics FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS service_role_all ON public.instance_metrics;
CREATE POLICY service_role_all ON public.instance_metrics FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS auth_select ON public.instances;
CREATE POLICY auth_select ON public.instances FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS service_role_all ON public.instances;
CREATE POLICY service_role_all ON public.instances FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS authenticated_all ON public.integration_credentials;
CREATE POLICY authenticated_all ON public.integration_credentials FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON public.integration_credentials;
CREATE POLICY service_role_all ON public.integration_credentials FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS auth_select ON public.llm_usage;
CREATE POLICY auth_select ON public.llm_usage FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS service_role_all ON public.llm_usage;
CREATE POLICY service_role_all ON public.llm_usage FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS auth_select ON public.marcos_insights;
CREATE POLICY auth_select ON public.marcos_insights FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS service_role_all ON public.marcos_insights;
CREATE POLICY service_role_all ON public.marcos_insights FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS auth_select ON public.omie_errors;
CREATE POLICY auth_select ON public.omie_errors FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS service_role_all ON public.omie_errors;
CREATE POLICY service_role_all ON public.omie_errors FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS "users can insert own reports" ON public.report_issues_log;
CREATE POLICY "users can insert own reports" ON public.report_issues_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "users see own reports" ON public.report_issues_log;
CREATE POLICY "users see own reports" ON public.report_issues_log FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS authenticated_all ON public.scenarios;
CREATE POLICY authenticated_all ON public.scenarios FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON public.scenarios;
CREATE POLICY service_role_all ON public.scenarios FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS authenticated_all ON public.supabase_projects;
CREATE POLICY authenticated_all ON public.supabase_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON public.supabase_projects;
CREATE POLICY service_role_all ON public.supabase_projects FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS authenticated_all ON public.telegram_bots;
CREATE POLICY authenticated_all ON public.telegram_bots FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON public.telegram_bots;
CREATE POLICY service_role_all ON public.telegram_bots FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS service_role_all_onb ON public.user_onboarding;
CREATE POLICY service_role_all_onb ON public.user_onboarding FOR ALL TO public USING (auth.role() = 'service_role'::text);
DROP POLICY IF EXISTS user_insert_own ON public.user_onboarding;
CREATE POLICY user_insert_own ON public.user_onboarding FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS user_select_own ON public.user_onboarding;
CREATE POLICY user_select_own ON public.user_onboarding FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS user_update_own ON public.user_onboarding;
CREATE POLICY user_update_own ON public.user_onboarding FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS authenticated_all ON public.whatsapp_instances;
CREATE POLICY authenticated_all ON public.whatsapp_instances FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS service_role_all ON public.whatsapp_instances;
CREATE POLICY service_role_all ON public.whatsapp_instances FOR ALL TO public USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS auth_select ON public.whatsapp_status;
CREATE POLICY auth_select ON public.whatsapp_status FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS service_role_all ON public.whatsapp_status;
CREATE POLICY service_role_all ON public.whatsapp_status FOR ALL TO public USING (auth.role() = 'service_role'::text);
