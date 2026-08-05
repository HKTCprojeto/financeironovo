-- Orçamento com teto, aviso e bloqueio.
--
-- O sistema todo responde "quanto gastamos"; nenhuma tela respondia "quanto
-- podíamos gastar". O módulo legado tinha isso (fin_limites, com modo
-- hard/soft), mas era por usuário e apontava para fin_categorias — não serve
-- para pagamentos, que são dado da empresa sobre fin_rubricas.
--
-- Aqui o teto é da EMPRESA, como o resto do módulo de pagamentos.

CREATE TABLE IF NOT EXISTS public.fin_orcamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Em que recorte o teto vale. 'total' ignora `alvo`.
  escopo          text NOT NULL CHECK (escopo IN ('total', 'departamento', 'grupo', 'rubrica')),
  -- Nome do departamento, nome do grupo (nível 1) ou código da rubrica.
  alvo            text,

  limite_centavos bigint NOT NULL CHECK (limite_centavos >= 0),

  -- aviso: deixa passar e sinaliza. bloqueio: recusa a escrita.
  modo            text NOT NULL DEFAULT 'aviso' CHECK (modo IN ('aviso', 'bloqueio')),
  -- A partir de quantos % do teto a tela começa a alertar.
  alerta_pct      smallint NOT NULL DEFAULT 80 CHECK (alerta_pct BETWEEN 1 AND 100),

  -- NULL = vale para todo mês (recorrente). Preenchido = só naquele mês, e
  -- nesse caso tem precedência sobre o recorrente do mesmo escopo/alvo.
  mes_ref         text,

  ativo           boolean NOT NULL DEFAULT true,
  observacao      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- 'total' não tem alvo; os demais exigem.
  CONSTRAINT fin_orcamentos_alvo_coerente CHECK (
    (escopo = 'total' AND alvo IS NULL) OR (escopo <> 'total' AND alvo IS NOT NULL)
  )
);

-- Um teto por combinação. O índice trata NULL como valor para o par
-- (escopo, alvo) recorrente não colidir com o do mês específico.
CREATE UNIQUE INDEX IF NOT EXISTS fin_orcamentos_unico
  ON public.fin_orcamentos (escopo, COALESCE(alvo, ''), COALESCE(mes_ref, ''));

ALTER TABLE public.fin_orcamentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fin_orcamentos_select ON public.fin_orcamentos;
CREATE POLICY fin_orcamentos_select ON public.fin_orcamentos
  FOR SELECT TO authenticated USING (true);

-- Definir teto é decisão de gestão: só o admin escreve. Os demais enxergam o
-- quanto já foi consumido, mas não mudam o combinado.
DROP POLICY IF EXISTS fin_orcamentos_admin ON public.fin_orcamentos;
CREATE POLICY fin_orcamentos_admin ON public.fin_orcamentos
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS fin_orcamentos_service ON public.fin_orcamentos;
CREATE POLICY fin_orcamentos_service ON public.fin_orcamentos
  FOR ALL USING (auth.role() = 'service_role');

-- Mudança de teto também é auditada (a função vem de 20260803000000).
DROP TRIGGER IF EXISTS trg_audit_fin_orcamentos ON public.fin_orcamentos;
CREATE TRIGGER trg_audit_fin_orcamentos
  AFTER INSERT OR UPDATE OR DELETE ON public.fin_orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.fin_audit('orcamento');


-- ---------------------------------------------------------------------------
-- Bloqueio
-- ---------------------------------------------------------------------------
-- Recusa a escrita quando ela faria o mês estourar um teto em modo 'bloqueio'.
--
-- Só vale para escrita de usuário: carga em massa entra por service_role e
-- passa direto, senão uma importação de 110 lançamentos travaria no meio.
--
-- Em UPDATE, só entra quando muda o VALOR ou a CLASSIFICAÇÃO. Dar baixa
-- (status, data_pagamento) nunca é bloqueado -- seria absurdo impedir de
-- registrar um pagamento que já aconteceu no mundo real só porque o mês
-- estourou.

CREATE OR REPLACE FUNCTION public.fin_checa_orcamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grupo   text;
  v_orc     record;
  v_gasto   bigint;
  v_antigo  bigint := 0;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.valor_centavos = OLD.valor_centavos
       AND NEW.departamento IS NOT DISTINCT FROM OLD.departamento
       AND NEW.rubrica_codigo = OLD.rubrica_codigo
       AND NEW.mes_ref = OLD.mes_ref THEN
      RETURN NEW;
    END IF;
    -- o valor que já estava contabilizado sai da conta antes de somar o novo
    IF NEW.mes_ref = OLD.mes_ref THEN
      v_antigo := OLD.valor_centavos;
    END IF;
  END IF;

  SELECT nivel1_nome INTO v_grupo
    FROM public.fin_rubricas WHERE codigo = NEW.rubrica_codigo;

  -- Percorre os tetos que se aplicam a este lançamento. DISTINCT ON garante
  -- que o teto do mês específico ganhe do recorrente no mesmo escopo/alvo.
  FOR v_orc IN
    SELECT DISTINCT ON (escopo, alvo) escopo, alvo, limite_centavos
      FROM public.fin_orcamentos
     WHERE ativo
       AND modo = 'bloqueio'
       AND (mes_ref = NEW.mes_ref OR mes_ref IS NULL)
       AND (
         escopo = 'total'
         OR (escopo = 'departamento' AND alvo IS NOT DISTINCT FROM NEW.departamento)
         OR (escopo = 'grupo'        AND alvo = v_grupo)
         OR (escopo = 'rubrica'      AND alvo = NEW.rubrica_codigo)
       )
     ORDER BY escopo, alvo, mes_ref NULLS LAST
  LOOP
    SELECT COALESCE(SUM(p.valor_centavos), 0) INTO v_gasto
      FROM public.fin_pagamentos p
      LEFT JOIN public.fin_rubricas r ON r.codigo = p.rubrica_codigo
     WHERE p.mes_ref = NEW.mes_ref
       AND p.id <> NEW.id
       AND CASE v_orc.escopo
             WHEN 'total'        THEN true
             WHEN 'departamento' THEN p.departamento IS NOT DISTINCT FROM v_orc.alvo
             WHEN 'grupo'        THEN r.nivel1_nome = v_orc.alvo
             ELSE p.rubrica_codigo = v_orc.alvo
           END;

    IF v_gasto + NEW.valor_centavos > v_orc.limite_centavos THEN
      RAISE EXCEPTION
        'Bloqueado pelo orçamento de % (%): o mês % ficaria em R$ %, acima do teto de R$ %.',
        v_orc.escopo,
        COALESCE(v_orc.alvo, 'geral'),
        NEW.mes_ref,
        to_char((v_gasto + NEW.valor_centavos) / 100.0, 'FM999G999G990D00'),
        to_char(v_orc.limite_centavos / 100.0, 'FM999G999G990D00')
      USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fin_checa_orcamento() IS
  'Recusa INSERT/UPDATE em fin_pagamentos que estoure teto em modo bloqueio. Ignora service_role e mudanças que não alteram valor nem classificação.';

DROP TRIGGER IF EXISTS trg_orcamento_fin_pagamentos ON public.fin_pagamentos;
CREATE TRIGGER trg_orcamento_fin_pagamentos
  BEFORE INSERT OR UPDATE ON public.fin_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.fin_checa_orcamento();
