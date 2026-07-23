import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/integrations/nuvemshop")({
  head: () => ({ meta: [{ title: "Conectar Nuvemshop — Agente CFO" }] }),
  component: NuvemshopPage,
});

const STORAGE_KEY = "nuvemshop_oauth_pending";

function NuvemshopPage() {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("instances")
        .select("id, connected_integrations")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) {
        setInstanceId(data.id);
        const ci = (data.connected_integrations ?? {}) as Record<string, { connected_at?: string }>;
        if (ci.nuvemshop?.connected_at) setConnectedAt(ci.nuvemshop.connected_at);
      }
      const pending = sessionStorage.getItem(STORAGE_KEY);
      if (pending) {
        try {
          const p = JSON.parse(pending);
          if (p.client_id) setAppId(p.client_id);
        } catch { /* noop */ }
      }
      setLoading(false);
    })();
  }, []);

  const handleAuthorize = () => {
    if (!appId.trim() || !appSecret.trim()) {
      toast.error("Preencha App ID e App Secret");
      return;
    }
    if (!instanceId) {
      toast.error("Nenhuma instância encontrada. Rode setup.sh na VPS primeiro.");
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      client_id: appId.trim(),
      client_secret: appSecret.trim(),
      instance_id: instanceId,
    }));
    const state = encodeURIComponent(instanceId);
    const url = `https://www.nuvemshop.com.br/apps/${encodeURIComponent(appId.trim())}/authorize?state=${state}`;
    window.open(url, "_blank");
    toast("Autorize no Nuvemshop e aguarde o redirecionamento.");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conectar Nuvemshop</h1>
        <p className="text-sm text-muted-foreground">
          Conecte sua loja Nuvemshop pro Marcos consultar pedidos, produtos e clientes.
        </p>
      </div>

      {connectedAt && (
        <Card className="border-primary/40">
          <CardContent className="flex items-center gap-2 py-4">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <span className="text-sm">
              Conectado em <strong>{formatDateTime(connectedAt)}</strong>. Você pode reconectar abaixo.
            </span>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Credenciais da app Nuvemshop</CardTitle>
          <CardDescription>
            Crie uma aplicação em{" "}
            <a
              href="https://partners.nuvemshop.com.br/"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2 inline-flex items-center gap-1"
            >
              Nuvemshop Partners <ExternalLink className="h-3 w-3" />
            </a>{" "}
            e cole as credenciais aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="app_id">App ID</Label>
            <Input id="app_id" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="12345" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="app_secret">App Secret</Label>
            <Input id="app_secret" type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            <p className="font-medium">Como obter:</p>
            <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
              <li>Acesse <strong>partners.nuvemshop.com.br</strong>.</li>
              <li>Crie uma aplicação.</li>
              <li>No campo <em>Redirect URI</em> da app, configure: <code className="text-xs">{typeof window !== "undefined" ? `${window.location.origin}/integrations/nuvemshop/callback` : ""}</code></li>
              <li>Copie App ID e App Secret aqui.</li>
              <li>Clique <strong>Autorizar</strong> e instale a app na sua loja.</li>
            </ol>
          </div>
          <Button onClick={handleAuthorize} disabled={loading || !instanceId} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Autorizar com Nuvemshop
          </Button>
          {!loading && !instanceId && (
            <p className="text-sm text-destructive">
              Nenhuma instância encontrada. Rode <code>setup.sh</code> na sua VPS antes.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
