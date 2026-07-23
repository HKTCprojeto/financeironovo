import type { AutomationActionType } from "@/types/automations";

export const METRIC_OPTIONS: { value: string; label: string }[] = [
  { value: "balance_brl", label: "Saldo em caixa" },
  { value: "receivables_30d_brl", label: "A receber (30 dias)" },
  { value: "payables_30d_brl", label: "A pagar (30 dias)" },
  { value: "pipeline_weighted_brl", label: "Pipeline ponderado" },
  { value: "overdue_total_brl", label: "Inadimplência total" },
  { value: "ecommerce_revenue_month_brl", label: "Receita e-commerce (mês)" },
];

export function metricLabel(value: string): string {
  return METRIC_OPTIONS.find((m) => m.value === value)?.label ?? value;
}

export const NUMBER_OPERATOR_LABELS: Record<string, string> = {
  lt: "menor que",
  lte: "menor ou igual a",
  eq: "igual a",
  gte: "maior ou igual a",
  gt: "maior que",
  neq: "diferente de",
  contains: "contém",
  in: "está em",
};

export const TRIGGER_TYPE_LABELS: Record<string, string> = {
  cron: "Em data/hora específica",
  metric: "Quando algum número mudar",
  manual: "Só quando eu mandar",
};

export type ActionMeta = {
  icon: string;
  label: string;
  summary: (a: any) => string;
  impact: "owner_only" | "modifies_external" | "asks_confirm";
  impactLabel: string;
};

export const ACTION_META: Record<AutomationActionType, ActionMeta> = {
  send_report: {
    icon: "📊",
    label: "Enviar relatório",
    summary: (a) => `Lívia vai enviar o relatório de ${a.report_type} pra você`,
    impact: "owner_only",
    impactLabel: "🔒 só envia pra você",
  },
  send_whatsapp: {
    icon: "💬",
    label: "Enviar mensagem WhatsApp",
    summary: (a) => `Lívia vai enviar uma mensagem pelo WhatsApp pra ${a.to || "—"}`,
    impact: "modifies_external",
    impactLabel: "⚠ envia pra terceiros",
  },
  crm_update_deal: {
    icon: "✏️",
    label: "Atualizar deal no CRM",
    summary: () => "Lívia vai atualizar um deal no seu CRM",
    impact: "modifies_external",
    impactLabel: "⚠ modifica seu CRM",
  },
  crm_create_task: {
    icon: "✅",
    label: "Criar tarefa no CRM",
    summary: (a) => `Lívia vai criar a tarefa "${a.title || "—"}" no CRM`,
    impact: "modifies_external",
    impactLabel: "⚠ modifica seu CRM",
  },
  erp_create_invoice: {
    icon: "📄",
    label: "Emitir fatura no ERP",
    summary: () => "Lívia vai emitir uma fatura no seu ERP",
    impact: "modifies_external",
    impactLabel: "⚠ modifica seu ERP",
  },
  cobranca_send: {
    icon: "💰",
    label: "Disparar cobrança",
    summary: (a) =>
      `Lívia vai disparar cobrança${a.amount ? ` de R$ ${Number(a.amount).toLocaleString("pt-BR")}` : ""}`,
    impact: "modifies_external",
    impactLabel: "⚠ envia cobrança pro cliente",
  },
  ask_owner_confirm: {
    icon: "❓",
    label: "Pedir sua confirmação",
    summary: () => "Lívia vai te perguntar antes de seguir",
    impact: "asks_confirm",
    impactLabel: "💬 pergunta antes",
  },
  ai_decide: {
    icon: "🤖",
    label: "Lívia decide o que fazer",
    summary: () => "Lívia vai decidir o próximo passo com IA",
    impact: "asks_confirm",
    impactLabel: "🤖 decisão com IA",
  },
};

export const RUN_STATUS_LABEL: Record<string, string> = {
  succeeded: "✓ Executou com sucesso",
  failed: "✗ Falhou",
  pending_confirm: "⏳ Aguardando você confirmar no WhatsApp",
  running: "⚙️ Em execução agora",
  cancelled: "✕ Cancelada",
  expired: "⌛ Expirada (não confirmada em 24h)",
};

export const AVAILABLE_VARIABLES: { token: string; label: string }[] = [
  { token: "{{trigger.balance_brl}}", label: "saldo no momento" },
  { token: "{{trigger.value}}", label: "valor que disparou" },
  { token: "{{kpis.balance_brl}}", label: "saldo atual" },
  { token: "{{kpis.overdue_total_brl}}", label: "inadimplência total" },
  { token: "{{kpis.receivables_30d_brl}}", label: "a receber 30d" },
  { token: "{{kpis.payables_30d_brl}}", label: "a pagar 30d" },
  { token: "{{trigger.deal_id}}", label: "id do deal" },
];

// ===== Cron helpers =====
export const WEEKDAYS = [
  { value: "1", label: "Segunda" },
  { value: "2", label: "Terça" },
  { value: "3", label: "Quarta" },
  { value: "4", label: "Quinta" },
  { value: "5", label: "Sexta" },
  { value: "6", label: "Sábado" },
  { value: "0", label: "Domingo" },
];

export type CronParts =
  | { kind: "daily"; time: string }
  | { kind: "weekly"; weekday: string; time: string }
  | { kind: "monthly"; day: string; time: string }
  | { kind: "custom"; expression: string };

export function parseCron(expr: string): CronParts {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return { kind: "custom", expression: expr };
  const [m, h, dom, mon, dow] = parts;
  const isNum = (s: string) => /^\d+$/.test(s);
  const time = isNum(m) && isNum(h)
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    : null;
  if (!time) return { kind: "custom", expression: expr };
  if (dom === "*" && mon === "*" && dow === "*") return { kind: "daily", time };
  if (dom === "*" && mon === "*" && isNum(dow)) return { kind: "weekly", weekday: dow, time };
  if (isNum(dom) && mon === "*" && dow === "*") return { kind: "monthly", day: dom, time };
  return { kind: "custom", expression: expr };
}

export function buildCron(parts: CronParts): string {
  if (parts.kind === "custom") return parts.expression;
  const [hh, mm] = parts.time.split(":");
  const h = String(parseInt(hh, 10));
  const m = String(parseInt(mm, 10));
  if (parts.kind === "daily") return `${m} ${h} * * *`;
  if (parts.kind === "weekly") return `${m} ${h} * * ${parts.weekday}`;
  return `${m} ${h} ${parts.day} * *`;
}

export function describeCron(expr: string): string {
  const p = parseCron(expr);
  if (p.kind === "daily") return `todo dia às ${p.time}`;
  if (p.kind === "weekly") {
    const wd = WEEKDAYS.find((w) => w.value === p.weekday)?.label ?? "?";
    return `toda ${wd.toLowerCase()} às ${p.time}`;
  }
  if (p.kind === "monthly") return `todo dia ${p.day} do mês às ${p.time}`;
  return `agendado (${expr})`;
}

// ===== Money formatting =====
export function formatBRL(n: number): string {
  if (!Number.isFinite(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function parseBRLInput(input: string): number {
  // Keep only digits; treat last 2 as cents
  const digits = input.replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits) / 100;
}
