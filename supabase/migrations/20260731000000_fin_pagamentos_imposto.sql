-- Impostos: 3o tipo de gasto (Fixos / Variaveis / Impostos), a pedido da diretoria.
--  1) libera 'imposto' no CHECK da coluna tipo;
--  2) reclassifica os 15 pagamentos de imposto = departamento CONTABILIDADE (13)
--     + os 2 IPTU (que estao em ADM).
-- NAO recarrega/apaga nada: so muda o campo tipo. Baixas e status ficam intactos.

ALTER TABLE public.fin_pagamentos DROP CONSTRAINT IF EXISTS fin_pagamentos_tipo_check;
ALTER TABLE public.fin_pagamentos
  ADD CONSTRAINT fin_pagamentos_tipo_check CHECK (tipo IN ('fixo', 'variavel', 'imposto'));

UPDATE public.fin_pagamentos
   SET tipo = 'imposto'
 WHERE departamento = 'CONTABILIDADE'
    OR fornecedor ILIKE 'IPTU%';
