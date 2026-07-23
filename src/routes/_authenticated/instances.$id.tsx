import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { InstanceStatusBadge, SeverityBadge, WhatsAppStatusBadge } from "@/lib/status";
import { formatCurrencyBRL, formatDateTime, formatRelative } from "@/lib/format";
import { PageSkeleton, EmptyState } from "@/components/states";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/instances/$id")({
  head: () => ({ meta: [{ title: "Instância — Agente CFO" }] }),
  component: InstanceDetail,
});

type Instance = {
  id: string;
  hostname: string | null;
  status: string;
  last_heartbeat: string | null;
  agente_cfo_version: string | null;
  ingress_url: string | null;
};

const PRESET_COMMANDS: Record<string, string> = {
  doctor: "Execute: openclaw doctor",
  rewa: "Execute: openclaw plugins run agente-cfo whatsapp:repair",
  update: "Execute: openclaw plugins update agente-cfo",
};

function InstanceDetail() {
  const { id } = Route.useParams();
  const [inst, setInst] = useState<Instance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("instances")
        .select("id, hostname, status, last_heartbeat, agente_cfo_version, ingress_url")
        .eq("id", id)
        .maybeSingle();
      setInst((data as Instance | null) ?? null);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <PageSkeleton rows={6} />;
  if (!inst) return <EmptyState title="Instância não encontrada." />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate">{inst.hostname ?? "—"}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            <InstanceStatusBadge status={inst.status} />
            <span>· último heartbeat {formatRelative(inst.last_heartbeat)}</span>
          </div>
        </div>
        <PushCommandDialog instance={inst} />
      </div>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Eventos</TabsTrigger>
          <TabsTrigger value="llm">Custo LLM</TabsTrigger>
          <TabsTrigger value="omie">Erros Omie</TabsTrigger>
          <TabsTrigger value="wa">WhatsApp</TabsTrigger>
        </TabsList>
        <TabsContent value="events" className="mt-4"><EventsTab instanceId={id} /></TabsContent>
        <TabsContent value="llm" className="mt-4"><LlmTab instanceId={id} /></TabsContent>
        <TabsContent value="omie" className="mt-4"><OmieTab instanceId={id} /></TabsContent>
        <TabsContent value="wa" className="mt-4"><WaTab instanceId={id} /></TabsContent>
      </Tabs>
    </div>
  );
}

function EventsTab({ instanceId }: { instanceId: string }) {
  const [rows, setRows] = useState<Array<{ id: number; type: string; severity: string; created_at: string; payload: unknown }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from("events").select("id, type, severity, created_at, payload")
      .eq("instance_id", instanceId).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [instanceId]);
  if (loading) return <PageSkeleton />;
  if (rows.length === 0) return <EmptyState title="Nenhum evento." />;
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Quando</TableHead><TableHead>Tipo</TableHead><TableHead>Severidade</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-muted-foreground whitespace-nowrap">{formatRelative(r.created_at)}</TableCell>
              <TableCell className="font-medium">{r.type}</TableCell>
              <TableCell><SeverityBadge severity={r.severity} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function LlmTab({ instanceId }: { instanceId: string }) {
  const [rows, setRows] = useState<Array<{ id: number; session_id: string; model: string; input_tokens: number; output_tokens: number; cost_brl: number; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from("llm_usage").select("id, session_id, model, input_tokens, output_tokens, cost_brl, created_at")
      .eq("instance_id", instanceId).order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [instanceId]);

  const chartData = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const day = new Date(r.created_at).toISOString().slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + Number(r.cost_brl ?? 0));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, cost]) => ({ day, cost }));
  }, [rows]);

  if (loading) return <PageSkeleton />;
  if (rows.length === 0) return <EmptyState title="Sem uso de LLM nesta instância." />;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Custo por dia</CardTitle></CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatCurrencyBRL(v)} />
                <RTooltip formatter={(v: number) => formatCurrencyBRL(v)} />
                <Bar dataKey="cost" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
      <Card><CardContent className="p-0">
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
                <TableCell className="text-right tabular-nums">{formatCurrencyBRL(r.cost_brl)}</TableCell>
                <TableCell className="text-muted-foreground">{formatRelative(r.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

function OmieTab({ instanceId }: { instanceId: string }) {
  const [rows, setRows] = useState<Array<{ id: number; command: string | null; http_status: number | null; message: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from("omie_errors").select("id, command, http_status, message, created_at")
      .eq("instance_id", instanceId).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [instanceId]);
  if (loading) return <PageSkeleton />;
  if (rows.length === 0) return <EmptyState title="Nenhum erro Omie." />;
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Quando</TableHead><TableHead>Comando</TableHead>
          <TableHead>HTTP</TableHead><TableHead>Mensagem</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="text-muted-foreground whitespace-nowrap">{formatRelative(r.created_at)}</TableCell>
              <TableCell className="font-mono text-xs">{r.command ?? "—"}</TableCell>
              <TableCell className="tabular-nums">{r.http_status ?? "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.message ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}

function WaTab({ instanceId }: { instanceId: string }) {
  const [rows, setRows] = useState<Array<{ id: number; status: string; jid: string | null; last_check: string | null; created_at: string }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from("whatsapp_status").select("id, status, jid, last_check, created_at")
      .eq("instance_id", instanceId).order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [instanceId]);
  if (loading) return <PageSkeleton />;
  if (rows.length === 0) return <EmptyState title="Sem histórico de WhatsApp." />;
  return (
    <Card><CardContent className="p-4 space-y-3">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 border-b last:border-0 pb-3 last:pb-0">
          <WhatsAppStatusBadge status={r.status} />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{r.jid ?? "—"}</div>
            <div className="text-xs text-muted-foreground">Verificado {formatRelative(r.last_check)}</div>
          </div>
          <div className="text-xs text-muted-foreground whitespace-nowrap">{formatRelative(r.created_at)}</div>
        </div>
      ))}
    </CardContent></Card>
  );
}

function PushCommandDialog({ instance }: { instance: Instance }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState("");
  const [command, setCommand] = useState("");
  const [sending, setSending] = useState(false);

  const onSelectPreset = (v: string) => {
    setPreset(v);
    setCommand(PRESET_COMMANDS[v] ?? "");
  };

  const send = async () => {
    if (!command.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("push-command", {
        body: { instance_id: instance.id, command },
      });
      if (error) throw error;
      toast.success("Comando enviado", {
        description: typeof data === "object" && data ? "Resposta recebida da instância." : undefined,
      });
      setOpen(false);
      setCommand("");
      setPreset("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao enviar comando";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Send className="h-4 w-4 mr-2" />Push Command</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Enviar comando</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Comando pré-definido</Label>
            <Select value={preset} onValueChange={onSelectPreset}>
              <SelectTrigger><SelectValue placeholder="Selecione um modelo (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="doctor">Doctor</SelectItem>
                <SelectItem value="rewa">Re-pareamento WhatsApp</SelectItem>
                <SelectItem value="update">Atualizar skill</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cmd">Comando</Label>
            <Textarea id="cmd" rows={5} value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Execute: ..." />
          </div>
          <p className="text-xs text-muted-foreground">Última atividade: {formatDateTime(instance.last_heartbeat)}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>Cancelar</Button>
          <Button onClick={send} disabled={sending || !command.trim()}>
            {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
