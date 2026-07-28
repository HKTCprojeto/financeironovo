-- Pagamentos — carga da aba "Mensal" do fin_pagamentos.xlsx (mes 07/2026).
-- Dado da EMPRESA (sem user_id): leitura p/ authenticated, escrita so service_role.
-- Valores em centavos (bigint). rubrica_codigo com FK NOT NULL -> fin_rubricas (100% conferido).
-- conta_contabil deixada NULA de proposito: os numeros da planilha eram placeholder/modelo.
-- Insercao guardada por NOT EXISTS: reaplicar no SQL Editor nao duplica.

CREATE TABLE IF NOT EXISTS public.fin_pagamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  departamento    text,
  fornecedor      text NOT NULL,
  servico         text,
  descricao       text,
  valor_centavos  bigint NOT NULL CHECK (valor_centavos >= 0),
  data_vencimento date NOT NULL,
  data_pagamento  date,
  dia_vencimento  smallint,
  tipo            text NOT NULL CHECK (tipo IN ('fixo','variavel')),
  periodicidade   text,
  status          text NOT NULL DEFAULT 'a_pagar' CHECK (status IN ('previsto','a_pagar','pago','atrasado')),
  rubrica_codigo  text NOT NULL REFERENCES public.fin_rubricas(codigo),
  conta_contabil  text,
  mes_ref         text NOT NULL,
  origem          text NOT NULL DEFAULT 'mensal',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fin_pagamentos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS fin_pagamentos_mes_idx     ON public.fin_pagamentos (mes_ref);
CREATE INDEX IF NOT EXISTS fin_pagamentos_rubrica_idx ON public.fin_pagamentos (rubrica_codigo);
CREATE INDEX IF NOT EXISTS fin_pagamentos_status_idx  ON public.fin_pagamentos (status);
CREATE INDEX IF NOT EXISTS fin_pagamentos_venc_idx    ON public.fin_pagamentos (data_vencimento);

DROP POLICY IF EXISTS fin_pagamentos_select ON public.fin_pagamentos;
CREATE POLICY fin_pagamentos_select ON public.fin_pagamentos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS fin_pagamentos_service_all ON public.fin_pagamentos;
CREATE POLICY fin_pagamentos_service_all ON public.fin_pagamentos FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS fin_pagamentos_touch ON public.fin_pagamentos;
CREATE TRIGGER fin_pagamentos_touch BEFORE UPDATE ON public.fin_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------- CARGA (nao duplica se reaplicada) ----------------
INSERT INTO public.fin_pagamentos
  (departamento, fornecedor, servico, descricao, valor_centavos, data_vencimento,
   dia_vencimento, tipo, periodicidade, rubrica_codigo, mes_ref, origem, status)
SELECT departamento, fornecedor, servico, descricao, valor_centavos, data_vencimento,
       dia_vencimento, tipo, periodicidade, rubrica_codigo, mes_ref, origem, status
