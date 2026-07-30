-- Libera INSERT e DELETE de pagamentos para o time logado.
-- Necessario para a tela Pagamentos: cadastrar novo pagamento, duplicar
-- lancamentos para o proximo mes e excluir selecionados.
-- Ate aqui authenticated so tinha SELECT (20260728) + UPDATE (20260729).

DROP POLICY IF EXISTS fin_pagamentos_insert ON public.fin_pagamentos;
CREATE POLICY fin_pagamentos_insert ON public.fin_pagamentos
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS fin_pagamentos_delete ON public.fin_pagamentos;
CREATE POLICY fin_pagamentos_delete ON public.fin_pagamentos
  FOR DELETE TO authenticated
  USING (true);
