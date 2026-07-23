import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrencyBRL } from "@/lib/format";
import type { DashboardSnapshot, Goal } from "@/types/dashboard";

export const Route = createFileRoute("/_authenticated/goals")({
  head: () => ({ meta: [{ title: "Metas — Agente CFO" }] }),
  component: GoalsPage,
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const METRICS: { value: string; label: string }[] = [
  { value: "balance_brl", label: "Saldo em caixa" },
  { value: "receivables_30d_brl", label: "A receber 30d" },
  { value: "payables_30d_brl", label: "A pagar 30d" },
  { value: "pipeline_weighted_brl", label: "Pipeline ponderado" },
  { value: "ecommerce_revenue_month_brl", label: "Receita e-commerce (mês)" },
  { value: "overdue_total_brl", label: "Inadimplência total" },
];

const OPERATORS = [
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
  { value: "eq", label: "=" },
];

const PERIODS = [
  { value: "daily", label: "Diária" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
];

async function fetchSnapshot(): Promise<DashboardSnapshot | null> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return null;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/dashboard-snapshot`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [open, setOpen] = useState(false);

  const { data: snapshot } = useQuery({ queryKey: ["dashboard-snapshot"], queryFn: fetchSnapshot, staleTime: 5 * 60 * 1000 });

  const reload = async () => {
    const { data } = await supabase.from("goals").select("*").order("created_at");
    setGoals((data as Goal[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const remove = async (id: string) => {
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) return toast.error("Erro ao remover", { description: error.message });
    toast.success("Meta removida");
    reload();
  };

  const toggleActive = async (g: Goal) => {
    const { error } = await supabase.from("goals").update({ active: !g.active }).eq("id", g.id);
    if (error) return toast.error("Erro", { description: error.message });
    reload();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Target className="h-6 w-6" /> Metas
          </h1>
          <p className="text-sm text-muted-foreground">Configure o que importa para o seu negócio.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Nova meta</Button>
          </DialogTrigger>
          <GoalDialog editing={editing} onClose={() => { setOpen(false); setEditing(null); reload(); }} />
        </Dialog>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : goals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma meta ainda. Crie a primeira para começar a acompanhar.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            const current = snapshot?.kpis?.[g.metric as keyof typeof snapshot.kpis] ?? 0;
            const target = Number(g.target_value);
            const pct = target > 0 ? (current / target) * 100 : 0;
            const ok =
              g.operator === "gte" ? current >= target :
              g.operator === "lte" ? current <= target :
              Math.abs(current - target) / Math.max(target, 1) < 0.05;
            const metricLabel = METRICS.find((m) => m.value === g.metric)?.label ?? g.metric;
            const opLabel = OPERATORS.find((o) => o.value === g.operator)?.label ?? g.operator;
            const periodLabel = PERIODS.find((p) => p.value === g.period)?.label ?? g.period;

            const barColor = ok ? "bg-emerald-500" : pct > 80 ? "bg-amber-500" : "bg-destructive";

            return (
              <Card key={g.id} className={!g.active ? "opacity-50" : ""}>
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
                        <span className="font-medium">{metricLabel}</span>
                        <span className="font-mono text-sm">{opLabel} {formatCurrencyBRL(target)}</span>
                        <Badge variant="outline" className="text-xs">{periodLabel}</Badge>
                        {ok && <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs">✓ atingida</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 font-mono tabular-nums">
                        Atual: {formatCurrencyBRL(current)} ({pct.toFixed(0)}%)
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch checked={g.active} onCheckedChange={() => toggleActive(g)} />
                      <Button variant="ghost" size="icon" onClick={() => { setEditing(g); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(g.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted rounded overflow-hidden">
                    <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GoalDialog({ editing, onClose }: { editing: Goal | null; onClose: () => void }) {
  const [metric, setMetric] = useState(editing?.metric ?? "balance_brl");
  const [operator, setOperator] = useState(editing?.operator ?? "gte");
  const [targetValue, setTargetValue] = useState(String(editing?.target_value ?? ""));
  const [period, setPeriod] = useState(editing?.period ?? "monthly");
  const [active, setActive] = useState(editing?.active ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const target = Number(targetValue.replace(/[^\d.,]/g, "").replace(",", "."));
    if (!Number.isFinite(target) || target <= 0) {
      return toast.error("Valor alvo inválido");
    }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from("goals")
          .update({ metric, operator, target_value: target, period, active })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("goals")
          .insert({ metric, operator, target_value: target, period, active });
        if (error) throw error;
      }
      toast.success(editing ? "Meta atualizada" : "Meta criada");
      onClose();
    } catch (e) {
      toast.error("Erro ao salvar", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{editing ? "Editar meta" : "Nova meta"}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Métrica</Label>
          <Select value={metric} onValueChange={setMetric}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Operador</Label>
            <Select value={operator} onValueChange={setOperator}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Período</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label>Valor alvo (BRL)</Label>
          <Input value={targetValue} onChange={(e) => setTargetValue(e.target.value)} placeholder="100000" inputMode="decimal" />
        </div>
        <div className="flex items-center justify-between border border-border rounded p-3">
          <Label>Meta ativa</Label>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">
                <Button variant="outline" size="sm" disabled className="w-full">
                  <Sparkles className="h-3.5 w-3.5" /> Sugerir meta com IA
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Em breve</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
