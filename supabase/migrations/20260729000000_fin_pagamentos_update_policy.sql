-- Libera ALTERACAO de status/data_pagamento dos pagamentos para o time logado.
-- Ate aqui fin_pagamentos so permitia escrita para service_role (ver 20260728000000).
-- Agora a tela de Pagamentos deixa o usuario autenticado dar baixa (Pago/Pagar/Vencido).
-- RLS e por LINHA (nao por coluna); a tela envia apenas status + data_pagamento.

DROP POLICY IF EXISTS fin_pagamentos_update ON public.fin_pagamentos;
CREATE POLICY fin_pagamentos_update ON public.fin_pagamentos
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
