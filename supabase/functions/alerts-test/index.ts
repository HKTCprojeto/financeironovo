/**
 * POST /alerts-test
 * Body: { id }
 * Dispara uma entrada manual em alerts_history com status='test'.
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: { id?: string };
  try { body = await req.json(); } catch { return errorResponse("Body inválido", 400); }
  if (!body.id) return errorResponse("id obrigatório", 400);

  const supabase = adminClient();
  const { data: alert, error: aerr } = await supabase
    .from("alerts_config")
    .select("id, name, type, channels")
    .eq("id", body.id)
    .maybeSingle();
  if (aerr) return errorResponse(aerr.message, 500);
  if (!alert) return errorResponse("Alerta não encontrado", 404);

  const { error } = await supabase.from("alerts_history").insert({
    alert_id: alert.id,
    status: "test",
    payload: {
      manual: true,
      name: alert.name,
      type: alert.type,
      channels: alert.channels,
      message: `Teste manual do alerta "${alert.name}"`,
    },
  });
  if (error) return errorResponse(`Erro ao testar: ${error.message}`, 500);
  return jsonResponse({ ok: true });
});
