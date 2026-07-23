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

export const Route = createFileRoute("/_authenticated/integrations/mercado-livre")({
  head: () => ({ meta: [{ title: "Conectar Mercado Livre — Agente CFO" }] }),
  component: MercadoLivrePage,
});

const STORAGE_KEY = "mercado_livre_oauth_pending";

function MercadoLivrePage() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
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
        if (ci.mercado_livre?.connected_at) setConnectedAt(ci.mercado_livre.connected_at);
      }
      const pending = sessionStorage.getItem(STORAGE_KEY);
      if (pending) {
        try {
          const p = JSON.parse(pending);
          if (p.client_id) setClientId(p.client_id);
        } catch { /* noop */ }
      }
      setLoading(false);
    })();
  }, []);

  const handleAuthorize = () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Preencha client_id e client_secret");
      return;
    }
    if (!instanceId) {
      toast.error("Nenhuma instância encontrada. Rode setup.sh na VPS primeiro.");
      return;
    }
    const redirectUri = `${window.location.origin}/integrations/mercado-livre/callback`;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      client_id: clientId.trim(),
      client_secret: clientSecret.trim(),
      instance_id: instanceId,
      redirect_uri: redirectUri,
    }));
    const state = encodeURIComponent(instanceId);
    const url =
      `https://auth.mercadolivre.com.br/authorization` +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId.trim())}` +
      `&state=${state}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.open(url, "_blank");
    toast("Autorize no Mercado Livre e aguarde o redirecionamento.");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conectar Mercado Livre</h1>
        <p className="text-sm text-muted-foreground">
          Conecte sua conta Mercado Livre pro Marcos consultar pedidos, vendas e estoque.
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
          <CardTitle>Credenciais da app Mercado Livre</CardTitle>
          <CardDescription>
            Crie uma aplicação em{" "}
            <a
              href="https://developers.mercadolivre.com.br/devcenter"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2 inline-flex items-center gap-1"
            >
              DevCenter <ExternalLink className="h-3 w-3" />
            </a>{" "}
            e cole as credenciais aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client_id">Client ID (App ID)</Label>
            <Input id="client_id" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="1234567890..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_secret">Client Secret</Label>
            <Input id="client_secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="••••••••" />
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            <p className="font-medium">Como obter:</p>
            <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
              <li>Acesse <strong>developers.mercadolivre.com.br/devcenter</strong>.</li>
              <li>Crie uma nova aplicação.</li>
              <li>No campo <em>Redirect URI</em>, cole: <code className="text-xs">{typeof window !== "undefined" ? `${window.location.origin}/integrations/mercado-livre/callback` : ""}</code></li>
              <li>Copie App ID (client_id) e Secret Key aqui.</li>
              <li>Clique <strong>Autorizar</strong>.</li>
            </ol>
          </div>
          <Button onClick={handleAuthorize} disabled={loading || !instanceId} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Autorizar com Mercado Livre
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
