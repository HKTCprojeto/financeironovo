/**
 * POST /heartbeat
 * Atualiza last_heartbeat e status da instância.
 *
 * Auth: X-Panel-Token
 * Body: { instance_id, openclaw_version?, ingress_url? }
 * Retorna: 204 No Content
 */

import {
  adminClient,
  corsHeaders,
  errorResponse,
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
    instance_id?: string;
    openclaw_version?: string;
    ingress_url?: string;
    system_prompt?: string;
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  if (!body.instance_id) {
    return errorResponse("instance_id obrigatório", 400);
  }

  const supabase = adminClient();

  const updateData: Record<string, unknown> = {
    last_heartbeat: new Date().toISOString(),
    status: "online",
  };

  if (body.openclaw_version) updateData.openclaw_version = body.openclaw_version;
  if (body.ingress_url)      updateData.ingress_url = body.ingress_url;
  if (body.system_prompt !== undefined) updateData.system_prompt = body.system_prompt;

  const { error } = await supabase
    .from("instances")
    .update(updateData)
    .eq("id", body.instance_id);

  if (error) {
    console.error("Heartbeat update error:", error);
    return errorResponse("Erro ao atualizar heartbeat", 500);
  }

  return new Response(null, { status: 204, headers: corsHeaders });
});
