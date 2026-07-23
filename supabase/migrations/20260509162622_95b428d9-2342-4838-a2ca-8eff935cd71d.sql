-- user_onboarding: estado do wizard por usuário
CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_id uuid PRIMARY KEY,
  current_step integer NOT NULL DEFAULT 1,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_select_own" ON public.user_onboarding
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "user_insert_own" ON public.user_onboarding
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_update_own" ON public.user_onboarding
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "service_role_all_onb" ON public.user_onboarding
  FOR ALL USING (auth.role() = 'service_role');

-- installer_tokens: tokens one-time pra setup-installer
CREATE TABLE IF NOT EXISTS public.installer_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  used_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.installer_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_tokens" ON public.installer_tokens
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "user_select_own_tokens" ON public.installer_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- updated_at trigger pra user_onboarding
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS user_onboarding_touch ON public.user_onboarding;
CREATE TRIGGER user_onboarding_touch
  BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();