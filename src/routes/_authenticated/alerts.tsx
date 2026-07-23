import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Plus, Pencil, Trash2, PlayCircle, AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({ meta: [{ title: "Alertas — Agente CFO" }] }),
  component: AlertsPage,
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Channel = "panel" | "whatsapp" | "telegram";
type AlertType = "cost_anthropic" | "daemon_down" | "tool_errors" | "latency_high";

type AlertConfig = {
  id: string;
  name: string;
  type: AlertType;
  condition: Record<string, unknown>;
  channels: Channel[];
  cooldown_min: number;
  active: boolean;
  created_at: string;
};

type AlertHistory = {
  id: number;
  alert_id: string | null;
  triggered_at: string;
  payload: Record<string, unknown> | null;
  status: string;
  resolved_at: string | null;
};

const TYPE_LABEL: Record<AlertType, string> = {
  cost_anthropic: "Custo Anthropic",
  daemon_down: "Daemon down",
  tool_errors: "Erros em tool",
  latency_high: "Latência alta",
};

const DAEMON_OPTIONS = [
  "cfo-supabase-sync",
  "cfo-telegram-sync",
  "cfo-whatsapp-sync",
  "cfo-automations-engine",
  "openclaw-agent",
  "openclaw-gateway",
  "cloudflared-cfo",
];

const SKILL_OPTIONS = [
  "asaas",
  "bling",
  "contaazul",
  "granatum",
  "hubspot",
  "iugu",
  "kommo",
  "mercado-livre",
  "nibo",
  "nuvemshop",
  "omie",
  "pipedrive",
  "piperun",
  "rd-station",
  "tiny",
  "vhsys",
];

async function authedFetch(path: string, init?: RequestInit) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.json();
}

function describeCondition(type: AlertType, c: Record<string, unknown>): string {
  switch (type) {
    case "cost_anthropic":
      return `Custo mensal > R$ ${Number(c.threshold_brl ?? 0).toFixed(2)}`;
    case "daemon_down":
      return `${c.daemon ?? "?"} sem heartbeat > ${c.threshold_min ?? 5}min`;
    case "tool_errors":
      return `${c.skill ?? "?"}/${c.tool ?? "?"} falhou ${c.threshold_count ?? 3}x em ${c.window_min ?? 5}min`;
    case "latency_high":
      return `${c.skill ?? "?"} p95 > ${c.threshold_ms ?? 1000}ms em ${c.window_min ?? 5}min`;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "resolved":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />;
    case "triggered":
      return <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />;
    case "test":
      return <Info className="h-4 w-4 text-blue-500 shrink-0" />;
    default:
      return <Info className="h-4 w-4 text-muted-foreground shrink-0" />;
  }
}

