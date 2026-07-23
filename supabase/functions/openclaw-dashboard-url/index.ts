/**
 * GET /openclaw-dashboard-url
 * Retorna URL completa do dashboard do OpenClaw da VPS (com token).
 * Single-tenant: pega 1ª instância.
 *
 * Auth: JWT do dono logado.
 * Retorna: { url: "https://tunnel.../#token=XXX" } | 422 se não configurado
 */

import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Authorization header obrigatório", 401);
  }

  const anonKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) {
    return errorResponse("Configuração do painel incompleta", 500);
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    anonKey,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return errorResponse("JWT inválido ou expirado", 401);
  }

  const supabase = adminClient();
  const { data: instance } = await supabase
    .from("instances")
    .select("ingress_url, openclaw_dashboard_token")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!instance?.ingress_url || !instance?.openclaw_dashboard_token) {
    return errorResponse(
      "Dashboard do OpenClaw indisponível — VPS precisa atualizar (rode setup.sh novamente)",
      422,
    );
  }

  const url = `${instance.ingress_url.replace(/\/$/, "")}/#token=${instance.openclaw_dashboard_token}`;
  return jsonResponse({ url });
});
