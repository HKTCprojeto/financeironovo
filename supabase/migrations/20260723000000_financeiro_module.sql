-- Módulo Financeiro HKTC — gastos fixos/variáveis com travas (portado do index.html legado).
-- Dados por usuário (RLS em auth.uid() = user_id). Valores sempre em centavos (bigint), nunca float.

-- ---------- categorias ----------
CREATE TABLE IF NOT EXISTS public.fin_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nome text NOT NULL,
  natureza text NOT NULL CHECK (natureza IN ('fixa','variavel')),
  cor text NOT NULL DEFAULT '#2f6fb0',
  teto_padrao_centavos bigint,
  arquivada boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fin_categorias ENABLE ROW LEVEL SECURITY;

-- ---------- despesas ----------
CREATE TABLE IF NOT EXISTS public.fin_despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  descricao text NOT NULL DEFAULT '',
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  tipo text NOT NULL CHECK (tipo IN ('fixa','variavel')),
  categoria_id uuid REFERENCES public.fin_categorias(id) ON DELETE SET NULL,
  mes_ref text NOT NULL,                 -- 'YYYY-MM'
  data date NOT NULL DEFAULT current_date,
  justificativa text,                    -- preenchida quando fura trava flexível
  excluido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fin_despesas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS fin_despesas_user_mes_idx ON public.fin_despesas (user_id, mes_ref) WHERE excluido = false;

-- ---------- limites / travas ----------
CREATE TABLE IF NOT EXISTS public.fin_limites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  escopo text NOT NULL CHECK (escopo IN ('categoria','totalFixas','totalVariaveis','totalGeral')),
  alvo uuid REFERENCES public.fin_categorias(id) ON DELETE CASCADE,  -- categoria alvo (quando escopo='categoria')
  limite_centavos bigint NOT NULL CHECK (limite_centavos >= 0),
  modo text NOT NULL DEFAULT 'soft' CHECK (modo IN ('hard','soft')),
  limiar_hard_pct numeric,               -- soft: acima deste % do teto, escala para bloqueio
  alertas_pct jsonb NOT NULL DEFAULT '[80]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fin_limites ENABLE ROW LEVEL SECURITY;

-- ---------- auditoria ----------
CREATE TABLE IF NOT EXISTS public.fin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tipo text NOT NULL,
  detalhe text,
  entidade_ref uuid,
  valor_antes_centavos bigint,
  valor_depois_centavos bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fin_audit ENABLE ROW LEVEL SECURITY;

-- ---------- RLS: cada usuário só enxerga/edita o próprio ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fin_categorias','fin_despesas','fin_limites','fin_audit'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "fin_select_own" ON public.%I', t);
    EXECUTE format('CREATE POLICY "fin_select_own" ON public.%I FOR SELECT TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS "fin_insert_own" ON public.%I', t);
    EXECUTE format('CREATE POLICY "fin_insert_own" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS "fin_update_own" ON public.%I', t);
    EXECUTE format('CREATE POLICY "fin_update_own" ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS "fin_delete_own" ON public.%I', t);
    EXECUTE format('CREATE POLICY "fin_delete_own" ON public.%I FOR DELETE TO authenticated USING (auth.uid() = user_id)', t);
    EXECUTE format('DROP POLICY IF EXISTS "fin_service_all" ON public.%I', t);
    EXECUTE format('CREATE POLICY "fin_service_all" ON public.%I FOR ALL USING (auth.role() = ''service_role'')', t);
  END LOOP;
END $$;

-- ---------- updated_at trigger (reusa public.touch_updated_at se existir; senão cria) ----------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fin_categorias','fin_despesas','fin_limites'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', t, t);
  END LOOP;
END $$;
