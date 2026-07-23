import { Bell, AlertTriangle, Wallet, PieChart, AlertCircle, Clock, TrendingDown, HeartPulse, Activity, type LucideIcon } from "lucide-react";

export type Severity = "info" | "warn" | "error" | "critical";

export type RuleParam = {
  key: string;
  label: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  default: number;
};

export type RuleDef = {
  name: string;
  title: string;
  description: string;
  icon: LucideIcon;
  severity: Severity;
  params: RuleParam[];
};

export const COOLDOWN: RuleParam = {
  key: "cooldown_hours",
  label: "Cooldown",
  suffix: "horas",
  min: 1,
  max: 720,
  step: 1,
  default: 24,
};

export const RULES: RuleDef[] = [
  {
    name: "overdue_critical",
    title: "Conta vencida crítica",
    description: "Avisa quando uma conta está vencida há mais de N dias.",
    icon: AlertTriangle,
    severity: "critical",
    params: [
      { key: "days_overdue", label: "Dias vencidos", suffix: "dias", min: 1, max: 365, step: 1, default: 7 },
      { ...COOLDOWN, default: 168 },
    ],
  },
  {
    name: "cash_low",
    title: "Caixa baixo",
    description: "Avisa quando o saldo projetado fica abaixo do limite.",
    icon: Wallet,
    severity: "error",
    params: [
      { key: "threshold_brl", label: "Limite", suffix: "BRL", min: 0, max: 10_000_000, step: 100, default: 5000 },
      { ...COOLDOWN, default: 24 },
    ],
  },
  {
    name: "concentration",
    title: "Concentração de cliente",
    description: "Avisa quando um cliente concentra mais de N% do faturamento.",
    icon: PieChart,
    severity: "warn",
    params: [
      { key: "threshold_pct", label: "Limite", suffix: "%", min: 1, max: 100, step: 1, default: 40 },
      { ...COOLDOWN, default: 168 },
    ],
  },
  {
    name: "inadimplencia_high",
    title: "Inadimplência alta",
    description: "Avisa quando a inadimplência ultrapassa o limite.",
    icon: AlertCircle,
    severity: "error",
    params: [
      { key: "threshold_pct", label: "Limite", suffix: "%", min: 1, max: 100, step: 1, default: 15 },
      { ...COOLDOWN, default: 24 },
    ],
  },
  {
    name: "deal_stale",
    title: "Negócio parado",
    description: "Avisa quando um deal não recebe atualização há N dias.",
    icon: Clock,
    severity: "warn",
    params: [
      { key: "days_no_update", label: "Dias sem update", suffix: "dias", min: 1, max: 365, step: 1, default: 30 },
      { ...COOLDOWN, default: 168 },
    ],
  },
  {
    name: "pipeline_drop",
    title: "Queda de pipeline",
    description: "Avisa quando o pipeline cai mais de N% versus o período anterior.",
    icon: TrendingDown,
    severity: "warn",
    params: [
      { key: "drop_pct", label: "Queda", suffix: "%", min: 1, max: 100, step: 1, default: 50 },
      { ...COOLDOWN, default: 168 },
    ],
  },
  {
    name: "erp_api_health",
    title: "Saúde do ERP",
    description: "Avisa quando há repetidos erros de API no ERP.",
    icon: HeartPulse,
    severity: "error",
    params: [
      { key: "threshold_errors", label: "Erros consecutivos", min: 1, max: 100, step: 1, default: 2 },
      { ...COOLDOWN, default: 24 },
    ],
  },
  {
    name: "pipeline_health",
    title: "Saúde do pipeline",
    description: "Avisa quando o pipeline ponderado fica abaixo do mínimo saudável.",
    icon: Activity,
    severity: "info",
    params: [
      { key: "min_weighted_brl", label: "Mínimo ponderado", suffix: "BRL", min: 0, max: 100_000_000, step: 1000, default: 50_000 },
      { ...COOLDOWN, default: 168 },
    ],
  },
];

export type RuleConfig = { enabled: boolean } & Record<string, number | boolean>;
export type RulesConfig = Record<string, RuleConfig>;

export function defaultRulesConfig(): RulesConfig {
  const out: RulesConfig = {};
  for (const r of RULES) {
    const cfg: RuleConfig = { enabled: true };
    for (const p of r.params) cfg[p.key] = p.default;
    out[r.name] = cfg;
  }
  return out;
}

export const SEVERITY_BADGE: Record<Severity, string> = {
  info: "bg-blue-100 text-blue-700 border-blue-200",
  warn: "bg-yellow-100 text-yellow-800 border-yellow-200",
  error: "bg-orange-100 text-orange-800 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};

export const BellIcon = Bell;
