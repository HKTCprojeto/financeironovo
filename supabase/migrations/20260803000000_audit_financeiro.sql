-- Auditoria do módulo financeiro.
--
-- Até aqui a audit_log só era escrita por Edge Functions do template (tokens
-- de integração e comandos de VPS) — nada do financeiro deixava rastro. Num
-- sistema de contas a pagar o que mais importa é justamente o que faltava:
-- quem criou, alterou ou baixou um pagamento, e quanto era antes.
--
-- Feito por TRIGGER e não no app de propósito: pega qualquer caminho de
-- escrita (tela, Edge Function, SQL Editor) e não tem como esquecer de chamar.
--
-- SECURITY DEFINER é obrigatório: a RLS da audit_log só permite INSERT a
-- service_role, então sem isso a gravação seria silenciosamente descartada
-- quando um usuário comum alterasse um pagamento pela tela.

CREATE OR REPLACE FUNCTION public.fin_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rotulo   text := TG_ARGV[0];
  v_action   text;
  v_payload  jsonb;
  v_old      jsonb;
  v_new      jsonb;
  v_mudancas jsonb := '{}'::jsonb;
  v_campo    text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action  := v_rotulo || '_criado';
    v_payload := jsonb_build_object('registro', to_jsonb(NEW));

  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    -- Só os campos que realmente mudaram, cada um com o antes e o depois.
    FOR v_campo IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_old -> v_campo IS DISTINCT FROM v_new -> v_campo THEN
        v_mudancas := v_mudancas || jsonb_build_object(
          v_campo,
          jsonb_build_object('de', v_old -> v_campo, 'para', v_new -> v_campo)
        );
      END IF;
    END LOOP;
    -- UPDATE que não muda nada (ex.: salvar o form sem editar) não vira ruído.
    IF v_mudancas = '{}'::jsonb THEN
      RETURN NULL;
    END IF;
    v_action  := v_rotulo || '_alterado';
    v_payload := jsonb_build_object(
      'id',       v_new -> 'id',
      'ref',      COALESCE(v_new ->> 'fornecedor', v_new ->> 'nome'),
      'mudancas', v_mudancas
    );

  ELSE -- DELETE
    v_action  := v_rotulo || '_excluido';
    v_payload := jsonb_build_object('registro', to_jsonb(OLD));
  END IF;

  INSERT INTO public.audit_log (actor_user_id, action, payload)
  VALUES (auth.uid(), v_action, v_payload);

  RETURN NULL; -- AFTER trigger: o retorno é ignorado
END;
$$;

COMMENT ON FUNCTION public.fin_audit() IS
  'Grava INSERT/UPDATE/DELETE na audit_log. Recebe o rótulo da entidade como argumento (ex.: pagamento).';

DROP TRIGGER IF EXISTS trg_audit_fin_pagamentos ON public.fin_pagamentos;
CREATE TRIGGER trg_audit_fin_pagamentos
  AFTER INSERT OR UPDATE OR DELETE ON public.fin_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.fin_audit('pagamento');

DROP TRIGGER IF EXISTS trg_audit_fin_rubricas ON public.fin_rubricas;
CREATE TRIGGER trg_audit_fin_rubricas
  AFTER INSERT OR UPDATE OR DELETE ON public.fin_rubricas
  FOR EACH ROW EXECUTE FUNCTION public.fin_audit('rubrica');

-- ---------------------------------------------------------------------------
-- Quem pode apagar registro de auditoria
-- ---------------------------------------------------------------------------
-- Só o admin. Os demais continuam apenas consultando (a policy auth_select de
-- 20260724000000 já dá SELECT a todo authenticated e permanece intacta).
--
-- O e-mail do admin fica aqui em vez de numa tabela de papéis porque é o mesmo
-- criterio que a Edge Function admin-invite ja usa (ADMIN_EMAIL). Se um dia
-- houver mais de um admin, trocar esta funcao por consulta a uma tabela.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) = 'rodrigo.coelho@hktc.com.br';
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'True se o JWT em uso for o do admin do sistema.';

DROP POLICY IF EXISTS audit_log_delete_admin ON public.audit_log;
CREATE POLICY audit_log_delete_admin ON public.audit_log
  FOR DELETE TO authenticated
  USING (public.is_admin());
