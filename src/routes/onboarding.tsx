// rebuild marker v3: onboarding Etapa 2 com fetch direto + refreshSession (commit 16b6328)
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOnboardingState, type ErpName, type CrmName, type BillingName, type EcommerceName } from "@/hooks/use-onboarding";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Briefcase, CheckCircle2, Copy, ExternalLink,
  Loader2, MessageSquare, Phone, Sparkles, KeyRound, Plug, Server,
  PartyPopper, BarChart3, Settings as SettingsIcon, ChevronRight,
  CreditCard, ShoppingCart,
} from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Configuração inicial — Agente CFO" }] }),
  component: OnboardingPage,
});

const TOTAL_STEPS = 10;

function OnboardingPage() {
  const { state, loaded, updateData, goTo, complete } = useOnboardingState();
  const navigate = useNavigate();
  const step = Math.min(Math.max(state.current_step, 1), TOTAL_STEPS);

  useEffect(() => {
    if (loaded && state.completed_at && step !== TOTAL_STEPS) {
      navigate({ to: "/" });
    }
  }, [loaded, state.completed_at, step, navigate]);

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const next = () => goTo(Math.min(step + 1, TOTAL_STEPS));
  const back = () => goTo(Math.max(step - 1, 1));

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      <Toaster />
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2 font-semibold">
            <Briefcase className="h-5 w-5 text-primary" />
            Agente CFO
          </div>
          <div className="flex-1">
            <Progress value={(step / TOTAL_STEPS) * 100} />
          </div>
          <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            Etapa {step} de {TOTAL_STEPS}
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-8 sm:py-12">
        <div key={step} className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          {step === 1 && <Step1Welcome onNext={next} />}
          {step === 2 && <Step2Anthropic data={state.data} updateData={updateData} onNext={next} onBack={back} />}
          {step === 3 && <Step3WhatsApp data={state.data} updateData={updateData} onNext={next} onBack={back} />}
          {step === 4 && <Step4Erp data={state.data} updateData={updateData} onNext={next} onBack={back} />}
          {step === 5 && <Step5Billing data={state.data} updateData={updateData} onNext={next} onBack={back} />}
          {step === 6 && <Step5Crm data={state.data} updateData={updateData} onNext={next} onBack={back} />}
          {step === 7 && <Step7Ecommerce data={state.data} updateData={updateData} onNext={next} onBack={back} />}
          {step === 8 && <Step6Vps data={state.data} updateData={updateData} onNext={next} onBack={back} />}
          {step === 9 && <Step7WhatsAppPair data={state.data} updateData={updateData} onNext={next} onBack={back} />}
          {step === 10 && <Step8Done onComplete={complete} />}
        </div>
      </main>

      <footer className="py-4 text-center">
        <Link to="/settings" className="text-xs text-muted-foreground hover:text-foreground underline">
          Pular onboarding
        </Link>
      </footer>
    </div>
  );
}

