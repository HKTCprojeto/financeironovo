import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowUp, ArrowDown, X, Plus, Save, Play, FlaskConical,
  AlertTriangle, CheckCircle2, Clock, XCircle, Trash2, ChevronRight,
} from "lucide-react";
import { formatRelative } from "@/lib/format";
import {
  type Automation, type AutomationAction, type AutomationActionType,
  type AutomationCondition, type AutomationRun, type AutomationTrigger,
} from "@/types/automations";
import { MetricSelect } from "@/components/automation-builder/MetricSelect";
import { MoneyInput } from "@/components/automation-builder/MoneyInput";
import { FrequencyPicker } from "@/components/automation-builder/FrequencyPicker";
import { DescriptiveSentence } from "@/components/automation-builder/DescriptiveSentence";
import { VariablePills } from "@/components/automation-builder/VariablePills";
import {
  ACTION_META, NUMBER_OPERATOR_LABELS, RUN_STATUS_LABEL,
} from "@/components/automation-builder/constants";

export const Route = createFileRoute("/_authenticated/automations/$id")({
  head: () => ({ meta: [{ title: "Editar automação — Agente CFO" }] }),
  component: AutomationEditorPage,
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    apikey: SUPABASE_ANON,
    "Content-Type": "application/json",
  };
}

const ACTION_TYPES: AutomationActionType[] = [
  "send_report", "send_whatsapp", "crm_update_deal", "crm_create_task",
  "erp_create_invoice", "cobranca_send", "ask_owner_confirm", "ai_decide",
];

function defaultActionFor(type: AutomationActionType): AutomationAction {
  switch (type) {
    case "send_report": return { type, report_type: "cash", deliver_to: "owner" };
    case "send_whatsapp": return { type, to: "owner", template: "" };
    case "crm_update_deal": return { type, deal_id: "{{trigger.deal_id}}", fields: {} };
    case "crm_create_task": return { type, title: "", due_date: "", related_to: "" };
    case "erp_create_invoice": return { type, customer: "", items: [], due_date: "" };
    case "cobranca_send": return { type, customer_id: "", amount: 0, due_date: "" };
    case "ask_owner_confirm": return { type, question: "Posso seguir?" };
    case "ai_decide": return { type, context: "", options: [] };
  }
}

function isCronValid(expr: string): boolean {
  return expr.trim().split(/\s+/).length === 5;
}

async function fetchOne(id: string): Promise<Automation | null> {
  const { data, error } = await supabase.from("automations").select("*").eq("id", id).single();
  if (error || !data) return null;
  return (data as unknown) as Automation;
}

async function fetchRuns(id: string): Promise<AutomationRun[]> {
  const { data } = await supabase
    .from("automation_runs")
    .select("*")
    .eq("automation_id", id)
    .order("started_at", { ascending: false })
    .limit(30);
  return ((data ?? []) as unknown) as AutomationRun[];
}

function statusIcon(status: AutomationRun["status"]) {
  if (status === "succeeded") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "failed" || status === "expired") return <XCircle className="h-4 w-4 text-destructive" />;
  if (status === "pending_confirm") return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  if (status === "cancelled") return <XCircle className="h-4 w-4 text-muted-foreground" />;
  return <Clock className="h-4 w-4 text-sky-400" />;
}

function isMetricMonetary(metric: string): boolean {
  return /brl|amount|valor|saldo/i.test(metric);
}

function AutomationEditorPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: loaded, refetch } = useQuery({
    queryKey: ["automation", id],
    queryFn: () => fetchOne(id),
  });
  const { data: runs = [], refetch: refetchRuns } = useQuery({
    queryKey: ["automation-runs", id],
    queryFn: () => fetchRuns(id),
    refetchInterval: 10000,
  });

  const [draft, setDraft] = useState<Automation | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [testResult, setTestResult] = useState<Array<Record<string, unknown>> | null>(null);
  const lastSnapshot = useRef<string>("");

  useEffect(() => {
    if (loaded) {
      setDraft(structuredClone(loaded));
      lastSnapshot.current = JSON.stringify(loaded);
    }
  }, [loaded]);

  useEffect(() => {
    const ch = supabase
      .channel(`auto-runs-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "automation_runs", filter: `automation_id=eq.${id}` },
        () => refetchRuns(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, refetchRuns]);

  if (!draft) {
    return (
      <div className="container max-w-6xl py-8">
        <Link to="/automations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Automações
        </Link>
        <p className="mt-6 text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  const d: Automation = draft;
  const dirty = JSON.stringify({
    name: d.name, description: d.description, trigger: d.trigger,
    conditions: d.conditions, actions: d.actions, active: d.active,
    require_confirmation: d.require_confirmation,
  }) !== JSON.stringify({
    name: loaded?.name, description: loaded?.description, trigger: loaded?.trigger,
    conditions: loaded?.conditions, actions: loaded?.actions, active: loaded?.active,
    require_confirmation: loaded?.require_confirmation,
  });

  const update = (patch: Partial<Automation>) => setDraft({ ...d, ...patch });
  const updateTrigger = (t: AutomationTrigger) => update({ trigger: t });

  const addAction = (type: AutomationActionType) => {
    update({ actions: [...d.actions, defaultActionFor(type)] });
  };
  const moveAction = (idx: number, dir: -1 | 1) => {
    const next = [...d.actions];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    update({ actions: next });
  };
  const removeAction = (idx: number) => {
    update({ actions: d.actions.filter((_, i) => i !== idx) });
  };
  const patchAction = (idx: number, patch: Partial<AutomationAction>) => {
    const next = d.actions.map((a, i) => (i === idx ? ({ ...a, ...patch } as AutomationAction) : a));
    update({ actions: next });
  };

  const addCondition = () => update({
    conditions: [...d.conditions, { field: "balance_brl", op: "eq", value: "" } as AutomationCondition],
  });
  const patchCondition = (idx: number, patch: Partial<AutomationCondition>) => {
    update({ conditions: d.conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)) });
  };
  const removeCondition = (idx: number) => {
    update({ conditions: d.conditions.filter((_, i) => i !== idx) });
  };

  async function save() {
    if (d.actions.length === 0) {
      toast.error("Adicione pelo menos uma ação");
      return;
    }
    if (d.trigger.type === "cron" && !isCronValid(d.trigger.expression)) {
      toast.error("Expressão de agendamento inválida");
      return;
    }
    setSaving(true);
    const payload = {
      id: d.id, name: d.name, description: d.description,
      trigger: d.trigger, conditions: d.conditions, actions: d.actions,
      active: d.active, require_confirmation: d.require_confirmation,
      template_key: d.template_key,
    };
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/automations-save`, {
        method: "POST", headers: await authHeaders(), body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success("Salvo");
      setSavedAt(new Date());
    } catch {
      const { error } = await supabase
        .from("automations")
        .update({
          name: d.name, description: d.description,
          trigger: d.trigger as never, conditions: d.conditions as never,
          actions: d.actions as never, active: d.active,
          require_confirmation: d.require_confirmation,
        })
        .eq("id", d.id);
      if (error) toast.error("Falha ao salvar");
      else { toast.success("Salvo (modo offline)"); setSavedAt(new Date()); }
    } finally {
      setSaving(false);
      refetch();
    }
  }

  async function runNow() {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/automations-run-now`, {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({ automation_id: d.id }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success("Disparado");
      refetchRuns();
    } catch { toast.error("Backend de execução indisponível"); }
  }

  async function test() {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/automations-test`, {
        method: "POST", headers: await authHeaders(),
        body: JSON.stringify({ actions: d.actions, trigger_payload: {} }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      setTestResult(json.steps ?? []);
      toast.success("Preview gerado");
    } catch { toast.error("Backend de teste indisponível"); }
  }

  async function deleteIt() {
    if (!confirm("Excluir esta automação?")) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/automations-delete?id=${d.id}`, {
        method: "DELETE", headers: await authHeaders(),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      await supabase.from("automations").delete().eq("id", d.id);
    }
    toast.success("Excluído");
    navigate({ to: "/automations" });
  }

  return (
    <div className="container max-w-7xl py-6 space-y-4">
      {/* Sticky save bar */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur border-b">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/automations" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0">
              <ArrowLeft className="h-3.5 w-3.5" /> Automações
            </Link>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {dirty ? (
                <span className="text-amber-400">● alterações não salvas</span>
              ) : savedAt ? (
                <span className="text-emerald-400">✓ salvo agora</span>
              ) : (
                <span>tudo salvo</span>
              )}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={deleteIt} className="text-destructive hover:text-destructive gap-1.5">
              <Trash2 className="h-4 w-4" /> Excluir
            </Button>
            <Button variant="outline" size="sm" onClick={test} className="gap-1.5">
              <FlaskConical className="h-4 w-4" /> Testar
            </Button>
            <Button variant="outline" size="sm" onClick={runNow} className="gap-1.5">
              <Play className="h-4 w-4" /> Executar agora
            </Button>
            <Button size="sm" onClick={save} disabled={saving || !dirty} className="gap-1.5">
              <Save className="h-4 w-4" /> {saving ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </div>

      <DescriptiveSentence draft={d} />

      <Tabs defaultValue="builder" className="lg:hidden">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="builder">Editar</TabsTrigger>
          <TabsTrigger value="log">Histórico ({runs.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="builder">
          <BuilderColumn
            draft={d} update={update} updateTrigger={updateTrigger}
            addAction={addAction} moveAction={moveAction} removeAction={removeAction} patchAction={patchAction}
            addCondition={addCondition} patchCondition={patchCondition} removeCondition={removeCondition}
            testResult={testResult}
          />
        </TabsContent>
        <TabsContent value="log"><RunsColumn runs={runs} /></TabsContent>
      </Tabs>

      <div className="hidden lg:grid grid-cols-[1fr_360px] gap-6">
        <BuilderColumn
          draft={d} update={update} updateTrigger={updateTrigger}
          addAction={addAction} moveAction={moveAction} removeAction={removeAction} patchAction={patchAction}
          addCondition={addCondition} patchCondition={patchCondition} removeCondition={removeCondition}
          testResult={testResult}
        />
        <RunsColumn runs={runs} />
      </div>
    </div>
  );
}

type BuilderProps = {
  draft: Automation;
  update: (p: Partial<Automation>) => void;
  updateTrigger: (t: AutomationTrigger) => void;
  addAction: (t: AutomationActionType) => void;
  moveAction: (i: number, d: -1 | 1) => void;
  removeAction: (i: number) => void;
  patchAction: (i: number, p: Partial<AutomationAction>) => void;
  addCondition: () => void;
  patchCondition: (i: number, p: Partial<AutomationCondition>) => void;
  removeCondition: (i: number) => void;
  testResult: Array<Record<string, unknown>> | null;
};

function BuilderColumn(p: BuilderProps) {
  const { draft: d, update, updateTrigger, addAction, moveAction, removeAction, patchAction,
    addCondition, patchCondition, removeCondition, testResult } = p;
  const [actionPickerOpen, setActionPickerOpen] = useState(false);
  const [conditionsOpen, setConditionsOpen] = useState(d.conditions.length > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <Input
            value={d.name}
            onChange={(e) => update({ name: e.target.value })}
            className="text-lg font-semibold border-0 px-0 shadow-none focus-visible:ring-0"
            placeholder="Nome da automação"
          />
          <Textarea
            value={d.description ?? ""}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Para que serve essa automação? (opcional)"
            rows={2}
            className="border-0 px-0 shadow-none focus-visible:ring-0 resize-none"
          />
          <div className="flex items-center gap-6 pt-2 border-t flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={d.active} onCheckedChange={(v) => update({ active: v })} />
              Ativa
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={d.require_confirmation}
                onCheckedChange={(v) => update({ require_confirmation: v })}
              />
              Pedir minha confirmação antes de executar
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Quando essa automação roda?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {(["cron", "metric", "manual"] as const).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={d.trigger.type === t ? "default" : "outline"}
                onClick={() => {
                  if (t === "cron") updateTrigger({ type: "cron", expression: "0 9 * * 1" });
                  else if (t === "metric") updateTrigger({ type: "metric", metric: "balance_brl", operator: "lt", value: 50000 });
                  else updateTrigger({ type: "manual" });
                }}
                className="h-auto py-2 text-xs whitespace-normal"
              >
                {t === "cron" ? "Em data/hora específica" : t === "metric" ? "Quando algum número mudar" : "Só quando eu mandar"}
              </Button>
            ))}
          </div>

          {d.trigger.type === "cron" && (() => {
            const tr = d.trigger as Extract<AutomationTrigger, { type: "cron" }>;
            return (
              <FrequencyPicker
                expression={tr.expression}
                onChange={(expr) => updateTrigger({ type: "cron", expression: expr })}
              />
            );
          })()}

          {d.trigger.type === "metric" && (() => {
            const tr = d.trigger as Extract<AutomationTrigger, { type: "metric" }>;
            const monetary = isMetricMonetary(tr.metric);
            return (
              <div className="space-y-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Qual número monitorar</Label>
                  <MetricSelect value={tr.metric} onChange={(v) => updateTrigger({ ...tr, metric: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Quando ele ficar</Label>
                    <Select value={tr.operator} onValueChange={(v) => updateTrigger({ ...tr, operator: v as typeof tr.operator })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(["lt", "lte", "eq", "gte", "gt"] as const).map((op) => (
                          <SelectItem key={op} value={op}>{NUMBER_OPERATOR_LABELS[op]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Valor</Label>
                    {monetary ? (
                      <MoneyInput value={tr.value} onChange={(v) => updateTrigger({ ...tr, value: v })} />
                    ) : (
                      <Input
                        type="number"
                        value={tr.value}
                        onChange={(e) => updateTrigger({ ...tr, value: Number(e.target.value) })}
                        className="tabular-nums"
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {d.trigger.type === "manual" && (
            <p className="text-xs text-muted-foreground">
              Roda apenas quando você clicar em "Executar agora" ou pedir pro Marcos no chat.
            </p>
          )}
        </CardContent>
      </Card>

      <Collapsible open={conditionsOpen} onOpenChange={setConditionsOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <button type="button" className="w-full flex items-center justify-between p-4 text-left hover:bg-accent/30 transition-colors">
              <div>
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <ChevronRight className={`h-4 w-4 transition-transform ${conditionsOpen ? "rotate-90" : ""}`} />
                  Adicionar regras avançadas (opcional)
                  {d.conditions.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-[10px]">{d.conditions.length}</Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 ml-5">
                  Filtros adicionais sobre os dados do gatilho. Use só se precisar limitar quando a automação roda.
                </p>
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-2 pt-0">
              {d.conditions.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_140px_1fr_auto] gap-2 items-end">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Campo</Label>
                    <MetricSelect value={c.field} onChange={(v) => patchCondition(i, { field: v })} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Comparação</Label>
                    <Select value={c.op} onValueChange={(v) => patchCondition(i, { op: v as AutomationCondition["op"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in"] as const).map((op) => (
                          <SelectItem key={op} value={op}>{NUMBER_OPERATOR_LABELS[op] ?? op}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Valor</Label>
                    {isMetricMonetary(c.field) ? (
                      <MoneyInput
                        value={Number(c.value) || 0}
                        onChange={(v) => patchCondition(i, { value: v })}
                      />
                    ) : (
                      <Input
                        value={String(c.value ?? "")}
                        onChange={(e) => patchCondition(i, { value: e.target.value })}
                      />
                    )}
                  </div>
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => removeCondition(i)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={addCondition} className="gap-1 mt-2">
                <Plus className="h-3.5 w-3.5" /> Adicionar regra
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">O que o Marcos vai fazer</CardTitle>
          <Popover open={actionPickerOpen} onOpenChange={setActionPickerOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1">
                <Plus className="h-3.5 w-3.5" /> Adicionar ação
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-80" align="end">
              <Command>
                <CommandInput placeholder="Buscar ação…" />
                <CommandList>
                  <CommandEmpty>Nada encontrado</CommandEmpty>
                  <CommandGroup>
                    {ACTION_TYPES.map((t) => {
                      const meta = ACTION_META[t];
                      return (
                        <CommandItem
                          key={t}
                          onSelect={() => { addAction(t); setActionPickerOpen(false); }}
                          className="flex items-center gap-2"
                        >
                          <span className="text-base">{meta.icon}</span>
                          <span className="text-sm">{meta.label}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </CardHeader>
        <CardContent className="space-y-3">
          {d.actions.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-md">
              Nenhuma ação ainda. Clique em "Adicionar ação" pra começar.
            </div>
          )}
          {d.actions.map((a, i) => (
            <ActionCard
              key={i}
              idx={i}
              total={d.actions.length}
              action={a}
              onMove={moveAction}
              onRemove={removeAction}
              onPatch={patchAction}
            />
          ))}
        </CardContent>
      </Card>

      {testResult && (
        <Card className="border-sky-500/30 bg-sky-500/5">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Preview do teste</CardTitle>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { /* no-op handled by re-test */ }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent>
            <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ActionCard({
  idx, total, action, onMove, onRemove, onPatch,
}: {
  idx: number; total: number; action: AutomationAction;
  onMove: (i: number, d: -1 | 1) => void;
  onRemove: (i: number) => void;
  onPatch: (i: number, p: Partial<AutomationAction>) => void;
}) {
  const meta = ACTION_META[action.type];
  const impactColor =
    meta.impact === "modifies_external" ? "border-amber-500/40 text-amber-300"
    : meta.impact === "asks_confirm" ? "border-sky-500/40 text-sky-300"
    : "border-emerald-500/40 text-emerald-300";

  return (
    <div className="rounded-md border bg-card/40 p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-xs text-muted-foreground tabular-nums mt-0.5">{idx + 1}.</span>
          <span className="text-base shrink-0">{meta.icon}</span>
          <div className="min-w-0">
            <div className="font-medium text-sm">{meta.label}</div>
            <div className="text-xs text-muted-foreground">{meta.summary(action)}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Badge variant="outline" className={`text-[10px] ${impactColor}`}>
            {meta.impactLabel}
          </Badge>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === 0} onClick={() => onMove(idx, -1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={idx === total - 1} onClick={() => onMove(idx, 1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onRemove(idx)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <ActionFields action={action} onPatch={(p) => onPatch(idx, p)} />
    </div>
  );
}

function TextareaWithVariables({
  value, onChange, rows = 3, placeholder,
}: {
  value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  function insert(token: string) {
    const el = ref.current;
    if (!el) { onChange(value + token); return; }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }
  return (
    <div className="space-y-2">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
      />
      <VariablePills onInsert={insert} />
    </div>
  );
}

function ActionFields({ action, onPatch }: { action: AutomationAction; onPatch: (p: Partial<AutomationAction>) => void }) {
  switch (action.type) {
    case "send_report":
      return (
        <div>
          <Label className="text-xs text-muted-foreground">Qual relatório enviar</Label>
          <Select value={action.report_type} onValueChange={(v) => onPatch({ report_type: v as never })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Caixa (saldo + projeção)</SelectItem>
              <SelectItem value="pipeline">Pipeline de vendas</SelectItem>
              <SelectItem value="cobranca">Cobrança / inadimplência</SelectItem>
              <SelectItem value="dashboard">Dashboard completo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      );

    case "send_whatsapp":
      return (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Pra quem enviar</Label>
            <Select
              value={/^owner$/.test(action.to) ? "owner" : "other"}
              onValueChange={(v) => onPatch({ to: v === "owner" ? "owner" : action.to === "owner" ? "" : action.to })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">Pra mim (dono)</SelectItem>
                <SelectItem value="other">Pra outro número</SelectItem>
              </SelectContent>
            </Select>
            {action.to !== "owner" && (
              <Input
                placeholder="+5511999999999"
                value={action.to}
                onChange={(e) => onPatch({ to: e.target.value })}
                className="mt-2 font-mono text-sm"
              />
            )}
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Mensagem</Label>
            <TextareaWithVariables
              value={action.template}
              onChange={(v) => onPatch({ template: v })}
              placeholder="Ex: Saldo abaixo do esperado: {{kpis.balance_brl}}"
            />
          </div>
        </div>
      );

    case "crm_update_deal":
      return (
        <div className="space-y-2">
          <div>
            <Label className="text-xs text-muted-foreground">ID do deal a atualizar</Label>
            <Input
              placeholder="ex: {{trigger.deal_id}}"
              value={action.deal_id}
              onChange={(e) => onPatch({ deal_id: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
          <AdvancedJson
            label="Campos a atualizar (avançado)"
            value={action.fields}
            onChange={(v) => onPatch({ fields: v as Record<string, unknown> })}
          />
        </div>
      );

    case "crm_create_task":
      return (
        <div className="space-y-2">
          <div>
            <Label className="text-xs text-muted-foreground">Título da tarefa</Label>
            <Input value={action.title} onChange={(e) => onPatch({ title: e.target.value })} placeholder="Ex: Ligar pro cliente" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Vencimento</Label>
              <Input type="date" value={action.due_date ?? ""} onChange={(e) => onPatch({ due_date: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Relacionado a (opcional)</Label>
              <Input value={action.related_to ?? ""} onChange={(e) => onPatch({ related_to: e.target.value })} placeholder="ex: deal_id" />
            </div>
          </div>
        </div>
      );

    case "erp_create_invoice":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Cliente</Label>
              <Input value={action.customer} onChange={(e) => onPatch({ customer: e.target.value })} placeholder="Nome ou ID" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Vencimento</Label>
              <Input type="date" value={action.due_date} onChange={(e) => onPatch({ due_date: e.target.value })} />
            </div>
          </div>
          <AdvancedJson
            label="Itens da fatura (avançado)"
            value={action.items}
            onChange={(v) => onPatch({ items: Array.isArray(v) ? v : [] })}
          />
        </div>
      );

    case "cobranca_send":
      return (
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Cliente</Label>
            <Input value={action.customer_id} onChange={(e) => onPatch({ customer_id: e.target.value })} placeholder="ID" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Valor</Label>
            <MoneyInput value={action.amount} onChange={(v) => onPatch({ amount: v })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Vencimento</Label>
            <Input type="date" value={action.due_date} onChange={(e) => onPatch({ due_date: e.target.value })} />
          </div>
        </div>
      );

    case "ask_owner_confirm":
      return (
        <div>
          <Label className="text-xs text-muted-foreground">Pergunta que o Marcos vai te fazer</Label>
          <TextareaWithVariables
            value={action.question}
            onChange={(v) => onPatch({ question: v })}
            rows={2}
            placeholder="Ex: Posso enviar o relatório de caixa pro WhatsApp?"
          />
        </div>
      );

    case "ai_decide":
      return (
        <div className="space-y-2">
          <div>
            <Label className="text-xs text-muted-foreground">Contexto pra IA decidir</Label>
            <Textarea value={action.context} onChange={(e) => onPatch({ context: e.target.value })} rows={2} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Opções (separadas por vírgula)</Label>
            <Input
              value={action.options.join(", ")}
              onChange={(e) => onPatch({ options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
              placeholder="ex: enviar agora, esperar amanhã, ignorar"
            />
          </div>
        </div>
      );
  }
}

function AdvancedJson({ label, value, onChange }: { label: string; value: unknown; onChange: (v: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setText(JSON.stringify(value ?? {}, null, 2)); }, [value]);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
          {label}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            try {
              const parsed = JSON.parse(e.target.value);
              setErr(null);
              onChange(parsed);
            } catch (ex) { setErr((ex as Error).message); }
          }}
          rows={4}
          className="font-mono text-xs mt-2"
        />
        {err && <p className="text-xs text-destructive mt-1">{err}</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}

function RunsColumn({ runs }: { runs: AutomationRun[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Histórico de execuções</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
        {runs.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma execução ainda.</p>}
        {runs.map((r) => (
          <div key={r.id} className="rounded-md border bg-card/40 p-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="flex items-center gap-1.5 font-medium">
                {statusIcon(r.status)}
                {RUN_STATUS_LABEL[r.status] ?? r.status}
              </span>
              <span className="text-muted-foreground tabular-nums shrink-0">{formatRelative(r.started_at)}</span>
            </div>
            {r.error && <p className="text-xs text-destructive">{r.error}</p>}
            {r.steps?.length > 0 && (
              <div className="space-y-1 pt-1">
                {r.steps.map((s, i) => {
                  const meta = ACTION_META[s.action_type as AutomationActionType];
                  return (
                    <div key={i} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span className={s.status === "succeeded" ? "text-emerald-400" : s.status === "failed" ? "text-destructive" : ""}>
                        {s.status === "succeeded" ? "✓" : s.status === "failed" ? "✗" : "·"}
                      </span>
                      <span>{meta?.icon} {meta?.label ?? s.action_type}</span>
                      {typeof s.duration_ms === "number" && <span className="tabular-nums">({s.duration_ms}ms)</span>}
                      {s.error && <span className="text-destructive truncate">— {s.error}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

