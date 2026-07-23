import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Eye, EyeOff, Copy, Loader2, RefreshCw, MessageCircle, Smartphone, CheckCircle2, QrCode,
} from "lucide-react";
import { toast } from "sonner";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings_/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Agente CFO" }] }),
  component: WhatsAppPage,
});

type EvolutionConfig = {
  id: string;
  base_url: string;
  active: boolean;
  webhook_secret: string | null;
  last_test_status: string | null;
  last_test_at: string | null;
};

type WhatsAppInstance = {
  id: string;
  instance_name: string;
  display_name: string | null;
  phone_number: string | null;
  status: string;
  receives_marcos_chat: boolean;
  last_seen: string | null;
};

const INSTANCE_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function StatusPill({ status }: { status: string }) {
  if (status === "open") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Conectado
      </Badge>
    );
  }
  if (status === "waiting_scan" || status === "connecting") {
    return <Badge variant="outline">Aguardando leitura</Badge>;
  }
  return <Badge variant="secondary">Desconectado</Badge>;
}

function toQrSrc(qr: string | null): string | null {
  if (!qr) return null;
  if (qr.startsWith("data:")) return qr;
  return `data:image/png;base64,${qr}`;
}

function WhatsAppPage() {
  // Evolution config
  const [cfg, setCfg] = useState<EvolutionConfig | null>(null);
  const [cfgLoading, setCfgLoading] = useState(true);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [active, setActive] = useState(true);
  const [savingCfg, setSavingCfg] = useState(false);

  // Instâncias
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [instLoading, setInstLoading] = useState(true);

  // Conectar
  const [pairName, setPairName] = useState("cfo-whatsapp");
  const [pairing, setPairing] = useState(false);
  const [activeQr, setActiveQr] = useState<string | null>(null);
  const [activeInstance, setActiveInstance] = useState<string | null>(null);
  const [connState, setConnState] = useState<string>("idle"); // idle|waiting_scan|open|close
  const pollRef = useRef<number | null>(null);

  async function loadCfg() {
    setCfgLoading(true);
    const { data } = await supabase
      .from("evolution_config")
      .select("id, base_url, active, webhook_secret, last_test_status, last_test_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      setCfg(data as EvolutionConfig);
      setBaseUrl(data.base_url ?? "");
      setActive(!!data.active);
    }
    setCfgLoading(false);
  }

  async function loadInstances() {
    setInstLoading(true);
    const { data } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, display_name, phone_number, status, receives_marcos_chat, last_seen")
      .order("created_at", { ascending: false });
    setInstances((data as WhatsAppInstance[]) ?? []);
    setInstLoading(false);
  }

  useEffect(() => { loadCfg(); loadInstances(); }, []);

  // Polling de status
  useEffect(() => {
    if (!activeInstance || connState === "open") {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const tick = async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) return;
        const { data, error } = await supabase.functions.invoke("evolution-instance-status", {
          body: { instance_name: activeInstance },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (error) return;
        const state = (data as { state?: string })?.state ?? "close";
        setConnState(state);
        if (state === "open") {
          toast.success("WhatsApp conectado ✅");
          loadInstances();
        }
      } catch { /* ignore */ }
    };
    tick();
    pollRef.current = window.setInterval(tick, 4000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [activeInstance, connState]);

  async function saveCfg() {
    if (!baseUrl.trim()) { toast.error("base_url obrigatória"); return; }
    setSavingCfg(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sem sessão ativa");
      const body: Record<string, unknown> = { base_url: baseUrl.trim(), active };
      if (apiKey.trim()) body.api_key = apiKey.trim();
      const { error } = await supabase.functions.invoke("evolution-config-save", {
        body, headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      toast.success("Configuração salva");
      setApiKey("");
      await loadCfg();
    } catch (err) {
      toast.error(`Falha: ${String((err as Error).message ?? err)}`);
    } finally {
      setSavingCfg(false);
    }
  }

  function copyText(s: string) {
    navigator.clipboard.writeText(s).then(
      () => toast.success("Copiado"),
      () => toast.error("Falha ao copiar"),
    );
  }

  async function toggleReceives(inst: WhatsAppInstance, value: boolean) {
    const { error } = await supabase
      .from("whatsapp_instances")
      .update({ receives_marcos_chat: value })
      .eq("id", inst.id);
    if (error) { toast.error(error.message); return; }
    setInstances((prev) => prev.map((i) => i.id === inst.id ? { ...i, receives_marcos_chat: value } : i));
  }

  async function connectInstance() {
    const name = pairName.trim();
    if (!INSTANCE_RE.test(name)) {
      toast.error("Nome inválido (a-z, 0-9, _ ou -, até 64 chars)");
      return;
    }
    setPairing(true);
    setActiveQr(null);
    setConnState("waiting_scan");
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Sem sessão ativa");
      const { data, error } = await supabase.functions.invoke("evolution-instance-pair", {
        body: { instance_name: name },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;
      const qr = (data as { qr_base64?: string })?.qr_base64 ?? null;
      setActiveQr(qr);
      setActiveInstance(name);
      if (!qr) toast.message("Instância criada", { description: "QR não retornado — tente Gerar novo QR." });
      else toast.success("QR gerado — escaneie no WhatsApp");
      loadInstances();
    } catch (err) {
      toast.error(`Falha: ${String((err as Error).message ?? err)}`);
      setConnState("idle");
    } finally {
      setPairing(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <MessageCircle className="h-6 w-6" /> WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground">
          Conecte sua Evolution API e pareie números — Marcos atende pelo WhatsApp.
        </p>
      </div>

      {/* Config Evolution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evolution API (global)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {cfgLoading ? <Skeleton className="h-32 w-full" /> : (
            <>
              <div className="grid gap-2">
                <Label>Evolution API URL</Label>
                <Input
                  placeholder="https://evolution.seudominio.com"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>API Key</Label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    placeholder={cfg ? "•••••••• (mantém atual se vazio)" : "API key da Evolution"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={active} onCheckedChange={setActive} />
                <Label>Ativa</Label>
              </div>
              <Button onClick={saveCfg} disabled={savingCfg}>
                {savingCfg && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar
              </Button>

              {cfg?.webhook_secret && (
                <div className="border rounded p-3 space-y-1 bg-muted/30">
                  <div className="text-xs font-semibold">Webhook (configurado automaticamente)</div>
                  <div className="flex gap-1 items-center">
                    <Input readOnly value={cfg.webhook_secret} className="text-xs font-mono" />
                    <Button size="icon" variant="outline" onClick={() => copyText(cfg.webhook_secret!)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A plataforma configura o webhook na Evolution ao gerar o QR.
                  </p>
                </div>
              )}

              {cfg?.last_test_at && (
                <div className="text-xs text-muted-foreground">
                  Último teste: <span className="font-medium">{cfg.last_test_status ?? "—"}</span>
                  {" "}— {formatRelative(cfg.last_test_at)}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Conectar / QR */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <QrCode className="h-4 w-4" /> Conectar WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-2">
              <Label>Nome da instância</Label>
              <Input
                placeholder="cfo-whatsapp"
                value={pairName}
                onChange={(e) => setPairName(e.target.value)}
                disabled={pairing || connState === "waiting_scan"}
              />
            </div>
            <Button onClick={connectInstance} disabled={pairing || !pairName.trim() || !cfg}>
              {pairing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {activeQr && connState !== "open" ? "Gerar novo QR" : "Conectar / Gerar QR"}
            </Button>
          </div>

          {!cfg && (
            <p className="text-xs text-muted-foreground">
              Configure a Evolution API acima antes de conectar.
            </p>
          )}

          {connState === "open" && activeInstance && (
            <div className="flex flex-col items-center gap-2 border rounded p-6 bg-emerald-500/5">
              <CheckCircle2 className="h-12 w-12 text-emerald-600" />
              <div className="font-medium text-emerald-700 dark:text-emerald-400">
                WhatsApp conectado ✅
              </div>
              <div className="text-xs text-muted-foreground">Marcos já atende em <code>{activeInstance}</code></div>
            </div>
          )}

          {activeQr && connState !== "open" && (
            <div className="flex flex-col items-center gap-3 border rounded p-4">
              <img
                src={toQrSrc(activeQr)!}
                alt="QR code WhatsApp"
                className="h-64 w-64 object-contain border rounded bg-white"
              />
              <p className="text-xs text-muted-foreground text-center">
                Abra <b>WhatsApp → Aparelhos conectados → Conectar aparelho</b> e escaneie o QR.
              </p>
              <p className="text-[11px] text-muted-foreground">
                Aguardando leitura… {connState === "close" && "(QR pode ter expirado — gere um novo)"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lista de instâncias */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="h-4 w-4" /> Números pareados
          </CardTitle>
          <Button size="sm" variant="outline" onClick={loadInstances}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {instLoading ? <Skeleton className="h-24 w-full" /> : instances.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma instância pareada ainda.</div>
          ) : (
            <div className="space-y-2">
              {instances.map((inst) => (
                <div key={inst.id} className="flex items-center justify-between gap-3 border rounded p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{inst.display_name || inst.instance_name}</span>
                      <StatusPill status={inst.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {inst.phone_number ?? "sem número"} · {inst.instance_name}
                      {inst.last_seen && ` · visto ${formatRelative(inst.last_seen)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Marcos chat</Label>
                    <Switch
                      checked={inst.receives_marcos_chat}
                      onCheckedChange={(v) => toggleReceives(inst, v)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
