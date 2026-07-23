/**
 * Atalhos de skills do agente Marcos (CFO).
 * São apenas prompts em PT — o Marcos roteia para a skill certa.
 */
export type CfoQuickAction = { label: string; prompt: string };

export const CFO_QUICK_ACTIONS: CfoQuickAction[] = [
  {
    label: "Conciliar cobranças",
    prompt: "Concilie as cobranças em aberto dos últimos 30 dias: liste as que ainda não foram baixadas e aponte divergências entre ERP e extrato.",
  },
  {
    label: "Análise estratégica do mês",
    prompt: "Faça uma análise estratégica do mês corrente: receita, despesa, margem, principais variações vs mês anterior e o que merece atenção.",
  },
  {
    label: "Cenário what-if",
    prompt: "Simule um cenário what-if: o que acontece com o caixa nos próximos 90 dias se a receita cair 20% e as despesas ficarem estáveis?",
  },
  {
    label: "Detectar anomalias",
    prompt: "Detecte anomalias nas movimentações financeiras dos últimos 30 dias (lançamentos atípicos, fornecedores fora do padrão, picos de despesa).",
  },
  {
    label: "Inadimplência & cobrança",
    prompt: "Liste os clientes inadimplentes hoje, com valor em aberto e dias de atraso, e sugira o próximo passo de cobrança para cada um.",
  },
  {
    label: "Projeção de caixa",
    prompt: "Gere a projeção de caixa para os próximos 90 dias com base no que está no ERP, em semanas, mostrando saldo final estimado.",
  },
  {
    label: "Relatório executivo",
    prompt: "Monte o relatório executivo do mês: KPIs principais, top 5 entradas e saídas, e 3 insights acionáveis.",
  },
  {
    label: "Tributação BR",
    prompt: "Faça um resumo da carga tributária estimada do mês com base no faturamento e regime tributário atual, e aponte oportunidades de otimização.",
  },
];
