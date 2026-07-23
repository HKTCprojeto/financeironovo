import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  RotateCw, Activity, Package, FileText, Loader2, Terminal, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings_/sistema")({
  head: () => ({ meta: [{ title: "Sistema (avançado) — Agente CFO" }] }),
  component: SistemaPage,
});

const SERVICES = [
  "openclaw-gateway",
  "cloudflared-cfo",
  "cfo-credentials-sync",
  "cfo-channels-sync",
];

type ChatMsg = {
  id: number;
  content: string;
  status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-muted text-foreground rounded px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-96">
      {children || "—"}
    </pre>
  );
}

function SistemaPage() {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pluginName, setPluginName] = useState("");
  const [logService, setLogService] = useState(SERVICES[0]);
  const [logLines, setLogLines] = useState("50");
  const [logOutput, setLogOutput] = useState<string>("");
  const [statusOutput, setStatusOutput] = useState<string>("");
  const [pluginsOutput, setPluginsOutput] = useState<string>("");
  const [actionOutput, setActionOutput] = useState<string>("");
  const pendingRunIds = useRef<Map<string, "logs" | "status" | "plugins" | "action">>(new Map());

  // Realtime: escuta admin thread do user
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const threadId = `admin:${data.user.id}`;

      const channel = supabase
        .channel(`admin:${data.user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` },
          (payload) => handleMessage(payload.new as ChatMsg),
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${threadId}` },
          (payload) => handleMessage(payload.new as ChatMsg),
        )
        .subscribe();

      unsub = () => { supabase.removeChannel(channel); };
    })();
    return () => { unsub?.(); };
  }, []);

  function handleMessage(msg: ChatMsg) {
    if (msg.status !== "sent" || !msg.content) return;
    const meta = msg.metadata ?? {};
    const runId = String((meta as Record<string, unknown>).runId ?? "");
    const target = pendingRunIds.current.get(runId);
    if (!target) return;

    pendingRunIds.current.delete(runId);
    if (target === "logs") setLogOutput(msg.content);
    else if (target === "status") setStatusOutput(msg.content);
    else if (target === "plugins") setPluginsOutput(msg.content);
    else if (target === "action") setActionOutput(msg.content);

    setPendingAction(null);
    toast.success("Resposta recebida do agente");
  }

  async function runAction(
    actionKey: string,
    action: string,
    params: Record<string, unknown>,
    target: "logs" | "status" | "plugins" | "action",
  ) {
    setPendingAction(actionKey);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sem sessão ativa");

      const { data, error } = await supabase.functions.invoke("vps-admin-action", {
        body: { action, params },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      const runId = (data as { run_id?: string })?.run_id;
      if (!runId) throw new Error("Sem run_id na resposta");
      pendingRunIds.current.set(runId, target);
      toast.message("Ação enviada — aguardando agente...", { description: action });

      // Timeout fallback (90s)
      setTimeout(() => {
        if (pendingRunIds.current.has(runId)) {
          pendingRunIds.current.delete(runId);
          if (pendingAction === actionKey) setPendingAction(null);
          toast.error("Timeout — agente não respondeu em 90s");
        }
      }, 90_000);
    } catch (err) {
      setPendingAction(null);
      toast.error(`Falha: ${String((err as Error).message ?? err)}`);
    }
  }

  const isLoading = (key: string) => pendingAction === key;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Terminal className="h-6 w-6" />
          Sistema (avançado)
        </h1>
        <p className="text-sm text-muted-foreground">
          Ações administrativas da sua VPS — sem precisar de SSH.
        </p>
      </div>

      <Card className="border-yellow-500/40 bg-yellow-500/5">
        <CardContent className="flex gap-3 pt-6">
          <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            Estas ações executam comandos privilegiados na sua VPS através do agente Lívia.
            Use com cuidado — reiniciar daemons em produção pode interromper conversas em curso.
          </div>
        </CardContent>
      </Card>

      {/* Daemons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <RotateCw className="h-4 w-4" /> Daemons
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { key: "restart-gateway", label: "Reiniciar gateway OpenClaw", svc: "openclaw-gateway" },
            { key: "restart-channels-wa", label: "Reiniciar canais WhatsApp", svc: "cfo-channels-sync" },
            { key: "restart-channels-tg", label: "Reiniciar canais Telegram", svc: "cfo-channels-sync" },
            { key: "restart-creds", label: "Reiniciar sync credenciais", svc: "cfo-credentials-sync" },
          ].map((b) => (
            <Button
              key={b.key}
              variant="outline"
              disabled={!!pendingAction}
              onClick={() => runAction(b.key, "systemctl_restart", { service: b.svc }, "action")}
            >
              {isLoading(b.key) ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
              {b.label}
            </Button>
          ))}
          <Button
            variant="outline"
            disabled={!!pendingAction}
            onClick={() => runAction("mcp-sync", "mcp_sync_now", {}, "action")}
            className="sm:col-span-2"
          >
            {isLoading("mcp-sync") ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
            Forçar sync MCP agora
          </Button>
          {actionOutput && (
            <div className="sm:col-span-2 mt-2">
              <div className="text-xs text-muted-foreground mb-1">Output da última ação</div>
              <CodeBlock>{actionOutput}</CodeBlock>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plugins */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" /> Plugins OpenClaw
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!!pendingAction}
            onClick={() => runAction("plugins-list", "openclaw_plugins_list", {}, "plugins")}
          >
            {isLoading("plugins-list") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            Listar plugins instalados
          </Button>

          <div className="flex gap-2">
            <Input
              placeholder="nome-do-plugin (ex: evolution-api)"
              value={pluginName}
              onChange={(e) => setPluginName(e.target.value)}
              disabled={!!pendingAction}
            />
            <Button
              disabled={!!pendingAction || !pluginName.trim()}
              onClick={() =>
                runAction(
                  "plugins-install",
                  "openclaw_plugins_install",
                  { name: pluginName.trim() },
                  "plugins",
                )
              }
            >
              {isLoading("plugins-install") ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Instalar
            </Button>
          </div>

          {pluginsOutput && <CodeBlock>{pluginsOutput}</CodeBlock>}
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" /> Logs recentes
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-40">
              <label className="text-xs text-muted-foreground">Service</label>
              <Select value={logService} onValueChange={setLogService} disabled={!!pendingAction}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <label className="text-xs text-muted-foreground">Linhas</label>
              <Input
                type="number"
                value={logLines}
                onChange={(e) => setLogLines(e.target.value)}
                disabled={!!pendingAction}
              />
            </div>
            <Button
              disabled={!!pendingAction}
              onClick={() =>
                runAction(
                  "logs-fetch",
                  "service_logs",
                  { service: logService, lines: Number(logLines) || 50 },
                  "logs",
                )
              }
            >
              {isLoading("logs-fetch") ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Ver logs
            </Button>
          </div>
          {logOutput && <CodeBlock>{logOutput}</CodeBlock>}
        </CardContent>
      </Card>

      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Status do sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!!pendingAction}
            onClick={() =>
              runAction(
                "status-all",
                "systemctl_status",
                { services: SERVICES },
                "status",
              )
            }
          >
            {isLoading("status-all") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            Atualizar status
          </Button>
          {statusOutput && <CodeBlock>{statusOutput}</CodeBlock>}
        </CardContent>
      </Card>

      {/* OpenClaw */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> OpenClaw / VPS
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Button
            variant="outline"
            disabled={!!pendingAction}
            onClick={() => runAction("oc-status", "openclaw_status", {}, "action")}
          >
            {isLoading("oc-status") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            Status OpenClaw
          </Button>
          <Button
            variant="outline"
            disabled={!!pendingAction}
            onClick={() => runAction("oc-health", "openclaw_health", {}, "action")}
          >
            {isLoading("oc-health") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
            Health
          </Button>
          <Button
            variant="outline"
            disabled={!!pendingAction}
            onClick={() => runAction("oc-doctor", "openclaw_doctor", {}, "action")}
          >
            {isLoading("oc-doctor") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Terminal className="h-4 w-4" />}
            Doctor
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
