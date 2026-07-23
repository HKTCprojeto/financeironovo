import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, Terminal, Server, HelpCircle, ChevronRight, Cpu } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações — Agente CFO" }] }),
  component: SettingsPage,
});

type InstanceRow = {
  id: string;
  hostname: string | null;
  openclaw_version: string | null;
  agente_cfo_version: string | null;
  ingress_url: string | null;
  last_heartbeat: string | null;
  status: string | null;
};

type UserInfo = {
  email: string;
  last_sign_in_at: string | null;
};

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-muted text-muted-foreground rounded px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
      {children}
    </pre>
  );
}

function SettingsPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [instance, setInstance] = useState<InstanceRow | null>(null);
  const [instanceLoading, setInstanceLoading] = useState(true);
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [lastChatAt, setLastChatAt] = useState<string | null>(null);
  const [openingOC, setOpeningOC] = useState(false);

  const openOpenClaw = async () => {
    setOpeningOC(true);
    try {
      const { data, error } = await supabase.functions.invoke("openclaw-dashboard-url");
      if (error) throw error;
      if (data?.url) window.open(data.url, "_blank");
      else toast.error("URL do OpenClaw indisponível");
    } catch (err) {
      toast.error(`Falha ao abrir OpenClaw: ${String((err as Error).message ?? err)}`);
    } finally {
      setOpeningOC(false);
    }
  };


  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUser({
          email: data.user.email ?? "",
          last_sign_in_at: data.user.last_sign_in_at ?? null,
        });
      }

      const { data: instances } = await supabase
        .from("instances")
        .select("id, hostname, openclaw_version, agente_cfo_version, ingress_url, last_heartbeat, status")
        .limit(1)
        .maybeSingle();

      setInstance(instances ?? null);
      setInstanceLoading(false);

      const { data: lastMsg } = await supabase
        .from("chat_messages")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLastChatAt(lastMsg?.created_at ?? null);
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/login" });
  };

  const runDoctor = async () => {
    if (!instance) return;
    setDoctorLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sem sessão ativa");

      const { data: fnData, error: fnError } = await supabase.functions.invoke("push-command", {
        body: {
          instance_id: instance.id,
          command: "Execute: bash $SKILL_PATH/scripts/doctor.sh",
        },
        headers: { Authorization: `Bearer ${token}` },
      });

      if (fnError) throw fnError;
      toast.success("Doctor iniciado na VPS. Acompanhe em Eventos.");
      console.log("push-command response:", fnData);
    } catch (err) {
      toast.error(`Falha ao rodar doctor: ${String(err)}`);
    } finally {
      setDoctorLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Painel single-tenant do Agente CFO. Configurações vivem na VPS — use os comandos abaixo.
        </p>
      </div>

      {/* Sessão */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sessão atual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-1">
            <div className="text-xs text-muted-foreground">Usuário logado</div>
            <div className="font-medium">{user?.email || "—"}</div>
          </div>
          <div className="grid gap-1">
            <div className="text-xs text-muted-foreground">Último acesso</div>
            <div className="text-sm">
              {user?.last_sign_in_at ? formatRelative(user.last_sign_in_at) : "—"}
            </div>
          </div>
          <div className="grid gap-1">
            <div className="text-xs text-muted-foreground">Chat web</div>
            <div className="text-sm">
              {lastChatAt
                ? `Ativo — última mensagem ${formatRelative(lastChatAt)}`
                : "Sem mensagens ainda"}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </CardContent>
      </Card>

      {/* Instância */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="h-4 w-4" />
            VPS / Instância
          </CardTitle>
          {instance && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                instance.status === "online"
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {instance.status ?? "desconhecido"}
            </span>
          )}
        </CardHeader>
        <CardContent>
          {instanceLoading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : !instance ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Nenhuma VPS conectada ainda. Rode o comando abaixo na sua VPS pra começar:
              </p>
              <CodeBlock>{`bash <(curl -fsSL https://raw.githubusercontent.com/MindOpsTeam/agente-cfo/main/install/setup.sh)`}</CodeBlock>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Hostname</div>
                  <div className="text-sm font-medium truncate">{instance.hostname ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Ingress URL</div>
                  <div className="text-sm font-medium truncate">{instance.ingress_url ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">OpenClaw</div>
                  <div className="text-sm font-medium">{instance.openclaw_version ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Agente CFO</div>
                  <div className="text-sm font-medium">{instance.agente_cfo_version ?? "—"}</div>
                </div>
                <div className="sm:col-span-2">
                  <div className="text-xs text-muted-foreground">Último heartbeat</div>
                  <div className="text-sm">
                    {instance.last_heartbeat ? formatRelative(instance.last_heartbeat) : "—"}
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={runDoctor}
                disabled={doctorLoading}
              >
                <Terminal className="h-4 w-4 mr-2" />
                {doctorLoading ? "Aguardando VPS..." : "Rodar Doctor na VPS"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>



      {/* Sistema (avançado) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Cpu className="h-4 w-4" />
            Sistema (avançado)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            Reinicie daemons, instale plugins, veja logs e status — tudo sem SSH.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/sistema">
              Abrir painel administrativo
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Configuração avançada
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Budget LLM, chaves de integrações e demais parâmetros vivem no OpenClaw da sua VPS.
            Abra o painel administrativo abaixo — sem SSH.
          </p>
          <Button variant="outline" size="sm" onClick={openOpenClaw} disabled={openingOC}>
            {openingOC
              ? <span className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
              : <HelpCircle className="h-4 w-4 mr-2" />}
            Abrir OpenClaw (configuração avançada)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
