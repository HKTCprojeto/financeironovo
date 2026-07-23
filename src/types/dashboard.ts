export type DashboardKpis = {
  balance_brl: number;
  receivables_30d_brl: number;
  payables_30d_brl: number;
  pipeline_weighted_brl: number;
  ecommerce_revenue_month_brl: number;
  overdue_total_brl: number;
};

export type ChannelRevenue = { channel: string; brl: number };
export type PipelineStage = { stage: string; brl: number; count?: number };
export type CashProjectionPoint = { date: string; balance_brl: number };
export type Debtor = { name: string; brl: number; days_overdue?: number; id?: string };
export type IntegrationHealth = { name: string; status: string; last_sync: string | null };

export type ManualChatTotals = {
  inflow_brl: number;
  outflow_brl: number;
  count: number;
};

export type DashboardSnapshot = {
  as_of: string;
  kpis: DashboardKpis;
  by_channel_revenue_30d: ChannelRevenue[];
  pipeline_by_stage: PipelineStage[];
  cash_projection_90d: CashProjectionPoint[];
  top_debtors: Debtor[];
  integrations_health: IntegrationHealth[];
  manual_chat?: ManualChatTotals;
};

export type GoalMetric = keyof DashboardKpis;
export type GoalOperator = "gte" | "lte" | "eq";
export type GoalPeriod = "daily" | "weekly" | "monthly";

export type Goal = {
  id: string;
  metric: string;
  operator: string;
  target_value: number;
  period: string;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
