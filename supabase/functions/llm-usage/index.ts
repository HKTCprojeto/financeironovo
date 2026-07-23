/**
 * POST /llm-usage
 * Upsert de custo LLM por sessão e período.
 * Chave de upsert: (instance_id, session_id, period).
 *
 * Auth: X-Panel-Token
 * Body: { instance_id, session_id, model, input_tokens, output_tokens, cost_brl, period }
 * Retorna: { id, cost_brl_total_period }
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
    instance_id?: string;
    session_id?: string;
    model?: string;
    input_tokens?: number;
    output_tokens?: number;
    cost_brl?: number;
    period?: string;
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  if (!body.instance_id) return errorResponse("instance_id obrigatório", 400);
  if (!body.session_id)  return errorResponse("session_id obrigatório", 400);
  if (!body.period)      return errorResponse("period obrigatório (YYYY-MM)", 400);

  if (!/^\d{4}-\d{2}$/.test(body.period)) {
    return errorResponse("period deve estar no formato YYYY-MM", 400);
  }

  const supabase = adminClient();

  const { data: usage, error } = await supabase
    .from("llm_usage")
    .upsert(
      {
        instance_id: body.instance_id,
        session_id: body.session_id,
        model: body.model ?? "unknown",
        input_tokens: body.input_tokens ?? 0,
        output_tokens: body.output_tokens ?? 0,
        cost_brl: body.cost_brl ?? 0,
        period: body.period,
      },
      { onConflict: "instance_id,session_id,period", ignoreDuplicates: false },
    )
    .select("id")
    .single();

  if (error || !usage) {
    console.error("LLM usage upsert error:", error);
    return errorResponse("Erro ao registrar uso LLM", 500);
  }

  // Total do período para feedback ao cliente
  const { data: rows } = await supabase
    .from("llm_usage")
    .select("cost_brl")
    .eq("instance_id", body.instance_id)
    .eq("period", body.period);

  const total = (rows ?? []).reduce(
    (sum, row) => sum + (Number(row.cost_brl) || 0),
    0,
  );

  return jsonResponse({
    id: usage.id,
    cost_brl_total_period: Number(total.toFixed(2)),
  });
});