// ---------------- Step 1: Bem-vindo ----------------
function Step1Welcome({ onNext }: { onNext: () => void }) {
  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <Briefcase className="h-10 w-10 text-primary" />
        </div>
        <CardTitle className="text-2xl">Olá! Vou te apresentar o Marcos.</CardTitle>
        <CardDescription>Seu CFO virtual. Vamos configurar tudo em ~5 minutos.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {[
            { icon: BarChart3, text: "Lê seu ERP e organiza receita, despesas e fluxo de caixa." },
            { icon: MessageSquare, text: "Manda alertas no seu WhatsApp quando algo importante acontece." },
            { icon: Sparkles, text: "Conversa com você. Pergunte saldo, contas a pagar, pipeline." },
          ].map((b, i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2">
                <b.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="text-sm pt-1.5">{b.text}</div>
            </li>
          ))}
        </ul>
        <Button onClick={onNext} className="w-full" size="lg">
          Vamos começar <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------- Step 2: Anthropic ----------------
function Step2Anthropic({ data, updateData, onNext, onBack }: any) {
  const [key, setKey] = useState<string>(data.anthropic_key ?? "");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = async () => {
    setError(null);
    if (!key.startsWith("sk-ant-")) { setError("Chave deve começar com sk-ant-"); return; }
    setValidating(true);
    try {
      // Refresca a session antes de chamar (cobre JWT vencido após espera no wizard)
      const { data: sessData } = await supabase.auth.getSession();
      let token = sessData.session?.access_token;
      if (!token) {
        const refreshed = await supabase.auth.refreshSession();
        token = refreshed.data.session?.access_token;
      }
      if (!token) {
        setError("Sessão expirou — faça login novamente");
        return;
      }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/onboarding-validate-anthropic-key`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "apikey": SUPABASE_ANON,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key }),
      });

      const r = await res.json().catch(() => ({}));
      if (!res.ok && !r?.valid) {
        setError(r?.error ?? r?.message ?? `Erro HTTP ${res.status}`);
        return;
      }
      if (!r?.valid) {
        setError(r?.error ?? "Chave inválida");
        return;
      }
      updateData({ anthropic_key: key, anthropic_validated: true });
      toast.success("Chave validada com sucesso");
      onNext();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setValidating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="h-5 w-5 text-primary" />
          <CardTitle>Chave da Anthropic</CardTitle>
        </div>
        <CardDescription>
          Marcos usa o cérebro do Claude. Você precisa de uma API key da Anthropic.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          Como obter sua key <ExternalLink className="h-3 w-3" />
        </a>
        <div className="space-y-2">
          <Label htmlFor="ant-key">API Key</Label>
          <Input
            id="ant-key"
            type="password"
            placeholder="sk-ant-api03-..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          <Button onClick={validate} disabled={!key || validating} className="flex-1">
            {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Validar e continuar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Step 3: WhatsApp ----------------
function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 13);
  if (d.length <= 2) return `+${d}`;
  if (d.length <= 4) return `+${d.slice(0, 2)} (${d.slice(2)}`;
  if (d.length <= 9) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4)}`;
  return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
}
function phoneToE164(masked: string): string {
  return "+" + masked.replace(/\D/g, "");
}

function Step3WhatsApp({ data, updateData, onNext, onBack }: any) {
  const initial = data.whatsapp_phone ? maskPhone(data.whatsapp_phone) : "+55 ";
  const [phone, setPhone] = useState(initial);
  const e164 = phoneToE164(phone);
  const valid = /^\+\d{12,13}$/.test(e164);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <Phone className="h-5 w-5 text-primary" />
          <CardTitle>Seu WhatsApp</CardTitle>
        </div>
        <CardDescription>Onde Marcos vai te enviar alertas e onde você vai conversar com ele.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Telefone</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+55 (11) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(maskPhone(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">
            Você vai parear o WhatsApp na etapa 7 — mantenha o celular por perto.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          <Button
            disabled={!valid}
            onClick={() => { updateData({ whatsapp_phone: e164 }); onNext(); }}
            className="flex-1"
          >
            Continuar <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Step 4: ERP ----------------
const ERP_OPTIONS: Array<{ id: ErpName | "none"; name: string; fields?: Array<{ key: string; label: string; type?: string }>; helpUrl?: string }> = [
  { id: "omie", name: "Omie", helpUrl: "https://developer.omie.com.br/", fields: [
    { key: "app_key", label: "App Key" },
    { key: "app_secret", label: "App Secret", type: "password" },
  ]},
  { id: "bling", name: "Bling (OAuth)" },
  { id: "contaazul", name: "ContaAzul (OAuth)" },
  { id: "tiny", name: "Tiny ERP", helpUrl: "https://tiny.com.br/ajuda/api", fields: [
    { key: "token", label: "Token API", type: "password" },
  ]},
  { id: "granatum", name: "Granatum", fields: [{ key: "token", label: "Token API", type: "password" }] },
  { id: "vhsys", name: "VHSYS", fields: [
    { key: "access_token", label: "Access Token" },
    { key: "secret_token", label: "Secret Token", type: "password" },
  ]},
  { id: "nibo", name: "Nibo", fields: [{ key: "api_token", label: "API Token", type: "password" }] },
  { id: "holdprint", name: "Holdprint (gráfica)", helpUrl: "https://docs.holdworks.ai", fields: [
    { key: "api_key", label: "API Key (Ajustes → API)", type: "password" },
  ]},
  { id: "none", name: "Pular por enquanto" },
];

function Step4Erp({ data, updateData, onNext, onBack }: any) {
  const [selected, setSelected] = useState<ErpName | "none" | null>(data.erp?.name ?? null);
  const [creds, setCreds] = useState<Record<string, string>>(data.erp?.credentials ?? {});
  const [validating, setValidating] = useState(false);

  const opt = ERP_OPTIONS.find((o) => o.id === selected);

  const handleNext = async () => {
    if (!selected || selected === "none") {
      updateData({ erp: { name: "none" } });
      onNext();
      return;
    }
    if (selected === "bling") {
      updateData({ erp: { name: "bling" } });
      toast.info("Termine o OAuth do Bling e volte aqui.");
      window.location.href = "/integrations/bling";
      return;
    }
    if (selected === "contaazul") {
      updateData({ erp: { name: "contaazul" } });
      toast.info("Termine o OAuth do ContaAzul e volte aqui.");
      window.location.href = "/integrations/contaazul";
      return;
    }
    setValidating(true);
    try {
      const { data: r, error } = await supabase.functions.invoke("onboarding-test-erp-connection", {
        body: { erp_name: selected, credentials: creds },
      });
      if (error) throw error;
      if (!r?.valid) { toast.error(r?.error ?? "Credenciais inválidas"); return; }
      updateData({ erp: { name: selected, credentials: creds, validated: true } });
      toast.success("ERP configurado");
      onNext();
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setValidating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <Plug className="h-5 w-5 text-primary" />
          <CardTitle>Conecte seu ERP</CardTitle>
        </div>
        <CardDescription>Qual sistema financeiro você usa? Marcos vai ler dele.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ERP_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => { setSelected(o.id); setCreds({}); }}
              className={`rounded-lg border p-3 text-sm text-left transition-colors ${
                selected === o.id ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted"
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>

        {opt?.fields && opt.fields.length > 0 && (
          <div className="space-y-3 pt-2 animate-in fade-in duration-200">
            {opt.helpUrl && (
              <a href={opt.helpUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Como obter as credenciais <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {opt.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  type={f.type ?? "text"}
                  value={creds[f.key] ?? ""}
                  onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}

        {selected === "bling" && (
          <p className="text-xs text-muted-foreground">
            Você será redirecionado para a tela do Bling. Volte aqui depois pra continuar.
          </p>
        )}
        {selected === "contaazul" && (
          <p className="text-xs text-muted-foreground">
            OAuth — você será redirecionado para a página de autorização do ContaAzul.
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          <Button onClick={handleNext} disabled={!selected || validating} className="flex-1">
            {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {selected === "none" ? "Pular" : selected === "bling" ? "Ir para Bling" : selected === "contaazul" ? "Ir para ContaAzul" : "Validar e continuar"}
            {!validating && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Step 5: CRM ----------------
const CRM_OPTIONS: Array<{ id: CrmName | "none"; name: string; fields?: Array<{ key: string; label: string; type?: string }> }> = [
  { id: "hubspot", name: "HubSpot", fields: [{ key: "private_app_token", label: "Private App Token", type: "password" }] },
  { id: "rdstation", name: "RD Station", fields: [{ key: "token", label: "Token", type: "password" }] },
  { id: "piperun", name: "PipeRun", fields: [{ key: "token", label: "Token", type: "password" }] },
  { id: "pipedrive", name: "Pipedrive", fields: [{ key: "api_token", label: "API Token", type: "password" }] },
  { id: "none", name: "Pular" },
];

function Step5Crm({ data, updateData, onNext, onBack }: any) {
  const [selected, setSelected] = useState<CrmName | "none" | null>(data.crm?.name ?? null);
  const [creds, setCreds] = useState<Record<string, string>>(data.crm?.credentials ?? {});
  const [validating, setValidating] = useState(false);
  const opt = CRM_OPTIONS.find((o) => o.id === selected);

  const handleNext = async () => {
    if (!selected || selected === "none") {
      updateData({ crm: { name: "none" } });
      onNext();
      return;
    }
    setValidating(true);
    try {
      const { data: r, error } = await supabase.functions.invoke("onboarding-test-crm-connection", {
        body: { crm_name: selected, credentials: creds },
      });
      if (error) throw error;
      if (!r?.valid) { toast.error(r?.error ?? "Credenciais inválidas"); return; }
      updateData({ crm: { name: selected, credentials: creds, validated: true } });
      onNext();
    } catch (e: any) {
      toast.error(e?.message ?? String(e));
    } finally {
      setValidating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <Plug className="h-5 w-5 text-primary" />
          <CardTitle>Conecte um CRM (opcional)</CardTitle>
        </div>
        <CardDescription>Marcos pode prever receita futura olhando seu pipeline.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {CRM_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => { setSelected(o.id); setCreds({}); }}
              className={`rounded-lg border p-3 text-sm text-left transition-colors ${
                selected === o.id ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted"
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>

        {opt?.fields && (
          <div className="space-y-3 pt-2 animate-in fade-in duration-200">
            {opt.fields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`crm-${f.key}`}>{f.label}</Label>
                <Input
                  id={`crm-${f.key}`}
                  type={f.type ?? "text"}
                  value={creds[f.key] ?? ""}
                  onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          <Button onClick={handleNext} disabled={!selected || validating} className="flex-1">
            {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {selected === "none" ? "Pular" : "Continuar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Step 6: VPS ----------------
function Step6Vps({ data, updateData, onNext, onBack }: any) {
  const [installerUrl, setInstallerUrl] = useState<string | null>(data.installer_url ?? null);
  const [issuing, setIssuing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [instanceId, setInstanceId] = useState<string | null>(data.vps_connected_instance_id ?? null);
  const [hostname, setHostname] = useState<string | null>(null);

  const issueToken = async () => {
    setIssuing(true);
    try {
      const { data: r, error } = await supabase.functions.invoke("onboarding-issue-token", {});
      if (error) throw error;
      setInstallerUrl(r.installer_url);
      updateData({ installer_token: r.token, installer_url: r.installer_url });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar token");
    } finally {
      setIssuing(false);
    }
  };

  // Polling: 5s checa se nova instância apareceu
  useEffect(() => {
    if (!installerUrl || instanceId) return;
    setWaiting(true);
    const t = setInterval(async () => {
      const { data: rows } = await supabase
        .from("instances")
        .select("id, hostname, last_heartbeat")
        .order("created_at", { ascending: false })
        .limit(1);
      const inst = rows?.[0];
      if (inst) {
        setInstanceId(inst.id);
        setHostname(inst.hostname);
        updateData({ vps_connected_instance_id: inst.id });
        setWaiting(false);
        clearInterval(t);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [installerUrl, instanceId, updateData]);

  const copy = () => {
    if (!installerUrl) return;
    const cmd = `curl -fsSL ${installerUrl} | bash`;
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      toast.success("Comando copiado");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <Server className="h-5 w-5 text-primary" />
          <CardTitle>Instale o agente na sua VPS</CardTitle>
        </div>
        <CardDescription>
          Rode esse comando único na VPS Linux que você tem (Ubuntu/Debian). Tudo que você preencheu já vai pré-configurado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!installerUrl ? (
          <Button onClick={issueToken} disabled={issuing} className="w-full">
            {issuing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
            Gerar comando de instalação
          </Button>
        ) : (
          <>
            <div className="relative">
              <pre className="bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto pr-12 whitespace-pre-wrap break-all">
                {`curl -fsSL ${installerUrl} | bash`}
              </pre>
              <button onClick={copy} className="absolute top-2 right-2 p-1.5 hover:bg-background rounded">
                {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Token válido por 30 minutos, uso único. O instalador demora ~3 minutos.
            </p>

            {!instanceId && waiting && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Aguardando sua VPS se conectar...
              </div>
            )}
            {instanceId && (
              <div className="flex items-center gap-2 text-sm rounded-md border border-green-500/30 bg-green-500/5 p-3">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>VPS conectada{hostname ? `: ${hostname}` : ""}</span>
              </div>
            )}
          </>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          <Button onClick={onNext} disabled={!instanceId} className="flex-1">
            Continuar <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Step 7: WhatsApp pairing ----------------
function Step7WhatsAppPair({ data, updateData, onNext, onBack }: any) {
  const [starting, setStarting] = useState(false);
  const [paired, setPaired] = useState<boolean>(!!data.whatsapp_paired);
  const [waInfo, setWaInfo] = useState<{ status: string; jid: string | null } | null>(null);

  const startPairing = async () => {
    if (!data.vps_connected_instance_id || !data.whatsapp_phone) {
      toast.error("Faltam dados das etapas anteriores");
      return;
    }
    setStarting(true);
    try {
      const { error } = await supabase.functions.invoke("push-command", {
        body: {
          instance_id: data.vps_connected_instance_id,
          command: `/skill wa auth --phone ${data.whatsapp_phone}`,
        },
      });
      if (error) throw error;
      toast.success("Pareamento iniciado. Verifique o WhatsApp em ~30s.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao iniciar pareamento");
    } finally {
      setStarting(false);
    }
  };

  // Polling whatsapp_status
  useEffect(() => {
    const t = setInterval(async () => {
      const { data: rows } = await supabase
        .from("whatsapp_status")
        .select("status, jid")
        .order("created_at", { ascending: false })
        .limit(1);
      const wa = rows?.[0];
      if (wa) {
        setWaInfo({ status: wa.status, jid: wa.jid });
        if (wa.status?.toLowerCase().includes("auth") && wa.jid) {
          setPaired(true);
          updateData({ whatsapp_paired: true });
          clearInterval(t);
        }
      }
    }, 5000);
    return () => clearInterval(t);
  }, [updateData]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <MessageSquare className="h-5 w-5 text-primary" />
          <CardTitle>Parear o WhatsApp</CardTitle>
        </div>
        <CardDescription>
          O Marcos vai usar seu próprio WhatsApp (web) para te enviar mensagens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
          <li>Clique em "Iniciar pareamento".</li>
          <li>Abra o WhatsApp no celular → <strong>Aparelhos conectados</strong>.</li>
          <li>Toque em <strong>Conectar com número de telefone</strong>.</li>
          <li>Digite o número <strong className="text-foreground">{data.whatsapp_phone}</strong> e use o código que aparecer na VPS.</li>
        </ol>

        <Button onClick={startPairing} disabled={starting || paired} className="w-full">
          {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {paired ? "Pareado ✓" : "Iniciar pareamento"}
        </Button>

        {waInfo && (
          <div className="text-xs text-muted-foreground">
            Status: <Badge variant="outline">{waInfo.status}</Badge>
            {waInfo.jid && <span className="ml-2">{waInfo.jid}</span>}
          </div>
        )}

        {paired && (
          <div className="flex items-center gap-2 text-sm rounded-md border border-green-500/30 bg-green-500/5 p-3">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            WhatsApp conectado!
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          <Button onClick={onNext} className="flex-1">
            {paired ? "Finalizar" : "Pular por enquanto"} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Step 8: Done ----------------
function Step8Done({ onComplete }: { onComplete: () => void }) {
  useEffect(() => { onComplete(); }, [onComplete]);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="text-center">
        <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <PartyPopper className="h-10 w-10 text-primary animate-bounce" />
          <div className="absolute -top-1 -right-1 text-2xl animate-pulse">✨</div>
          <div className="absolute -bottom-1 -left-1 text-2xl animate-pulse delay-150">🎉</div>
        </div>
        <CardTitle className="text-2xl">Marcos está vivo!</CardTitle>
        <CardDescription>
          Você vai receber seu primeiro alerta amanhã às 7h. Bem-vindo ao Agente CFO.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {[
          { to: "/chat", icon: MessageSquare, label: "Conversar com Marcos", desc: "Pergunte qualquer coisa pelo painel." },
          { to: "/", icon: BarChart3, label: "Ver dashboard", desc: "Saldo, eventos e custos do mês." },
          { to: "/settings", icon: SettingsIcon, label: "Configurar regras", desc: "Ajustar alertas e preferências." },
        ].map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="flex items-center gap-3 rounded-md border p-3 hover:bg-muted transition-colors"
          >
            <c.icon className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <div className="text-sm font-medium">{c.label}</div>
              <div className="text-xs text-muted-foreground">{c.desc}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------- Step 4b: Plataforma de cobrança ----------------
const BILLING_OPTIONS: Array<{ id: BillingName | "none"; name: string; helpUrl?: string; tokenLabel?: string }> = [
  { id: "asaas", name: "Asaas", helpUrl: "https://docs.asaas.com/", tokenLabel: "API Key" },
  { id: "iugu", name: "Iugu", helpUrl: "https://dev.iugu.com/", tokenLabel: "API Token" },
  { id: "none", name: "Pular" },
];

function Step5Billing({ data, updateData, onNext, onBack }: any) {
  const [selected, setSelected] = useState<BillingName | "none" | null>(data.billing?.name ?? null);
  const [token, setToken] = useState<string>(data.billing?.credentials?.api_token ?? "");
  const opt = BILLING_OPTIONS.find((o) => o.id === selected);

  const handleNext = () => {
    if (!selected || selected === "none") {
      updateData({ billing: { name: "none" } });
      onNext();
      return;
    }
    if (!token.trim()) { toast.error("Cole o token primeiro"); return; }
    updateData({ billing: { name: selected, credentials: { api_token: token.trim() } } });
    toast.success("Plataforma de cobrança configurada");
    onNext();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <CreditCard className="h-5 w-5 text-primary" />
          <CardTitle>Plataforma de cobrança (opcional)</CardTitle>
        </div>
        <CardDescription>Cobra clientes via boleto/PIX/cartão? Marcos pode acompanhar inadimplência.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {BILLING_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => { setSelected(o.id); setToken(""); }}
              className={`rounded-lg border p-3 text-sm text-left transition-colors ${
                selected === o.id ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted"
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>

        {opt && opt.id !== "none" && (
          <div className="space-y-3 pt-2 animate-in fade-in duration-200">
            {opt.helpUrl && (
              <a href={opt.helpUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Como obter o token <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="billing-token">{opt.tokenLabel}</Label>
              <Input
                id="billing-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              O token será enviado pra sua VPS quando você terminar a etapa 8 (instalação).
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          <Button onClick={handleNext} disabled={!selected} className="flex-1">
            {selected === "none" ? "Pular" : "Continuar"} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------- Step 5b: E-commerce ----------------
const ECOMMERCE_OPTIONS: Array<{ id: EcommerceName | "none"; name: string; href?: string }> = [
  { id: "mercado-livre", name: "Mercado Livre", href: "/integrations/mercado-livre" },
  { id: "nuvemshop", name: "Nuvemshop", href: "/integrations/nuvemshop" },
  { id: "none", name: "Pular" },
];

function Step7Ecommerce({ data, updateData, onNext, onBack }: any) {
  const [selected, setSelected] = useState<EcommerceName | "none" | null>(data.ecommerce?.name ?? null);
  const opt = ECOMMERCE_OPTIONS.find((o) => o.id === selected);

  const handleNext = () => {
    if (!selected || selected === "none") {
      updateData({ ecommerce: { name: "none" } });
      onNext();
      return;
    }
    updateData({ ecommerce: { name: selected } });
    if (opt?.href) {
      toast.info("Termine o OAuth e volte aqui pra continuar.");
      window.location.href = opt.href;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <ShoppingCart className="h-5 w-5 text-primary" />
          <CardTitle>E-commerce (opcional)</CardTitle>
        </div>
        <CardDescription>Vende online? Marcos lê pedidos e estoque do seu canal.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {ECOMMERCE_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelected(o.id)}
              className={`rounded-lg border p-3 text-sm text-left transition-colors ${
                selected === o.id ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted"
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>

        {selected && selected !== "none" && (
          <p className="text-xs text-muted-foreground">
            OAuth — você será redirecionado pra autorizar com {opt?.name}.
          </p>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
          <Button onClick={handleNext} disabled={!selected} className="flex-1">
            {selected === "none" ? "Pular" : `Ir para ${opt?.name}`} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
