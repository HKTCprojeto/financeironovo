/**
 * GET /openclaw-ws-url
 * Retorna URL WebSocket do gateway OpenClaw + token de auth.
 * Single-tenant: pega instância mais recente com heartbeat fresco.
 *
 * Auth: JWT do dono logado.
 * Retorna: { ws_url: "wss://<host>/", gateway_token: "<token>" } | 503 se VPS offline
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

  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) return errorResponse("Configuração do painel incompleta", 500);

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    anonKey,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) return errorResponse("JWT inválido ou expirado", 401);

  const supabase = adminClient();
  const { data: instance } = await supabase
    .from("instances")
    .select("ingress_url, openclaw_dashboard_token, last_heartbeat")
    .order("last_heartbeat", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!instance?.ingress_url || !instance?.openclaw_dashboard_token) {
    return errorResponse(
      "Gateway OpenClaw indisponível — VPS precisa atualizar (rode setup.sh)",
      422,
    );
  }

  const lastHb = instance.last_heartbeat
    ? new Date(instance.last_heartbeat).getTime()
    : 0;
  const fresh = Date.now() - lastHb < 5 * 60 * 1000;
  if (!fresh) {
    return errorResponse(
      "Marcos está dormindo — VPS desconectada (sem heartbeat recente)",
      503,
    );
  }

  const wsUrl = instance.ingress_url
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://")
    .replace(/\/$/, "") + "/";

  return jsonResponse({
    ws_url: wsUrl,
    gateway_token: instance.openclaw_dashboard_token,
  });
});
