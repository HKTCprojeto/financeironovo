export type AutomationTrigger =
  | { type: "cron"; expression: string; timezone?: string }
  | {
      type: "metric";
      metric: string;
      operator: "lt" | "gt" | "lte" | "gte" | "eq";
      value: number;
      cooldown_hours?: number;
    }
  | { type: "manual" };

export type AutomationCondition = {
  field: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";
  value: unknown;
};

export type AutomationAction =
  | {
      type: "send_report";
      report_type: "cash" | "pipeline" | "cobranca" | "dashboard";
      deliver_to: "owner";
    }
  | { type: "send_whatsapp"; to: string; template: string }
  | { type: "crm_update_deal"; deal_id: string; fields: Record<string, unknown> }
  | { type: "crm_create_task"; title: string; due_date?: string; related_to?: string }
  | { type: "erp_create_invoice"; customer: string; items: unknown[]; due_date: string }
  | { type: "cobranca_send"; customer_id: string; amount: number; due_date: string }
  | { type: "ask_owner_confirm"; question: string }
  | { type: "ai_decide"; context: string; options: string[] };

export type AutomationActionType = AutomationAction["type"];

export type Automation = {
  id: string;
  name: string;
  description: string | null;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  active: boolean;
  require_confirmation: boolean;
  template_key: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationRunStatus =
  | "pending_confirm"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "expired";

export type AutomationRun = {
  id: number;
  automation_id: string;
  status: AutomationRunStatus;
  trigger_payload: Record<string, unknown> | null;
  steps: Array<{
    action_type: string;
    status: string;
    output?: unknown;
    error?: string;
    duration_ms?: number;
  }>;
  result: Record<string, unknown> | null;
  error: string | null;
  started_at: string;
  finished_at: string | null;
};

export type AutomationTemplate = {
  template_key: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  recommended?: boolean;
};

// Actions that touch third parties → need confirmation by default
export const RISKY_ACTION_TYPES: AutomationActionType[] = [
  "send_whatsapp",
  "crm_update_deal",
  "crm_create_task",
  "erp_create_invoice",
  "cobranca_send",
];

export function isRiskyAction(t: AutomationActionType): boolean {
  return RISKY_ACTION_TYPES.includes(t);
}

export const ACTION_LABELS: Record<AutomationActionType, string> = {
  send_report: "Enviar relatório",
  send_whatsapp: "Enviar WhatsApp",
  crm_update_deal: "Atualizar deal no CRM",
  crm_create_task: "Criar tarefa no CRM",
  erp_create_invoice: "Criar nota no ERP",
  cobranca_send: "Disparar cobrança",
  ask_owner_confirm: "Perguntar ao dono",
  ai_decide: "IA decide",
};
