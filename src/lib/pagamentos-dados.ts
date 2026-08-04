/**
 * Dados e regras de pagamentos compartilhados entre Painel e Relatórios.
 *
 * As duas telas leem a mesma base (fin_pagamentos + fin_rubricas) e precisam
 * concordar no que é "vencido". Antes isso vivia só no index.tsx; ao dividir
 * as telas, duplicar a regra seria pedir para elas divergirem com o tempo.
 */
import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyBRL } from "@/lib/format";

// fin_* ainda não estão nos types gerados do Supabase.
export type Rubrica = {
  codigo: string;
  nome: string;
  nivel1_codigo: string;
  nivel1_nome: string;
};

export type Pagamento = {
  id: string;
  departamento: string | null;
  fornecedor: string;
  servico: string | null;
  valor_centavos: number;
  data_vencimento: string;
  data_pagamento: string | null;
  tipo: "fixo" | "variavel" | "imposto";
  status: "previsto" | "a_pagar" | "pago" | "atrasado";
  rubrica_codigo: string;
  mes_ref: string;
};

export async function fetchPagamentos() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [rub, pag] = await Promise.all([
    sb.from("fin_rubricas").select("codigo,nome,nivel1_codigo,nivel1_nome"),
    sb.from("fin_pagamentos").select("*"),
  ]);
  if (rub.error) throw rub.error;
  if (pag.error) throw pag.error;
  return {
    rubricas: (rub.data ?? []) as Rubrica[],
    pagamentos: (pag.data ?? []) as Pagamento[],
  };
}

export function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Mesmo critério da tela Pagamentos: "Vencido" é automático quando está
 * a_pagar e passou do vencimento — não depende de alguém marcar na mão.
 */
export function statusEfetivo(p: Pagamento, hoje: string): "a_pagar" | "pago" | "atrasado" {
  if (p.status === "pago") return "pago";
  if (p.status === "atrasado") return "atrasado";
  if (p.data_vencimento < hoje) return "atrasado";
  return "a_pagar";
}

export const STATUS_META = {
  a_pagar: { label: "A pagar", color: "#d97706" }, // amber-600
  pago: { label: "Pago", color: "#059669" }, // emerald-600
  atrasado: { label: "Vencido", color: "#dc2626" }, // red-600
} as const;

export const GRUPO_CORES = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

export const brl = (reais: number) => formatCurrencyBRL(reais);
export const kBRL = (reais: number) => `R$${(reais / 1000).toFixed(0)}k`;
