import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Zap, Play, Plus, Sparkles, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { formatRelative } from "@/lib/format";
import type { Automation, AutomationRun, AutomationTemplate } from "@/types/automations";

export const Route = createFileRoute("/_authenticated/automations/")({
  head: () => ({ meta: [{ title: "Automações — Agente CFO" }] }),
  component: AutomationsListPage,
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

type ListResponse = {
  automations: Automation[];
  runs_by_automation: Record<string, AutomationRun | undefined>;
};

async function fetchAutomations(): Promise<{ data: ListResponse; backendOk: boolean }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/automations-list`, {
      method: "GET",
      headers: await authHeaders(),
    });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as ListResponse;
    return { data: json, backendOk: true };
  } catch {
    // Fallback: read directly from supabase table
    const { data: rows } = await supabase
      .from("automations")
      .select("*")
      .order("updated_at", { ascending: false });
    const automations = ((rows ?? []) as unknown) as Automation[];
    return {
      data: { automations, runs_by_automation: {} },
      backendOk: false,
    };
  }
}

async function fetchTemplates(): Promise<AutomationTemplate[]> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/automations-templates-list`, {
      method: "GET",
      headers: await authHeaders(),
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as AutomationTemplate[];
  } catch {
    return [];
  }
}

function statusIcon(status?: AutomationRun["status"]) {
  if (!status) return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === "succeeded") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  if (status === "failed" || status === "expired") return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  if (status === "pending_confirm") return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />;
  return <Clock className="h-3.5 w-3.5 text-sky-400" />;
}

import { ACTION_META, describeCron, formatBRL, metricLabel, NUMBER_OPERATOR_LABELS } from "@/components/automation-builder/constants";

const RUN_STATUS_LABEL_SHORT: Record<string, string> = {
  succeeded: "✓ executou",
  failed: "✗ falhou",
  pending_confirm: "⏳ aguarda confirmação",
  running: "⚙️ rodando",
  cancelled: "✕ cancelada",
  expired: "⌛ expirada",
};

function summarizeTrigger(t: Automation["trigger"]): string {
  if (!t) return "—";
  if (t.type === "cron") return describeCron(t.expression);
  if (t.type === "metric") {
    const op = NUMBER_OPERATOR_LABELS[t.operator] ?? t.operator;
    const monetary = /brl|amount|valor|saldo/i.test(t.metric);
    const val = monetary ? formatBRL(t.value) : String(t.value);
    return `${metricLabel(t.metric)} ${op} ${val}`;
  }
  return "manual";
}

function summarizeActions(actions: Automation["actions"]): string {
  if (!actions?.length) return "(sem ações)";
  return actions.map((a) => `${ACTION_META[a.type].icon} ${ACTION_META[a.type].label}`).join(" → ");
}