function AlertsPage() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AlertConfig | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AlertConfig | null>(null);

  const { data: alerts = [], isLoading: loadingAlerts } = useQuery<AlertConfig[]>({
    queryKey: ["alerts-list"],
    queryFn: () => authedFetch("alerts-list"),
  });

  const { data: history = [], isLoading: loadingHistory, refetch: refetchHistory } = useQuery<AlertHistory[]>({
    queryKey: ["alerts-history"],
    queryFn: () => authedFetch("alerts-history-list?limit=100"),
    refetchInterval: 60_000,
  });

  const recent24h = history.filter(
    (h) => Date.now() - new Date(h.triggered_at).getTime() < 24 * 3600 * 1000,
  );

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (a: AlertConfig) => {
    setEditing(a);
    setDialogOpen(true);
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await authedFetch(`alerts-delete?id=${confirmDelete.id}`, { method: "DELETE" });
      toast.success("Alerta removido");
      qc.invalidateQueries({ queryKey: ["alerts-list"] });
    } catch (e) {
      toast.error("Falha ao remover", { description: String(e) });
    } finally {
      setConfirmDelete(null);
    }
  };

  const onTest = async (a: AlertConfig) => {
    try {
      await authedFetch("alerts-test", { method: "POST", body: JSON.stringify({ id: a.id }) });
      toast.success("Teste disparado");
      refetchHistory();
    } catch (e) {
      toast.error("Falha no teste", { description: String(e) });
    }
  };

  const onToggle = async (a: AlertConfig, active: boolean) => {
    try {
      await authedFetch("alerts-save", {
        method: "POST",
        body: JSON.stringify({ ...a, active }),
      });
      qc.invalidateQueries({ queryKey: ["alerts-list"] });
    } catch (e) {
      toast.error("Falha ao atualizar", { description: String(e) });
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bell className="h-5 w-5" /> Alertas
          </h1>
          <p className="text-sm text-muted-foreground">Configure notificações sobre seu agente.</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" /> Novo alerta
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            Histórico recente (24h)
            <Button variant="ghost" size="sm" onClick={() => refetchHistory()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <Skeleton className="h-24 w-full" />
          ) : recent24h.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum alerta nas últimas 24h.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recent24h.map((h) => {
                const message = (h.payload as { message?: string } | null)?.message ?? `Alerta ${h.status}`;
                return (
                  <li key={h.id} className="flex items-start gap-3 py-2 text-sm">
                    {statusIcon(h.status)}
                    <span className="text-xs font-mono text-muted-foreground w-12 shrink-0">
                      {new Date(h.triggered_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="flex-1">{message}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alertas configurados</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingAlerts ? (
            <Skeleton className="h-32 w-full" />
          ) : alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhum alerta configurado. Clique em "Novo alerta" para começar.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {alerts.map((a) => (
                <li key={a.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Switch checked={a.active} onCheckedChange={(v) => onToggle(a, v)} />
                      <span className="font-medium">{a.name}</span>
                      <Badge variant="outline" className="text-xs">{TYPE_LABEL[a.type]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-12">
                      {describeCondition(a.type, a.condition)}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5 ml-12">
                      Canais: {a.channels.join(", ") || "—"} · Cooldown {a.cooldown_min}min
                    </p>
                  </div>
                  <div className="flex items-center gap-1 ml-12 sm:ml-0">
                    <Button variant="ghost" size="sm" onClick={() => onTest(a)} title="Testar">
                      <PlayCircle className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(a)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      
      <AlertEditor
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["alerts-list"] });
          setDialogOpen(false);
        }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover alerta?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" será removido. Histórico antigo é preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AlertEditor({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: AlertConfig | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AlertType>("cost_anthropic");
  const [cooldown, setCooldown] = useState(30);
  const [channels, setChannels] = useState<Record<Channel, boolean>>({ panel: true, whatsapp: false, telegram: false });
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // condition fields
  const [costThreshold, setCostThreshold] = useState(50);
  const [daemon, setDaemon] = useState(DAEMON_OPTIONS[0]);
  const [daemonMin, setDaemonMin] = useState(5);
  const [skill, setSkill] = useState(SKILL_OPTIONS[0]);
  const [tool, setTool] = useState("");
  const [errCount, setErrCount] = useState(3);
  const [errWindow, setErrWindow] = useState(5);
  const [latMs, setLatMs] = useState(2000);
  const [latWindow, setLatWindow] = useState(5);

  // hydrate when opening (run only on open changes)
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setType(editing.type);
      setCooldown(editing.cooldown_min);
      setActive(editing.active);
      setChannels({
        panel: editing.channels.includes("panel"),
        whatsapp: editing.channels.includes("whatsapp"),
        telegram: editing.channels.includes("telegram"),
      });
      const c = editing.condition as Record<string, unknown>;
      if (editing.type === "cost_anthropic") setCostThreshold(Number(c.threshold_brl ?? 50));
      if (editing.type === "daemon_down") {
        setDaemon(String(c.daemon ?? DAEMON_OPTIONS[0]));
        setDaemonMin(Number(c.threshold_min ?? 5));
      }
      if (editing.type === "tool_errors") {
        setSkill(String(c.skill ?? SKILL_OPTIONS[0]));
        setTool(String(c.tool ?? ""));
        setErrCount(Number(c.threshold_count ?? 3));
        setErrWindow(Number(c.window_min ?? 5));
      }
      if (editing.type === "latency_high") {
        setSkill(String(c.skill ?? SKILL_OPTIONS[0]));
        setLatMs(Number(c.threshold_ms ?? 2000));
        setLatWindow(Number(c.window_min ?? 5));
      }
    } else {
      setName("");
      setType("cost_anthropic");
      setCooldown(30);
      setActive(true);
      setChannels({ panel: true, whatsapp: false, telegram: false });
      setCostThreshold(50);
      setTool("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const buildCondition = (): Record<string, unknown> | null => {
    switch (type) {
      case "cost_anthropic":
        if (costThreshold <= 0) return null;
        return { threshold_brl: costThreshold };
      case "daemon_down":
        if (!daemon || daemonMin < 1) return null;
        return { daemon, threshold_min: daemonMin };
      case "tool_errors":
        if (!skill || !tool || errCount < 1 || errWindow < 1) return null;
        return { skill, tool: tool.trim(), threshold_count: errCount, window_min: errWindow };
      case "latency_high":
        if (!skill || latMs < 1 || latWindow < 1) return null;
        return { skill, threshold_ms: latMs, window_min: latWindow };
    }
  };

  const onSave = async () => {
    if (!name.trim()) {
      toast.error("Nome obrigatório");
      return;
    }
    const condition = buildCondition();
    if (!condition) {
      toast.error("Preencha as condições");
      return;
    }
    const channelList = (Object.keys(channels) as Channel[]).filter((c) => channels[c]);
    if (channelList.length === 0) {
      toast.error("Selecione ao menos 1 canal");
      return;
    }
    setSaving(true);
    try {
      await authedFetch("alerts-save", {
        method: "POST",
        body: JSON.stringify({
          id: editing?.id,
          name: name.trim(),
          type,
          condition,
          channels: channelList,
          cooldown_min: cooldown,
          active,
        }),
      });
      toast.success(editing ? "Alerta atualizado" : "Alerta criado");
      onSaved();
    } catch (e) {
      toast.error("Falha ao salvar", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar alerta" : "Novo alerta"}</DialogTitle>
          <DialogDescription>Lívia avisa pelos canais escolhidos quando a condição bater.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Ex: Custo Anthropic alto" />
          </div>

          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as AlertType)} disabled={!!editing}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cost_anthropic">{TYPE_LABEL.cost_anthropic}</SelectItem>
                <SelectItem value="daemon_down">{TYPE_LABEL.daemon_down}</SelectItem>
                <SelectItem value="tool_errors">{TYPE_LABEL.tool_errors}</SelectItem>
                <SelectItem value="latency_high">{TYPE_LABEL.latency_high}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "cost_anthropic" && (
            <div className="space-y-2">
              <Label>Limite mensal (R$)</Label>
              <Input type="number" min={1} value={costThreshold} onChange={(e) => setCostThreshold(Number(e.target.value))} />
            </div>
          )}

          {type === "daemon_down" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Daemon</Label>
                <Select value={daemon} onValueChange={setDaemon}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DAEMON_OPTIONS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sem heartbeat por (min)</Label>
                <Input type="number" min={1} value={daemonMin} onChange={(e) => setDaemonMin(Number(e.target.value))} />
              </div>
            </div>
          )}

          {type === "tool_errors" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Skill</Label>
                <Select value={skill} onValueChange={setSkill}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SKILL_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tool</Label>
                <Input value={tool} onChange={(e) => setTool(e.target.value)} placeholder="ex: deals_list" />
              </div>
              <div className="space-y-2">
                <Label>Falhas</Label>
                <Input type="number" min={1} value={errCount} onChange={(e) => setErrCount(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Janela (min)</Label>
                <Input type="number" min={1} value={errWindow} onChange={(e) => setErrWindow(Number(e.target.value))} />
              </div>
            </div>
          )}

          {type === "latency_high" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Skill</Label>
                <Select value={skill} onValueChange={setSkill}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SKILL_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>p95 acima de (ms)</Label>
                <Input type="number" min={1} value={latMs} onChange={(e) => setLatMs(Number(e.target.value))} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Janela (min)</Label>
                <Input type="number" min={1} value={latWindow} onChange={(e) => setLatWindow(Number(e.target.value))} />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Canais</Label>
            <div className="flex flex-wrap gap-3">
              {(["panel", "whatsapp", "telegram"] as Channel[]).map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={channels[c]} onCheckedChange={(v) => setChannels((s) => ({ ...s, [c]: !!v }))} />
                  <span className="capitalize">{c}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Cooldown (min)</Label>
              <Input type="number" min={1} max={1440} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch checked={active} onCheckedChange={setActive} />
                <span className="text-sm text-muted-foreground">{active ? "Ativo" : "Pausado"}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
