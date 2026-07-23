import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/integrations/contaazul/callback")({
  head: () => ({ meta: [{ title: "Conectando ContaAzul…" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    code: typeof s.code === "string" ? s.code : undefined,
    state: typeof s.state === "string" ? s.state : undefined,
    error: typeof s.error === "string" ? s.error : undefined,
  }),
  component: ContaAzulCallback,
});

const STORAGE_KEY = "contaazul_oauth_pending";

function ContaAzulCallback() {
  const { code, error: oauthError } = Route.useSearch();
  const navigate = useNavigate();
  const ranRef = useRef(false);
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [message, setMessage] = useState("Trocando código por tokens…");

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      if (oauthError) {
        setStatus("error");
        setMessage(`ContaAzul retornou erro: ${oauthError}`);
        return;
      }
      if (!code) {
        setStatus("error");
        setMessage("Sem code na URL.");
        return;
      }

      const pendingRaw = sessionStorage.getItem(STORAGE_KEY);
      if (!pendingRaw) {
        setStatus("error");
        setMessage("Sessão expirada. Reabra a página de ContaAzul e tente de novo.");
        return;
      }
      const pending = JSON.parse(pendingRaw) as {
        client_id: string; client_secret: string; instance_id: string; redirect_uri: string;
      };

      try {
        setMessage("Trocando código por tokens…");
        const { data: exch, error: exchErr } = await supabase.functions.invoke("contaazul-oauth-exchange", {
          body: {
            code,
            client_id: pending.client_id,
            client_secret: pending.client_secret,
            redirect_uri: pending.redirect_uri,
          },
        });
        if (exchErr || !exch?.access_token) {
          throw new Error(exchErr?.message || exch?.error || "Falha na troca de tokens");
        }

        setMessage("Enviando tokens para a sua VPS…");
        const { error: pushErr } = await supabase.functions.invoke("contaazul-push-tokens", {
          body: {
            instance_id: pending.instance_id,
            access_token: exch.access_token,
            refresh_token: exch.refresh_token,
            expires_in: exch.expires_in,
            client_id: pending.client_id,
            client_secret: pending.client_secret,
          },
        });
        if (pushErr) throw new Error(pushErr.message || "Falha ao empurrar tokens");

        sessionStorage.removeItem(STORAGE_KEY);
        setStatus("ok");
        setMessage("ContaAzul conectado com sucesso!");
        toast.success("ContaAzul conectado!");
        setTimeout(() => navigate({ to: "/integrations/contaazul" }), 1500);
      } catch (e) {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : String(e));
        toast.error("Falha ao conectar ContaAzul");
      }
    })();
  }, [code, oauthError, navigate]);

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardContent className="py-10 flex flex-col items-center text-center gap-3">
          {status === "working" && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
          {status === "ok" && <CheckCircle2 className="h-8 w-8 text-primary" />}
          {status === "error" && <XCircle className="h-8 w-8 text-destructive" />}
          <p className="text-sm">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}
