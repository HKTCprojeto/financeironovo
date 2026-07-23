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

export const Route = createFileRoute("/_authenticated/integrations/hubspot")({
  head: () => ({ meta: [{ title: "Conectar HubSpot — Agente CFO" }] }),
  component: HubspotPage,
});

const STORAGE_KEY = "hubspot_oauth_pending";

const SCOPES = [
  "crm.objects.contacts.read",
  "crm.objects.companies.read",
  "crm.objects.deals.read",
  "crm.objects.contacts.write",
  "crm.objects.companies.write",
  "crm.objects.deals.write",
];

function HubspotPage() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [connectedAt, setConnectedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("integration_credentials")
        .select("updated_at, active")
        .eq("skill_name", "hubspot")
        .maybeSingle();
      if (data?.active) setConnectedAt(data.updated_at);

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

  const redirectUri =
    typeof window !== "undefined" ? `${window.location.origin}/integrations/hubspot/callback` : "";

  const handleAuthorize = () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Preencha Client ID e Client Secret");
      return;
    }
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        redirect_uri: redirectUri,
      }),
    );
    const url =
      `https://app.hubspot.com/oauth/authorize` +
      `?client_id=${encodeURIComponent(clientId.trim())}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(SCOPES.join(" "))}`;
    window.location.href = url;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conectar HubSpot</h1>
        <p className="text-sm text-muted-foreground">
          Conecte sua conta HubSpot pro Marcos consultar pipeline, contatos e deals.
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
          <CardTitle>Credenciais da app HubSpot</CardTitle>
          <CardDescription>
            Crie uma app em{" "}
            <a
              href="https://developers.hubspot.com/docs/api/private-apps"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2 inline-flex items-center gap-1"
            >
              developers.hubspot.com <ExternalLink className="h-3 w-3" />
            </a>{" "}
            e cole as credenciais aqui.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client_id">Client ID</Label>
            <Input
              id="client_id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_secret">Client Secret</Label>
            <Input
              id="client_secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
            <p className="font-medium">Como obter:</p>
            <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
              <li>Acesse o HubSpot Developer Portal.</li>
              <li>Crie uma nova app OAuth (não Private App).</li>
              <li>
                Em <em>Redirect URLs</em>, cole: <code className="text-xs">{redirectUri}</code>
              </li>
              <li>
                Selecione os scopes: <code className="text-xs">{SCOPES.join(", ")}</code>
              </li>
              <li>Copie Client ID e Client Secret e cole aqui.</li>
              <li>Clique em <strong>Conectar</strong> e autorize no HubSpot.</li>
            </ol>
          </div>
          <Button onClick={handleAuthorize} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Conectar HubSpot
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
