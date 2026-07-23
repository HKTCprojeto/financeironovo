import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/states";
import { formatCurrencyBRL, formatDateTime, formatRelative } from "@/lib/format";
import { SeverityBadge } from "@/lib/status";
import { toast } from "sonner";
import { RefreshCw, TrendingDown, TrendingUp, AlertTriangle } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ReferenceLine, Area, AreaChart,
} from "recharts";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Relatórios — Agente CFO" }] }),
  component: ReportsPage,
});

// ---------- types ----------
type CashWeek = {
  week: number;
  from: string;
  to: string;
  net_brl: number;
  incoming_brl: number;
  outgoing_brl: number;
};
type CashProjection = {
  as_of?: string;
  balance_brl?: number;
  incoming_brl?: number;
  outgoing_brl?: number;
  projected_balance_brl?: number;
  projection_days?: number;
  by_week?: CashWeek[];
};
type ByStage = { stage: string; total_brl: number; weighted_brl: number; count: number };
type ByWindow = { window: string; total_brl: number; weighted_brl: number; count: number };
type PipelineProjection = {
  total_open_brl?: number;
  weighted_expected_brl?: number;
  by_stage?: ByStage[];
  by_close_window?: ByWindow[];
};
type LlmRow = { created_at: string; cost_brl: number };
type EventRow = {
  id: number; type: string; severity: string; created_at: string; payload: unknown;
};

// ---------- helpers ----------
const SEVERITY_KEYS = ["warn", "error", "critical"] as const;
type Severity = typeof SEVERITY_KEYS[number];
const SEVERITY_COLOR: Record<Severity, string> = {
  warn: "hsl(var(--chart-3, 45 93% 47%))",
  error: "hsl(var(--chart-1, 0 84% 60%))",
  critical: "hsl(var(--destructive))",
};

function dayKey(d: Date) { return d.toISOString().slice(0, 10); }
function lastNDays(n: number) {
  const out: string[] = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

const LLM_BUDGET = Number(import.meta.env.VITE_LLM_BUDGET_BRL ?? 50);

// ---------- page ----------
function ReportsPage() {
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [hasInstance, setHasInstance] = useState<boolean | null>(null);
  const [hasCrm, setHasCrm] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("instances")
        .select("id, connected_integrations")
        .order("created_at", { ascending: false })
        .limit(1);
      const inst = data?.[0];
      if (!inst) { setHasInstance(false); return; }
      setInstanceId(inst.id as string);
      setHasInstance(true);
      const integ = (inst.connected_integrations ?? {}) as Record<string, unknown>;
      setHasCrm(Boolean(integ.hubspot || integ.crm || integ.pipedrive));
    })();
  }, []);

  if (hasInstance === false) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Card>
          <CardContent className="py-10">
            <EmptyState
              title="Sem dados ainda"
              description="Conecte seu ERP em /onboarding ou rode setup.sh na VPS para começar a ver relatórios."
            />
            <div className="flex justify-center mt-4">
              <Button asChild><Link to="/onboarding">Configurar agora</Link></Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader />
      <CashCard instanceId={instanceId} />
      {hasCrm && <PipelineCard instanceId={instanceId} />}
      <LlmCostCard />
      <CriticalEventsCard />
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
      <p className="text-sm text-muted-foreground">
        Visão financeira consolidada — caixa, pipeline, custo de IA e eventos críticos.
      </p>
    </div>
  );
}



