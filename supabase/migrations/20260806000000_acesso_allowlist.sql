-- ============================================================================
-- Lista de autorizados — acesso passa a exigir DUAS coisas:
--   (1) ter conta válida no Auth (já existia), E
--   (2) estar autorizado explicitamente pelo admin (esta migration).
--
-- Motivo: até aqui o RLS era "TO authenticated USING (true)" em ~30 tabelas —
-- qualquer conta autenticada via/edita tudo. Logo, uma conta criada por atalho
-- (painel Supabase "Add user", ou service_role) entrava sem passar pelo convite.
-- Agora, uma conta que NÃO está na lista LOGA mas não vê/grava NADA.
--
-- Como não quebra o que já funciona: em vez de reescrever as políticas
-- existentes, adiciona UMA política RESTRICTIVE por tabela. No Postgres,
-- políticas restritivas são combinadas com E (AND) às permissivas — o efeito
-- vira "regra antiga E is_autorizado()".
--
-- IMPORTANTE: as restritivas são "TO authenticated", então NÃO afetam o
-- service_role (as Edge Functions continuam funcionando normalmente).
--
-- Limite honesto: quem tem a chave service_role / painel Supabase ignora RLS
-- por design (é o root do sistema). Esta trava fecha o caminho realista (criar
-- conta e entrar como usuário), não o root. Toda mudança na lista é auditada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tabela da lista. Chave = e-mail minúsculo (mesmo critério do is_admin()).
--    Só service_role escreve (via Edge Function admin-invite, que valida o
--    admin). anon/authenticated NÃO acessam direto — usam a função is_autorizado.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuarios_autorizados (
  email          text PRIMARY KEY,
  autorizado_por uuid,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usuarios_autorizados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.usuarios_autorizados FROM anon, authenticated;

DROP POLICY IF EXISTS usuarios_autorizados_service ON public.usuarios_autorizados;
CREATE POLICY usuarios_autorizados_service ON public.usuarios_autorizados
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ---------------------------------------------------------------------------
-- 2) Semear o admin ANTES de ligar a trava — garante que ele nunca se tranca.
--    ATENÇÃO: só o admin é semeado. Se HOJE existir outro usuário legítimo
--    (não-admin) no Auth, ele perde acesso quando a trava ligar, até ser
--    (re)convidado pela tela Usuários (que o adiciona à lista). Confirmado em
--    2026-08-05: o único usuário do Auth é o admin — não há ninguém a re-convidar.
--    NÃO fazemos backfill de auth.users DE PROPÓSITO: copiar todos autorizaria em
--    massa qualquer conta-atalho já existente, que é exatamente o que a trava barra.
-- ---------------------------------------------------------------------------
INSERT INTO public.usuarios_autorizados (email, autorizado_por)
VALUES ('rodrigo.coelho@hktc.com.br', NULL)
ON CONFLICT (email) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) is_autorizado(): true se o e-mail do JWT é o admin (failsafe — o dono
--    nunca se tranca, mesmo se a lista falhar) OU está na lista.
--    SECURITY DEFINER: lê a tabela ignorando o RLS dela.
--    STABLE: avaliada uma vez por query (o e-mail do JWT é constante).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_autorizado()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lower(COALESCE(auth.jwt() ->> 'email', '')) = 'rodrigo.coelho@hktc.com.br'
    OR EXISTS (
      SELECT 1 FROM public.usuarios_autorizados
      WHERE email = lower(COALESCE(auth.jwt() ->> 'email', ''))
    );
$$;

COMMENT ON FUNCTION public.is_autorizado() IS
  'True se o JWT em uso é de um usuário autorizado (admin failsafe OU presente em usuarios_autorizados).';

GRANT EXECUTE ON FUNCTION public.is_autorizado() TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4) Auditoria: toda inclusão/remoção na lista vira registro no audit_log.
--    OBS importante: ações pelo app passam pela Edge Function admin-invite
--    (service_role), então auth.uid() aqui é NULL nesses casos — igual a uma
--    alteração feita direto por SQL/painel. Por isso o ator é derivado de
--    autorizado_por quando existir. O registro AUTORITATIVO de quem convidou/
--    removeu é o usuario_convidado/usuario_removido que a própria admin-invite
--    grava (com o id do admin). Este trigger é um BACKSTOP: garante rastro mesmo
--    numa mudança feita direto no banco, onde a admin-invite não passa.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_usuarios_autorizados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (actor_user_id, action, payload)
  VALUES (
    COALESCE(auth.uid(), NEW.autorizado_por, OLD.autorizado_por),
    'autorizacao_' || lower(TG_OP),
    jsonb_build_object('email', COALESCE(NEW.email, OLD.email))
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_usuarios_autorizados ON public.usuarios_autorizados;
CREATE TRIGGER trg_audit_usuarios_autorizados
  AFTER INSERT OR DELETE ON public.usuarios_autorizados
  FOR EACH ROW EXECUTE FUNCTION public.audit_usuarios_autorizados();

-- ---------------------------------------------------------------------------
-- 5) A TRAVA: uma política RESTRICTIVE por tabela que um usuário comum toca.
--    Restritiva = combinada com E às regras existentes → "regra antiga E
--    is_autorizado()". TO authenticated → não toca no service_role.
--    Idempotente (drop + create): pode rodar de novo sem erro.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    -- dados da empresa (hoje SELECT/ALL com USING true)
    'alerts_config','alerts_history','audit_log','automation_runs','automations',
    'cfo_write_events','chat_messages','dashboard_snapshots','events','evolution_config',
    'goals','instance_metrics','instances','integration_credentials','llm_usage',
    'marcos_insights','omie_errors','scenarios','supabase_projects','telegram_bots',
    'whatsapp_instances','whatsapp_status',
    -- financeiro
    'fin_pagamentos','fin_rubricas','fin_orcamentos',
    -- por-usuário (já isoladas por user_id, mas fechamos p/ garantir "não vê nada")
    'user_onboarding','installer_tokens','report_issues_log',
    'fin_categorias','fin_despesas','fin_limites','fin_audit'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('DROP POLICY IF EXISTS exige_autorizado ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY exige_autorizado ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_autorizado()) WITH CHECK (public.is_autorizado())',
      t
    );
  END LOOP;
END $$;
