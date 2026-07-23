import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
} from "recharts";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/observability")({
  head: () => ({ meta: [{ title: "Observabilidade — Agente CFO" }] }),
  component: ObservabilityPage,
});

type MetricRow = {
  id: number;
  metric_name: string;
  metric_value: number;
  labels: Record<string, string> | null;
  recorded_at: string;
};

const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;
const DAEMON_STALE_MS = 5 * 60 * 1000; // > 5min sem heartbeat = stale

async function fetchMetrics(): Promise<MetricRow[]> {
  const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  const { data, error } = await supabase
    .from("instance_metrics")
    .select("*")
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? []) as MetricRow[];
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

function ObservabilityPage() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["observability-metrics"],
    queryFn: fetchMetrics,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const aggregates = useMemo(() => {
    const rows = data ?? [];
    let totalRuns = 0;
    let totalErrors = 0;
    let totalTokens = 0;
    const bySkill: Record<string, number> = {};
    const durationsByTool: Record<string, number[]> = {};
    const daemonsLatest: Record<string, MetricRow> = {};

    for (const r of rows) {
      const labels = r.labels ?? {};
      switch (r.metric_name) {
        case "skill_runs_total":
        case "tool_runs_total": {
          totalRuns += Number(r.metric_value) || 0;
          const skill = (labels.skill || labels.tool || "unknown") as string;
          bySkill[skill] = (bySkill[skill] ?? 0) + (Number(r.metric_value) || 0);
          break;
        }
        case "skill_errors_total":
        case "tool_errors_total": {
          totalErrors += Number(r.metric_value) || 0;
          break;
        }
        case "llm_tokens_total":
        case "llm_tokens": {
          totalTokens += Number(r.metric_value) || 0;
          break;
        }
        case "tool_duration_ms":
        case "skill_duration_ms": {
          const tool = (labels.tool || labels.skill || "unknown") as string;
          (durationsByTool[tool] ??= []).push(Number(r.metric_value) || 0);
          break;
        }
        case "daemon_heartbeat": {
          const daemon = (labels.daemon || "unknown") as string;
          const prev = daemonsLatest[daemon];
          if (!prev || new Date(r.recorded_at) > new Date(prev.recorded_at)) {
            daemonsLatest[daemon] = r;
          }
          break;
        }
      }
    }

    const skillBars = Object.entries(bySkill)
      .map(([skill, runs]) => ({ skill, runs }))
      .sort((a, b) => b.runs - a.runs)
      .slice(0, 12);

    const toolStats = Object.entries(durationsByTool)
      .map(([tool, arr]) => {
        const sorted = [...arr].sort((a, b) => a - b);
        return {
          tool,
          samples: sorted.length,
          p50: Math.round(quantile(sorted, 0.5)),
          p95: Math.round(quantile(sorted, 0.95)),
          p99: Math.round(quantile(sorted, 0.99)),
        };
      })
      .sort((a, b) => b.p95 - a.p95);

    const now = Date.now();
    const daemons = Object.entries(daemonsLatest)
      .map(([daemon, row]) => {
        const ageMs = now - new Date(row.recorded_at).getTime();
        return { daemon, last: row.recorded_at, stale: ageMs > DAEMON_STALE_MS, ageMs };
      })
      .sort((a, b) => a.daemon.localeCompare(b.daemon));

    return { totalRuns, totalErrors, totalTokens, skillBars, toolStats, daemons };
  }, [data]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="h-5 w-5" /> Observabilidade
          </h1>
          <p className="text-sm text-muted-foreground">Métricas dos últimos 7 dias — atualiza a cada 60s.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </header>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi label="Total runs" value={aggregates.totalRuns} loading={isLoading} />
        <Kpi label="Erros" value={aggregates.totalErrors} loading={isLoading} variant={aggregates.totalErrors > 0 ? "danger" : "default"} />
        <Kpi label="Tokens LLM" value={aggregates.totalTokens} loading={isLoading} />
      </div>

      {/* Bar chart por skill */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runs por skill</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {isLoading ? (
            <Skeleton className="h-full w-full" />
          ) : aggregates.skillBars.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={aggregates.skillBars} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                <YAxis type="category" dataKey="skill" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} width={120} />
                <RTooltip
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="runs" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Sem métricas registradas ainda.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Latência por tool */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Latência por tool (ms)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : aggregates.toolStats.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead className="text-right">Amostras</TableHead>
                  <TableHead className="text-right">p50</TableHead>
                  <TableHead className="text-right">p95</TableHead>
                  <TableHead className="text-right">p99</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregates.toolStats.map((t) => (
                  <TableRow key={t.tool}>
                    <TableCell className="font-mono text-xs">{t.tool}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.samples}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.p50}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.p95}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.p99}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">Sem dados de duração.</p>
          )}
        </CardContent>
      </Card>

      {/* Daemons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saúde dos daemons</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : aggregates.daemons.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {aggregates.daemons.map((d) => (
                <div
                  key={d.daemon}
                  className="flex items-center justify-between border border-border rounded px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {d.stale ? (
                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    )}
                    <span className="font-mono text-xs truncate">{d.daemon}</span>
                  </div>
                  <span className={`text-xs font-mono ${d.stale ? "text-destructive" : "text-muted-foreground"}`}>
                    {formatRelative(d.last)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum daemon reportou heartbeat ainda.{" "}
              <Link to="/events" className="text-primary hover:underline">Ver eventos →</Link>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  label,
  value,
  loading,
  variant = "default",
}: {
  label: string;
  value: number;
  loading: boolean;
  variant?: "default" | "danger";
}) {
  return (
    <Card className={variant === "danger" ? "border-destructive/50" : ""}>
      <CardHeader className="pb-1.5">
        <CardTitle className="text-xs uppercase tracking-wider font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div
            className={`text-2xl font-semibold tabular-nums font-mono ${
              variant === "danger" && value > 0 ? "text-destructive" : ""
            }`}
          >
            {value.toLocaleString("pt-BR")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