// ---------- Card 1: Cash projection ----------
function CashCard({ instanceId }: { instanceId: string | null }) {
  const [data, setData] = useState<CashProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (force = false) => {
    if (!instanceId) return;
    setLoading(true); setError(null);
    const cacheKey = `reports.cash.${instanceId}.v2`;
    if (!force) {
      const cached = readCache<CashProjection>(cacheKey, 60 * 60 * 1000);
      if (cached) { setData(cached); setLoading(false); return; }
    }
    try {
      const { data: resp, error } = await supabase.functions.invoke("reports-cash-projection", {
        body: { instance_id: instanceId },
      });
      if (error) throw error;
      const payload = (resp?.data ?? {}) as CashProjection;
      setData(payload);
      writeCache(cacheKey, payload);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar projeção");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (instanceId) load(false); /* eslint-disable-next-line */ }, [instanceId]);

  const weeks = data?.by_week ?? [];
  const chartData = useMemo(() => {
    let acc = Number(data?.balance_brl ?? 0);
    return weeks.map((w) => {
      acc += Number(w.net_brl) || 0;
      return { date: w.to, balance_brl: acc };
    });
  }, [weeks, data?.balance_brl]);
  const minNeg = Math.min(0, ...chartData.map((d) => d.balance_brl));
  const projectedNeg = Number(data?.projected_balance_brl ?? 0) < 0;
  const periodDays = data?.projection_days ?? 90;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Projeção de caixa</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Próximos {periodDays} dias</p>
        </div>
        <Button size="icon" variant="ghost" onClick={() => load(true)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <Skeleton className="h-64 w-full" /> : error ? (
          <EmptyState title="Não foi possível carregar" description={error} />
        ) : weeks.length === 0 ? (
          <EmptyState title="Sem dados de projeção ainda" description="O agente ainda não retornou dados de caixa." />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Saldo atual" value={formatCurrencyBRL(data?.balance_brl)} negative={(data?.balance_brl ?? 0) < 0} />
              <Stat label="Entradas previstas" value={formatCurrencyBRL(data?.incoming_brl)} icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} />
              <Stat label="Saídas previstas" value={formatCurrencyBRL(data?.outgoing_brl)} icon={<TrendingDown className="h-4 w-4 text-red-500" />} />
              <Stat label="Saldo projetado" value={formatCurrencyBRL(data?.projected_balance_brl)} negative={projectedNeg} />
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="cashPos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="cashNeg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => String(d).slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrencyBRL(Number(v)).replace("R$", "")} width={70} />
                  <RTooltip
                    formatter={(v: number) => formatCurrencyBRL(v)}
                    labelClassName="text-xs"
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  {minNeg < 0 && (
                    <Area
                      type="monotone" dataKey={(d: { balance_brl: number }) => Math.min(0, Number(d.balance_brl) || 0)}
                      stroke="hsl(var(--destructive))" fill="url(#cashNeg)" isAnimationActive={false}
                    />
                  )}
                  <Area
                    type="monotone" dataKey="balance_brl"
                    stroke="hsl(var(--primary))" strokeWidth={2}
                    fill="url(#cashPos)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, icon, negative }: { label: string; value: string; icon?: React.ReactNode; negative?: boolean }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className={`mt-1 text-base font-semibold tabular-nums ${negative ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

// ---------- Card 2: Pipeline ----------
function PipelineCard({ instanceId }: { instanceId: string | null }) {
  const [data, setData] = useState<PipelineProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (force = false) => {
    if (!instanceId) return;
    setLoading(true); setError(null);
    const cacheKey = `reports.pipeline.${instanceId}`;
    if (!force) {
      const cached = readCache<PipelineProjection>(cacheKey, 60 * 60 * 1000);
      if (cached) { setData(cached); setLoading(false); return; }
    }
    try {
      const { data: resp, error } = await supabase.functions.invoke("reports-pipeline-projection", {
        body: { instance_id: instanceId },
      });
      if (error) throw error;
      const payload = (resp?.data ?? {}) as PipelineProjection;
      setData(payload);
      writeCache(cacheKey, payload);
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar pipeline");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (instanceId) load(false); /* eslint-disable-next-line */ }, [instanceId]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Pipeline ponderado</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Estágios e janelas de fechamento</p>
        </div>
        <Button size="icon" variant="ghost" onClick={() => load(true)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <Skeleton className="h-64 w-full" /> : error ? (
          <EmptyState title="Não foi possível carregar" description={error} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Stat label="Total em aberto" value={formatCurrencyBRL(data?.total_open_brl)} />
              <Stat label="Esperado ponderado" value={formatCurrencyBRL(data?.weighted_expected_brl)} />
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer>
                <BarChart data={data?.by_stage ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="stage" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrencyBRL(Number(v)).replace("R$", "")} width={70} />
                  <RTooltip
                    formatter={(v: number) => formatCurrencyBRL(v)}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                  />
                  <Bar dataKey="total_brl" fill="hsl(var(--muted-foreground))" name="Total" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="weighted_brl" fill="hsl(var(--primary))" name="Ponderado" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {(data?.by_close_window ?? []).length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Janela</TableHead>
                    <TableHead className="text-right">Negócios</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Ponderado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.by_close_window!.map((w) => (
                    <TableRow key={w.window}>
                      <TableCell className="font-medium">{w.window}</TableCell>
                      <TableCell className="text-right tabular-nums">{w.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrencyBRL(w.total_brl)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrencyBRL(w.weighted_brl)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Card 3: LLM cost ----------
function LlmCostCard() {
  const [rows, setRows] = useState<LlmRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from("llm_usage")
        .select("created_at, cost_brl")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true })
        .limit(5000);
      setRows((data as LlmRow[] | null) ?? []);
      setLoading(false);
    })();
  }, []);

  const series = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of lastNDays(30)) map.set(d, 0);
    for (const r of rows) {
      const k = (r.created_at ?? "").slice(0, 10);
      if (map.has(k)) map.set(k, (map.get(k) ?? 0) + Number(r.cost_brl ?? 0));
    }
    return Array.from(map.entries()).map(([date, cost]) => ({ date, cost }));
  }, [rows]);

  const total = series.reduce((s, r) => s + r.cost, 0);
  const pct = LLM_BUDGET > 0 ? Math.min(100, (total / LLM_BUDGET) * 100) : 0;
  const barColor = pct < 70 ? "bg-emerald-500" : pct < 90 ? "bg-amber-500" : "bg-red-500";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Custo LLM (mês corrente)</CardTitle>
        <p className="text-xs text-muted-foreground mt-1">Últimos 30 dias vs orçamento</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <Skeleton className="h-48 w-full" /> : (
          <>
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="font-medium">{formatCurrencyBRL(total)} de {formatCurrencyBRL(LLM_BUDGET)}</span>
                <span className="text-muted-foreground tabular-nums">{pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="h-48 w-full">
              <ResponsiveContainer>
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => String(d).slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} width={50} />
                  <RTooltip
                    formatter={(v: number) => formatCurrencyBRL(v)}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                  />
                  <ReferenceLine
                    y={LLM_BUDGET / 30}
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    label={{ value: "Meta diária", fontSize: 10, fill: "hsl(var(--muted-foreground))", position: "right" }}
                  />
                  <Line type="monotone" dataKey="cost" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Card 4: Critical events ----------
function CriticalEventsCard() {
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<Severity, boolean>>({ warn: true, error: true, critical: true });

  useEffect(() => {
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const { data } = await supabase
        .from("events")
        .select("id, type, severity, created_at, payload")
        .in("severity", ["warn", "error", "critical"])
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);
      setRows((data as EventRow[] | null) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(
    () => rows.filter((r) => filters[r.severity as Severity] ?? false),
    [rows, filters],
  );

  const series = useMemo(() => {
    const days = lastNDays(30);
    const base = new Map<string, { date: string } & Record<Severity, number>>(
      days.map((d) => [d, { date: d, warn: 0, error: 0, critical: 0 }]),
    );
    for (const r of filtered) {
      const k = (r.created_at ?? "").slice(0, 10);
      const bucket = base.get(k);
      if (bucket && SEVERITY_KEYS.includes(r.severity as Severity)) {
        bucket[r.severity as Severity] += 1;
      }
    }
    return Array.from(base.values());
  }, [filtered]);

  const recent = filtered.slice(0, 10);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Eventos críticos (30 dias)
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{filtered.length} eventos no período</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SEVERITY_KEYS.map((s) => (
            <button
              key={s}
              onClick={() => setFilters((f) => ({ ...f, [s]: !f[s] }))}
              className="focus:outline-none"
            >
              <Badge variant={filters[s] ? "default" : "outline"} className="cursor-pointer capitalize">
                {s}
              </Badge>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <Skeleton className="h-48 w-full" /> : (
          <>
            <div className="h-48 w-full">
              <ResponsiveContainer>
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => String(d).slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} width={30} allowDecimals={false} />
                  <RTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                  />
                  {SEVERITY_KEYS.filter((s) => filters[s]).map((s) => (
                    <Bar key={s} dataKey={s} stackId="sev" fill={SEVERITY_COLOR[s]} radius={[2, 2, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            {recent.length === 0 ? (
              <EmptyState title="Nenhum evento no filtro atual." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Severidade</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell><SeverityBadge severity={e.severity} /></TableCell>
                      <TableCell className="font-mono text-xs">{e.type}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{formatRelative(e.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- cache helpers (localStorage TTL) ----------
function readCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > ttlMs) return null;
    return data as T;
  } catch { return null; }
}
function writeCache<T>(key: string, data: T) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch { /* ignore */ }
}

// silence unused toast import warning if needed
void toast;