FROM (VALUES
  ('JURIDICO', 'LINCOLN ZUB DUTRA', 'Acordo Trabalhista', 'ACORDO TRABALHISTA VOLNEI 17/24', 350000, DATE '2026-07-15', 15, 'fixo', 'mensal', 'R02010701', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'FPVGAS LTDA', 'Consumo Água', 'CONSUMO ÁGUA - Garuva', 20000, DATE '2026-07-11', 11, 'variavel', 'mensal', 'R02020301', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'CELESC', 'Energia', 'ENERGIA GARUVA', 227796, DATE '2026-07-10', 10, 'variavel', 'mensal', 'R02020301', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'ENEL', 'Energia', 'ENERGIA BARRA FUNDA CONJ 83', 148124, DATE '2026-07-22', 22, 'variavel', 'mensal', 'R02020301', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'ENEL', 'Energia', 'ENERGIA BARRA FUNDA CONJ 81', 182408, DATE '2026-07-22', 22, 'variavel', 'mensal', 'R02020301', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'ALUGUEL ESCRITORIO SP - DANIEL', 'Aluguel Brasilia Square', 'ALUGUEL ESCRITORIO SÃO PAULO', 2475000, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02020101', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'ALUGUEL DIRETORIA', 'Aluguel Diretoria', 'ALUGUEL DIRETORIA', 1654297, DATE '2026-07-08', 8, 'fixo', 'mensal', 'R02020101', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'ESTEVAM ADM IMOVEIS', 'Aluguel Garuva', 'ALUGUEL GARUVA', 114900, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02020101', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'WORKHUB', 'Aluguel Itajaí', 'SALA PRIVATIVA Mensal - aluguel Itajaí', 244221, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02020101', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'SUL DAS GERAIS EMPREENDIMENTO IMOBILIARIO SPE S/A', 'Aluguel Pouso Alegre', 'ALUGUEL POUSO ALEGRE - PAGAR ANTES DO DIA 10.', 200000, DATE '2026-07-10', 10, 'fixo', 'mensal', 'R02020101', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'PRADO 76', 'Aluguel São Bento', 'ALUGUEL SÃO BENTO', 333149, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02020101', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'HSTONE COMERCIO I M EIRELI EPP (RICCO)', 'Locação Moveis', 'Locação de moveis Ricco', 3994937, DATE '2026-07-15', 15, 'fixo', 'mensal', 'R02020101', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'SP LOCACAO E VENDA DE MAQUINAS E CAFE', 'Amiste Café', 'Aluguel MAQUINAS DE CAFÉ', 47000, DATE '2026-07-09', 9, 'fixo', 'mensal', 'R02020401', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'HSMAQ MANUTENCAO DE EMPILHADEIRAS', 'Aluguel Empilhadeira', 'ALUGUEL EMPILHADEIRA', 55000, DATE '2026-07-03', 3, 'fixo', 'mensal', 'R02530202', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'LOCALIZA', 'Aluguel Veículos', 'contrato de locação da Spin que fica em Garuva', 463613, DATE '2026-07-16', 16, 'fixo', 'mensal', 'R02530202', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'POSTO Z6', 'Abastecimento Frota', 'ABASTECIMENTO FROTA', 3000000, DATE '2026-07-30', 30, 'variavel', 'mensal', 'R02530203', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'CONDOMINIO EDIFICIO BRASILIA SQUARE OFFICES', 'Condominio', 'Condomínio unidade 81 Junho/2026', 299400, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02020201', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'CONDOMINIO EDIFICIO BRASILIA SQUARE OFFICES', 'Condominio', 'Condomínio unidade 83 Junho/2026', 299400, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02020201', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'ASTRA', 'Associação Tradings Sc', 'Mensalidade Associação ASTRA', 162100, DATE '2026-07-15', 15, 'fixo', 'mensal', 'R02580101', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'BANCO MERCEDES-BENZ', 'Financiamento Caminhão', '1590357744 - ACCELO E6 4X2 Dies. 2P Basico', 754689, DATE '2026-07-17', 17, 'fixo', 'mensal', 'R04010101', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'BANCO MERCEDES-BENZ', 'Financiamento Caminhão', '1590355377 - ACTROS(C.Leito T.Alto) E6 ATM 4X2', 1788594, DATE '2026-07-17', 17, 'fixo', 'mensal', 'R04010101', '2026-07', 'mensal', 'a_pagar'),
  ('FINANCEIRO', 'BANCO COOPERATIVO SICOOB S.A', 'Capital de Giro', '1373871', 3966258, DATE '2026-07-07', 7, 'fixo', 'mensal', 'R04010103', '2026-07', 'mensal', 'a_pagar'),
  ('FINANCEIRO', 'BANCO COOPERATIVO SICOOB S.A', 'Capital de Giro', '1498131', 1589410, DATE '2026-07-26', 26, 'fixo', 'mensal', 'R04010103', '2026-07', 'mensal', 'a_pagar'),
  ('FINANCEIRO', 'BANCO COOPERATIVO SICOOB S.A', 'Capital de Giro', '2088785', 8554765, DATE '2026-07-15', 15, 'fixo', 'mensal', 'R04010103', '2026-07', 'mensal', 'a_pagar'),
  ('FINANCEIRO', 'BANCO COOPERATIVO SICOOB S.A', 'Capital de Giro', '2265184', 1545780, DATE '2026-07-08', 8, 'fixo', 'mensal', 'R04010103', '2026-07', 'mensal', 'a_pagar'),
  ('FINANCEIRO', 'BANCO COOPERATIVO SICOOB S.A', 'Capital de Giro', '2085765 - SAC DECRESCENTE', 1943200, DATE '2026-07-16', 16, 'fixo', 'mensal', 'R04010103', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'BANCO COOPERATIVO SICOOB S.A', 'Financiamento Caminhão', '1187114 - AXOR 2041LS/36 4X2 . ANO FAB/MODELO:2022/2023', 1790988, DATE '2026-07-13', 13, 'fixo', 'mensal', 'R04010101', '2026-07', 'mensal', 'a_pagar'),
  ('FINANCEIRO', 'BANCO COOPERATIVO SICOOB S.A', 'Financiamentos Veículos', '1682910 - AUDI Q8', 1583507, DATE '2026-07-19', 19, 'fixo', 'mensal', 'R04010102', '2026-07', 'mensal', 'a_pagar'),
  ('FINANCEIRO', 'BANCO COOPERATIVO SICOOB S.A', 'Financiamentos Veículos', '1696648 - AUDI Q3', 772753, DATE '2026-07-27', 27, 'fixo', 'mensal', 'R04010102', '2026-07', 'mensal', 'a_pagar'),
  ('FINANCEIRO', 'BANCO COOPERATIVO SICOOB S.A', 'Financiamentos Veículos', '2149613 - PORSCHE, MACAN', 1069195, DATE '2026-07-13', 13, 'fixo', 'mensal', 'R04010102', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'CIEE', 'Jovem Aprendiz', 'CENTRO DE INTEGRACAO EMPRESA ESCOLA CIE E', 33800, DATE '2026-07-30', 30, 'fixo', 'mensal', 'R02012001', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'FOLHA DE PAGAMENTO', 'Folha de Pagamento', 'Salarios', 18500000, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02010303', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'UNIMED ODONTO', 'Plano Odonto', 'NF 6046667', 110544, DATE '2026-07-25', 25, 'fixo', 'mensal', 'R02011302', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'UNIMED GOIANIA', 'Plano Saude Garuva', 'Plano de saúde Garuva', 473091, DATE '2026-07-06', 6, 'variavel', 'mensal', 'R02011301', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'UNIMED GOIANIA', 'Plano Saude Sp', 'Plano de saúde SP', 1190757, DATE '2026-07-06', 6, 'variavel', 'mensal', 'R02011301', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'GPBR PARTICIPACOES LTDA.', 'Plataforma Academia', 'COBRANÇA MENSAL WELL HUB', 99330, DATE '2026-07-01', 1, 'fixo', 'mensal', 'R02010501', '2026-07', 'mensal', 'a_pagar'),
  ('CONTABILIDADE', 'DARF COFINS', 'Cofins', 'DARF COFINS', 15932290, DATE '2026-07-25', 25, 'variavel', 'mensal', 'R02990101', '2026-07', 'mensal', 'a_pagar'),
  ('CONTABILIDADE', 'DARF - REINF - E-SOCIAL', 'E-Social', 'DARF - REINF - E-SOCIAL', 7887708, DATE '2026-07-19', 19, 'fixo', 'mensal', 'R02010601', '2026-07', 'mensal', 'a_pagar'),
  ('CONTABILIDADE', 'GFD - GUIA DO FGTS', 'FGTS', 'GFD - GUIA DO FGTS', 1689504, DATE '2026-07-19', 19, 'fixo', 'mensal', 'R02010602', '2026-07', 'mensal', 'a_pagar'),
  ('CONTABILIDADE', 'DARE ICMS', 'Icms Beneficio Garuva', 'ICMS-Resultante da Utilização de Crédito Presumido', 4671087, DATE '2026-07-22', 22, 'variavel', 'mensal', 'R02990401', '2026-07', 'mensal', 'a_pagar'),
  ('CONTABILIDADE', 'DARE ICMS', 'Icms Garuva', 'ICMS', 1868435, DATE '2026-07-22', 22, 'variavel', 'mensal', 'R02990401', '2026-07', 'mensal', 'a_pagar'),
  ('CONTABILIDADE', 'DARE ICMS', 'Icms Sp', 'DARE ICMS', 7100, DATE '2026-07-30', 30, 'variavel', 'mensal', 'R02990401', '2026-07', 'mensal', 'a_pagar'),
  ('CONTABILIDADE', 'DARE ICMS Normal SP', 'Icms Sp', 'DARE ICMS Normal SP', 4392, DATE '2026-07-19', 19, 'variavel', 'mensal', 'R02990401', '2026-07', 'mensal', 'a_pagar'),
  ('CONTABILIDADE', 'DARF IPI', 'IPI', 'DARF IPI', 6868130, DATE '2026-07-25', 25, 'variavel', 'mensal', 'R02990501', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'IPTU PARCELA 01_2026 CONJ 81', 'IPTU', 'IPTU PARCELA 01_2026 CONJ 81', 422518, DATE '2026-07-30', 30, 'fixo', 'mensal', 'R02020803', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'IPTU PARCELA 01_2026 CONJ 83', 'IPTU', 'IPTU PARCELA 01_2026 CONJ 83', 422518, DATE '2026-07-30', 30, 'fixo', 'mensal', 'R02020803', '2026-07', 'mensal', 'a_pagar'),
  ('CONTABILIDADE', 'PREFEITURA GARUVA - ISS', 'ISS Garuva', 'ISS COMP', 182305, DATE '2026-07-16', 16, 'variavel', 'mensal', 'R02990601', '2026-07', 'mensal', 'a_pagar'),
  ('CONTABILIDADE', 'DARF PARCELAMENTO', 'Parcelamento Imposto', 'DARF PARCELAMENTO', 1449302, DATE '2026-07-29', 29, 'variavel', 'mensal', 'R02990301', '2026-07', 'mensal', 'a_pagar'),
  ('CONTABILIDADE', 'DARF PARCELAMENTO', 'Parcelamento Imposto', 'DARF PARCELAMENTO', 863839, DATE '2026-07-29', 29, 'variavel', 'mensal', 'R02990301', '2026-07', 'mensal', 'a_pagar'),
  ('CONTABILIDADE', 'DARF PIS', 'PIS', 'DARF PIS', 3447839, DATE '2026-07-25', 25, 'variavel', 'mensal', 'R02990201', '2026-07', 'mensal', 'a_pagar'),
  ('CONTABILIDADE', 'MUNICIPIO DE POUSO ALEGRE', 'Taxa Licencimento Pouso Alegre', 'TAXA DE LICENCIAMENTO POUSO ALEGRE', 41685, DATE '2026-07-01', 1, 'fixo', 'mensal', 'R02990301', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'SP LOCACAO E VENDA DE MAQUINAS E CAFE', 'Amiste Café', 'Insumos MAQUINAS DE CAFÉ', 14980, DATE '2026-07-09', 9, 'variavel', 'mensal', 'R02020301', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'BIOTEC', 'Material Consumo Copa São Paulo', 'MATERIAL CONSUMO COPA SÃO PAULO', 350000, DATE '2026-07-30', 30, 'variavel', 'mensal', 'R02020401', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'MERCADO JM', 'Material Consumo Garuva', 'MATERIAL CONSUMO COPA GARUVA', 100000, DATE '2026-07-30', 30, 'variavel', 'mensal', 'R02020401', '2026-07', 'mensal', 'a_pagar'),
  ('TI', 'HOST TECNOLOGIA', 'Internet', 'INTERNET SÃO PAULO - HOSTFIBER', 19080, DATE '2026-07-16', 16, 'fixo', 'mensal', 'R02500103', '2026-07', 'mensal', 'a_pagar'),
  ('TI', 'HOSTFIBER', 'Internet', 'INTERNET SÃO PAULO - HOSTFIBER', 28620, DATE '2026-07-16', 16, 'fixo', 'mensal', 'R02500103', '2026-07', 'mensal', 'a_pagar'),
  ('TI', 'VIVO INTERNET', 'Internet', 'INTERNET SÃO PAULO', 174167, DATE '2026-07-15', 15, 'fixo', 'mensal', 'R02500103', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'ZLINK.NET', 'Internet Garuva', 'INTERNET GARUVA', 21000, DATE '2026-07-10', 10, 'fixo', 'mensal', 'R02500103', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'ZLINK.NET', 'Internet Garuva', 'INTERNET GARUVA', 3900, DATE '2026-07-10', 10, 'fixo', 'mensal', 'R02500103', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'VIVO', 'Internet São Bento', 'INTERNET SÃO BENTO', 13440, DATE '2026-07-08', 8, 'fixo', 'mensal', 'R02500103', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'CLARO', 'Telefonia', 'CELULARES COORPORATIVOS SP', 149576, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02500102', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'CLARO', 'Telefonia', 'TELEFONE MOVEL GARUVA', 19128, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02500102', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'CLARO', 'Telefonia', 'TELEFONE MOVEL GARUVA', 8188, DATE '2026-07-22', 22, 'fixo', 'mensal', 'R02500102', '2026-07', 'mensal', 'a_pagar'),
  ('TI', 'NET2PHONE', 'Telefonia', 'TELEFONIA - RAMAIS INTERNOS SP', 115200, DATE '2026-07-15', 15, 'fixo', 'mensal', 'R02500101', '2026-07', 'mensal', 'a_pagar'),
  ('TI', 'NET2PHONE', 'Telefonia', 'TELEFONIA - RAMAIS INTERNOS SP', 9048, DATE '2026-07-15', 15, 'fixo', 'mensal', 'R02500101', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'CLICKSIGN GESTAO DE DOCUMENTOS', 'Adm', 'PLATAFORMA DE ASSINATURAS', 31600, DATE '2026-07-20', 20, 'fixo', 'mensal', 'R02030301', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'SERASA', 'Adm', 'fatura mensal  - plataforma', 278443, DATE '2026-07-10', 10, 'variavel', 'mensal', 'R02030301', '2026-07', 'mensal', 'a_pagar'),
  ('TI', 'INTELBRAS', 'Camera Caminhão', 'CAMERA DO CAMINHÃO', 8547, DATE '2026-07-01', 1, 'fixo', 'mensal', 'R02030302', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'Extratta', 'Emissão Ciot', 'Sistema de logística', 35699, DATE '2026-07-15', 15, 'fixo', 'mensal', 'R02030301', '2026-07', 'mensal', 'a_pagar'),
  ('COMEX', 'CONEXOS', 'ERP', 'Manutenção e Suporte', 461380, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02030301', '2026-07', 'mensal', 'a_pagar'),
  ('COMEX', 'CONEXOS', 'ERP', 'Serviço de intermediação de hospedagem em Datacenter', 230805, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02030301', '2026-07', 'mensal', 'a_pagar'),
  ('TI', 'MICROSOFT', 'Licenças Microsoft', 'VALOR POR USUARIO', 658948, DATE '2026-07-07', 7, 'fixo', 'mensal', 'R02030301', '2026-07', 'mensal', 'a_pagar'),
  ('TI', 'IA''a', 'Uso de IA''S', 'plataformas de IA''s', 1000000, DATE '2026-07-30', 30, 'fixo', 'mensal', 'R02030301', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'YOURH', 'Plataforma Cursos RH', 'PLATAFORMA DE CURSOS', 75969, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02030301', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'RASTER RASTREAMENTO LTDA', 'Rastreamento Caminhões', 'rastreamento Raster', 68205, DATE '2026-07-01', 1, 'fixo', 'mensal', 'R02030302', '2026-07', 'mensal', 'a_pagar'),
  ('COMEX', 'LOGCOMEX', 'Sistema Comex', 'NF 22565', 133512, DATE '2026-07-02', 2, 'fixo', 'mensal', 'R02030301', '2026-07', 'mensal', 'a_pagar'),
  ('COMEX', 'LOGCOMEX', 'Sistema Comex', 'NF 20561', 500000, DATE '2026-07-30', 30, 'fixo', 'mensal', 'R02030301', '2026-07', 'mensal', 'a_pagar'),
  ('COMEX', 'LOGCOMEX', 'Patrocinio', 'NF 18260', 1187550, DATE '2026-07-02', 2, 'fixo', 'mensal', 'R03050201', '2026-07', 'mensal', 'a_pagar'),
  ('COMEX', 'LOGCOMEX', 'Sistema Comex', NULL, 1550000, DATE '2026-07-24', 24, 'fixo', 'mensal', 'R02030301', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'PREAMBULO AFFICE', 'Sistema Juridico', 'Software para controle jurídico', 42000, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02030301', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'SMARTGO', 'Sistema Logistica', 'WMS - LOGISTICA', 90000, DATE '2026-07-06', 6, 'fixo', 'mensal', 'R02030301', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'Trading Works', 'Sistema RH', 'SISTEMA PONTO RH', 86170, DATE '2026-07-16', 16, 'fixo', 'mensal', 'R02030302', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'RASTER RASTREAMENTO', 'Gerenciador Risco Logistica', 'gerenciador de risco de logística', 241330, DATE '2026-07-01', 1, 'fixo', 'mensal', 'R02030302', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'ORSEGUPS MONITORAMENTO ELETRÔNICO', 'Monitoramento', 'MONITORAMENTO DE SEGURANÇA - GARUVA', 20713, DATE '2026-07-20', 20, 'fixo', 'mensal', 'R02030302', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'SASCAR', 'Monitoramento Caminhões', 'rastreamento SASCAR', 117084, DATE '2026-07-22', 22, 'fixo', 'mensal', 'R02030302', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'VELOE', 'Sistema Pegagios', 'CONSUMO POS', 387956, DATE '2026-07-10', 10, 'variavel', 'mensal', 'R02530104', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'AMEVIDA', 'Gestão de Vidas RH', NULL, 57000, DATE '2026-07-10', 10, 'fixo', 'mensal', 'R02011301', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'AMEVIDA', 'Kits Admissionais, Periodoicos E Demissionais', NULL, 50000, DATE '2026-07-10', 10, 'variavel', 'mensal', 'R02011301', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'PRESTADORES SERVIÇOS', 'Prestadores Serviços', 'Prestadores HKTC', 6300000, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02012002', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'TOKIO MARINE', 'Seguro Automovel', 'Seguro Porsche 09/10', 171972, DATE '2026-07-19', 19, 'fixo', 'mensal', 'R02530207', '2026-07', 'mensal', 'a_pagar'),
  ('COMEX', 'AKAD', 'Seguro Transporte Internacional Importação', 'SEGURO TRANSPORTE INTERNACIONAL IMPORTAÇÃO', 350610, DATE '2026-07-20', 20, 'variavel', 'mensal', 'R03040701', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'SOMPO SEGUROS S.A', 'Seguro de Cargas', 'SEGURO DE CARGAS', 107380, DATE '2026-07-10', 10, 'variavel', 'mensal', 'R03040702', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'ESCRITA CONTABILIDADE DE EMPRESAS LTDA', 'Contabilidade', 'Contabilidade especializada', 653600, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02540204', '2026-07', 'mensal', 'a_pagar'),
  ('REGULATORIO', 'PARKER', 'Rt Santa Catarina', 'técnicos para Anvisa e vigilância sanitária.', 162100, DATE '2026-07-10', 10, 'fixo', 'mensal', 'R02540204', '2026-07', 'mensal', 'a_pagar'),
  ('REGULATORIO', 'BSINT INTERNATIONAL', 'Rt São Paulo', 'técnicos para Anvisa e vigilância sanitária.', 360800, DATE '2026-07-05', 5, 'fixo', 'mensal', 'R02540204', '2026-07', 'mensal', 'a_pagar'),
  ('MKT', 'Google', 'Ferramentas Para Campanhas', 'ferramentas para campanhas baseadas em busca, display e vídeo', 650000, DATE '2026-07-13', 13, 'variavel', 'mensal', 'R03050202', '2026-07', 'mensal', 'a_pagar'),
  ('MKT', 'Facebook / Meta', 'Ferramentas Para Campanhas', 'ferramentas para campanhas baseadas em busca, display e vídeo', 350000, DATE '2026-07-13', 13, 'variavel', 'mensal', 'R03050202', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'OUVIDOR DIGITAL SERVICOS DE INFORMATICA LTDA', 'Canal de Denúncias', 'Serviço de Ouvidoria para o Canal de Denúncias', 165344, DATE '2026-07-30', 30, 'fixo', 'mensal', 'R02010904', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'BRADESCO', 'Seguro Frota', 'Seguro caminhores e implementos - RYI4B10 e RYN6B46', 589850, DATE '2026-07-10', 10, 'fixo', '10 parcelas', 'R02530207', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'TOKIO MARINE', 'Seguro Frota CAMINHÃO RYS6G08', 'Seguro caminhão RYS6G08', 133035, DATE '2026-07-10', 10, 'fixo', '4 parcelas', 'R02530207', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'PORTO SEGURO', 'Seguro Terminal Garuva', 'Seguro Terminal Garuva', 444628, DATE '2026-07-15', 15, 'fixo', '6 parcelas', 'R02020701', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'PORTO SEGURO', 'Seguro Audi Q8', 'Seguro Audi Q8', 358343, DATE '2026-07-27', 27, 'fixo', '4 parcelas', 'R02530207', '2026-07', 'mensal', 'a_pagar'),
  ('ADM', 'PORTO SEGURO', 'Seguro Audi Q3', 'Seguro Audi Q3', 358343, DATE '2026-07-27', 27, 'fixo', '4 parcelas', 'R02530207', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'FLASH', 'FLASH - SÃO PAULO', 'Cartão alimentação e refeições', 4244000, DATE '2026-07-30', 30, 'fixo', 'mensal', 'R02011401', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'FLASH', 'FLASH - GARUVA', 'Cartão alimentação e refeições', 1256000, DATE '2026-07-30', 30, 'fixo', 'mensal', 'R02011401', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'FLASH', 'FLASH - ITAJAI', 'Cartão alimentação e refeições', 354000, DATE '2026-07-30', 30, 'fixo', 'mensal', 'R02011401', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'FLASH', 'FLASH - MOBILIDADE GARUVA', 'Cartão alimentação e refeições', 200420, DATE '2026-07-30', 30, 'fixo', 'mensal', 'R02011401', '2026-07', 'mensal', 'a_pagar'),
  ('RH', 'FLASH', 'FLASH - MOBILIDADE ITAJAÍ', 'Cartão alimentação e refeições', 153186, DATE '2026-07-30', 30, 'fixo', 'mensal', 'R02011401', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'GUILHERME CARRAPATOSO GARCIA SERVICOS ADMINISTRATIVOS', 'Projeto Rfid', 'Comodato de coletores', 483300, DATE '2026-07-25', 25, 'fixo', 'mensal', 'R02030302', '2026-07', 'mensal', 'a_pagar'),
  ('LOGISTICA', 'FRETEBRAS INTERNET E SERVICOS LTDA', 'APP CARRETAR FRETES', 'APP CARRETAR FRETES', 32990, DATE '2026-07-15', 15, 'fixo', 'mensal', 'R02030302', '2026-07', 'mensal', 'a_pagar')
) AS v(departamento, fornecedor, servico, descricao, valor_centavos, data_vencimento,
       dia_vencimento, tipo, periodicidade, rubrica_codigo, mes_ref, origem, status)
WHERE NOT EXISTS (SELECT 1 FROM public.fin_pagamentos);
