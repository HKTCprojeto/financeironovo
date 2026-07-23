/**
 * POST /automation-confirm
 * Callback de confirmação de automação via WhatsApp.
 * Auth: X-Panel-Token (chamado pelo wacli_inbound.py da VPS).
 */
import {
  adminClient,
  validatePanelToken,
  corsHeaders,
  errorResponse,
  jsonResponse,
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

  let body: { token?: string; decision?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  if (!body.token) {
    return errorResponse("token obrigatório", 400);
  }

  if (!body.decision || !["confirm", "cancel"].includes(body.decision)) {
    return errorResponse("decision deve ser 'confirm' ou 'cancel'", 400);
  }

  const supabase = adminClient();

  // Busca run pelo confirmation_token
  const { data: run, error: findError } = await supabase
    .from("automation_runs")
    .select("id, automation_id, status")
    .eq("confirmation_token", body.token)
    .eq("status", "pending_confirm")
    .maybeSingle();

  if (findError) {
    return errorResponse(`Erro ao buscar run: ${findError.message}`, 500);
  }

  if (!run) {
    return errorResponse("Run não encontrado ou já processado", 404);
  }

  if (body.decision === "confirm") {
    // Marca como running — o engine detecta e executa
    const { error: updateError } = await supabase
      .from("automation_runs")
      .update({ status: "running" })
      .eq("id", run.id);

    if (updateError) {
      return errorResponse(`Erro ao confirmar: ${updateError.message}`, 500);
    }

    return jsonResponse({ ok: true, status: "running" });
  } else {
    // Cancela
    const { error: updateError } = await supabase
      .from("automation_runs")
      .update({
        status: "cancelled",
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    if (updateError) {
      return errorResponse(`Erro ao cancelar: ${updateError.message}`, 500);
    }

    return jsonResponse({ ok: true, status: "cancelled" });
  }
});