function AutomationsListPage() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["automations-list"],
    queryFn: fetchAutomations,
    refetchInterval: 15000,
  });
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  useEffect(() => {
    if (!templatesOpen) return;
    setTemplatesLoading(true);
    fetchTemplates().then((t) => {
      setTemplates(t);
      setTemplatesLoading(false);
    });
  }, [templatesOpen]);

  const backendOk = data?.backendOk ?? true;
  const automations = data?.data.automations ?? [];
  const runs = data?.data.runs_by_automation ?? {};

  async function toggleActive(a: Automation, next: boolean) {
    const prev = a.active;
    a.active = next;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/automations-save`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ ...a, active: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(next ? "Automação ativada" : "Automação pausada");
    } catch {
      // fallback direto na tabela
      const { error } = await supabase.from("automations").update({ active: next }).eq("id", a.id);
      if (error) {
        a.active = prev;
        toast.error("Falha ao alternar");
        return;
      }
      toast.success(next ? "Ativada (modo offline)" : "Pausada (modo offline)");
    }
    refetch();
  }

  async function runNow(id: string) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/automations-run-now`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ automation_id: id }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success("Execução disparada");
      navigate({ to: "/automations/$id", params: { id } });
    } catch {
      toast.error("Backend de execução indisponível");
    }
  }

  async function createBlank() {
    const empty = {
      name: "Nova automação",
      description: null,
      trigger: { type: "manual" } as const,
      conditions: [],
      actions: [],
      active: false,
      require_confirmation: true,
    };
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/automations-save`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(empty),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const id = json?.id ?? json?.automation?.id;
      if (id) navigate({ to: "/automations/$id", params: { id } });
      else throw new Error("no id");
    } catch {
      const { data: row, error } = await supabase
        .from("automations")
        .insert(empty as never)
        .select()
        .single();
      if (error || !row) {
        toast.error("Não foi possível criar");
        return;
      }
      navigate({ to: "/automations/$id", params: { id: (row as { id: string }).id } });
    }
  }

  async function createFromTemplate(t: AutomationTemplate) {
    const payload = {
      name: t.name,
      description: t.description,
      trigger: t.trigger,
      conditions: t.conditions ?? [],
      actions: t.actions ?? [],
      active: false,
      require_confirmation: true,
      template_key: t.template_key,
    };
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/automations-save`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      const id = json?.id ?? json?.automation?.id;
      setTemplatesOpen(false);
      if (id) navigate({ to: "/automations/$id", params: { id } });
    } catch {
      toast.error("Backend indisponível para criar via template");
    }
  }

  const empty = useMemo(() => !isLoading && automations.length === 0, [isLoading, automations]);

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Zap className="h-7 w-7 text-primary" /> Automações
          </h1>
          <p className="text-muted-foreground mt-1 max-w-xl">
            Conecte triggers a ações. Marcos executa pra você, com sua confirmação quando necessário.
          </p>
        </div>
        <div className="flex gap-2">
          <Sheet open={templatesOpen} onOpenChange={setTemplatesOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Sparkles className="h-4 w-4" /> Templates
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Templates prontos</SheetTitle>
                <SheetDescription>Comece de um modelo testado. Você pode editar depois.</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3">
                {templatesLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
                {!templatesLoading && templates.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum template disponível. Backend `automations-templates-list` ainda não deployado.
                  </p>
                )}
                {templates.map((t) => (
                  <Card key={t.template_key} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => createFromTemplate(t)}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        {t.name}
                        {t.recommended && <Badge variant="secondary" className="text-[10px]">recomendado</Badge>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground space-y-1">
                      <p>{t.description}</p>
                      <p className="font-mono text-[10px]">trigger: {summarizeTrigger(t.trigger)}</p>
                      <p className="font-mono text-[10px]">ações: {summarizeActions(t.actions)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </SheetContent>
          </Sheet>
          <Button onClick={createBlank} className="gap-2">
            <Plus className="h-4 w-4" /> Do zero
          </Button>
        </div>
      </header>

      {!backendOk && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-200/90 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            Backend de automações em deploy. A UI funciona para edição mas execução real
            requer as edge functions. Salvamentos vão direto na tabela como fallback.
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {empty && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-3">
            <Zap className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Você ainda não criou automações.</p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
                <Sparkles className="h-4 w-4" /> Ver templates
              </Button>
              <Button onClick={createBlank}>
                <Plus className="h-4 w-4" /> Criar do zero
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {automations.map((a) => {
          const last = runs[a.id];
          return (
            <Card key={a.id} className="hover:border-primary/40 transition-colors group">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <Switch checked={a.active} onCheckedChange={(v) => toggleActive(a, v)} aria-label="Ativar/pausar" />
                </div>
                <Link to="/automations/$id" params={{ id: a.id }} className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium truncate">{a.name}</h3>
                    {a.require_confirmation && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-300">
                        confirma
                      </Badge>
                    )}
                    {a.template_key && (
                      <Badge variant="secondary" className="text-[10px] font-mono">{a.template_key}</Badge>
                    )}
                  </div>
                  {a.description && (
                    <p className="text-xs text-muted-foreground truncate mb-1">{a.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground font-mono tabular-nums truncate">
                    {summarizeTrigger(a.trigger)} · {summarizeActions(a.actions)}
                  </p>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                    {statusIcon(last?.status)}
                    {last ? (
                      <>
                        {RUN_STATUS_LABEL_SHORT[last.status] ?? last.status} · {formatRelative(last.started_at)}
                      </>
                    ) : a.last_run_at ? (
                      <>último: {formatRelative(a.last_run_at)}</>
                    ) : (
                      <>nunca executou</>
                    )}
                  </div>
                </Link>
                <Button size="sm" variant="outline" className="gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => runNow(a.id)}>
                  <Play className="h-3.5 w-3.5" /> Executar
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
