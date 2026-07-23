import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatCurrencyBRL, formatRelative, currentPeriod } from "@/lib/format";
import { PageSkeleton, EmptyState } from "@/components/states";

export const Route = createFileRoute("/_authenticated/llm-usage")({
  head: () => ({ meta: [{ title: "Custo LLM — Agente CFO" }] }),
  component: LlmUsagePage,
});

type Row = {
  id: number;
  session_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_brl: number;
  created_at: string;
};

function LlmUsagePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [budget, setBudget] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const period = currentPeriod();
      const usage = await supabase
        .from("llm_usage")
        .select("id, session_id, model, input_tokens, output_tokens, cost_brl, created_at")
        .eq("period", period)
        .order("cost_brl", { ascending: false })
        .limit(500);
      const data = (usage.data as Row[] | null) ?? [];
      setRows(data);
      setTotal(data.reduce((s, r) => s + Number(r.cost_brl ?? 0), 0));
      setBudget(Number(import.meta.env.VITE_LLM_BUDGET_BRL ?? 50));
      setLoading(false);
    })();
  }, []);

  const pct = budget > 0 ? Math.min(100, (total / budget) * 100) : 0;
  const color = pct < 70 ? "bg-emerald-500" : pct < 90 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Custo LLM</h1>
        <p className="text-sm text-muted-foreground">Consumo do mês corrente.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Total do mês: {formatCurrencyBRL(total)} de {formatCurrencyBRL(budget)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
            <div className={cn("h-full transition-all", color)} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{pct.toFixed(1)}% do orçamento</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Detalhamento</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4"><PageSkeleton /></div>
          ) : rows.length === 0 ? (
            <EmptyState title="Sem uso de LLM neste mês." />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Sessão</TableHead><TableHead>Modelo</TableHead>
                <TableHead className="text-right">In</TableHead><TableHead className="text-right">Out</TableHead>
                <TableHead className="text-right">Custo</TableHead><TableHead>Quando</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.session_id}</TableCell>
                    <TableCell>{r.model}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.input_tokens}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.output_tokens}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatCurrencyBRL(r.cost_brl)}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{formatRelative(r.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Progress value={pct} className="hidden" />
    </div>
  );
}
