/**
 * POST /event
 * Recebe evento da skill e persiste. Cria registros derivados para tipos
 * especiais: omie_error → omie_errors, wa_* → whatsapp_status.
 *
 * Auth: X-Panel-Token
 * Body: { instance_id, type, severity?, payload? }
 * Retorna: { event_id }
 */

import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
  validatePanelToken,
} from "../_shared/auth.ts";

const VALID_SEVERITIES = ["info", "warn", "error", "critical"] as const;
type Severity = typeof VALID_SEVERITIES[number];

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
    type?: string;
    severity?: string;
    payload?: Record<string, unknown>;
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  if (!body.instance_id) return errorResponse("instance_id obrigatório", 400);
  if (!body.type)        return errorResponse("type obrigatório", 400);

  const severity: Severity = VALID_SEVERITIES.includes(body.severity as Severity)
    ? (body.severity as Severity)
    : "info";

  const payload = body.payload ?? {};
  const supabase = adminClient();

  // Inserir evento principal
  const { data: event, error: eventError } = await supabase
    .from("events")
    .insert({
      instance_id: body.instance_id,
      type: body.type,
      severity,
      payload,
    })
    .select("id")
    .single();

  if (eventError || !event) {
    console.error("Event insert error:", eventError);
    return errorResponse("Erro ao inserir evento", 500);
  }

  // Registros derivados
  if (body.type === "omie_error") {
    await supabase.from("omie_errors").insert({
      instance_id: body.instance_id,
      command: payload.command as string ?? null,
      http_status: payload.http_status as number ?? null,
      message: payload.message as string ?? null,
    });
  }

  const WA_CONNECTED    = ["wa_status_changed", "whatsapp_reconnected", "whatsapp_repaired"];
  const WA_DISCONNECTED = ["whatsapp_disconnected"];

  if (WA_CONNECTED.includes(body.type)) {
    await supabase.from("whatsapp_status").insert({
      instance_id: body.instance_id,
      status: (payload.status as string) ?? "connected",
      jid: payload.jid as string ?? null,
      last_check: new Date().toISOString(),
    });
  } else if (WA_DISCONNECTED.includes(body.type)) {
    await supabase.from("whatsapp_status").insert({
      instance_id: body.instance_id,
      status: "disconnected",
      jid: null,
      last_check: new Date().toISOString(),
    });
  }

  return jsonResponse({ event_id: event.id }, 201);
});
