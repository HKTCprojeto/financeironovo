/**
 * POST /instance-register
 * Registra ou atualiza a instância VPS do cliente.
 * Upsert por hostname (single-tenant: 1 deploy = 1 empresa).
 *
 * Auth: X-Panel-Token
 * Body: { hostname, openclaw_version, agente_cfo_version, ingress_url, hooks_token, openclaw_dashboard_token }
 * Retorna: { instance_id }
 */

import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
  validatePanelToken,
} from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  if (!(await validatePanelToken(req))) {
    return errorResponse("Token inválido", 401);
  }

  let body: {
    hostname?: string;
    openclaw_version?: string;
    agente_cfo_version?: string;
    ingress_url?: string;
    hooks_token?: string;
    openclaw_dashboard_token?: string;
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  const supabase = adminClient();

  const upsertData = {
    hostname: body.hostname ?? null,
    openclaw_version: body.openclaw_version ?? null,
    agente_cfo_version: body.agente_cfo_version ?? null,
    ingress_url: body.ingress_url ?? null,
    hooks_token: body.hooks_token ?? null,
    openclaw_dashboard_token: body.openclaw_dashboard_token ?? null,
    last_heartbeat: new Date().toISOString(),
    status: "online",
  };

  const { data: instance, error } = await supabase
    .from("instances")
    .upsert(upsertData, {
      onConflict: "hostname",
      ignoreDuplicates: false,
    })
    .select("id")
    .single();

  if (error || !instance) {
    console.error("Upsert error:", error);
    return errorResponse("Erro ao registrar instância", 500);
  }

  await supabase.from("audit_log").insert({
    actor_user_id: null,
    action: "instance_registered",
    payload: {
      instance_id: instance.id,
      hostname: body.hostname,
      agente_cfo_version: body.agente_cfo_version,
    },
  });

  return jsonResponse({ instance_id: instance.id });
});
