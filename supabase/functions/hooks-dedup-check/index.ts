/**
 * POST /hooks-dedup-check
 * Verifica e registra dedup de disparo de /hooks/agent (cross-channel).
 * Auth: X-Panel-Token.
 *
 * Body: {
 *   dedup_key: string,
 *   channel: string,
 *   external_id: string,
 *   source: string
 * }
 *
 * Returns:
 *   { already_seen: false } → primeira vez; registra e deixa prosseguir
 *   { already_seen: true  } → chave já existe e não expirou; skip o disparo
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse, validatePanelToken } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  if (!(await validatePanelToken(req))) return errorResponse("Token inválido", 401);

  let body: { dedup_key?: string; channel?: string; external_id?: string; source?: string };
  try { body = await req.json(); } catch { return errorResponse("Body JSON inválido", 400); }

  const dedup_key = String(body.dedup_key ?? "").trim();
  const channel = String(body.channel ?? "").trim();
  const external_id = String(body.external_id ?? "").trim();
  const source = String(body.source ?? "unknown").trim();

  if (!dedup_key || !channel) {
    return errorResponse("dedup_key e channel são obrigatórios", 400);
  }

  const supabase = adminClient();

  const { error: insertErr } = await supabase
    .from("hooks_dedup")
    .insert({ dedup_key, channel, external_id, source })
    .select()
    .maybeSingle();

  if (insertErr && !insertErr.message.includes("duplicate")) {
    console.error("hooks_dedup insert error:", insertErr);
    return errorResponse("Erro interno ao verificar dedup", 500);
  }

  if (!insertErr) {
    return jsonResponse({ already_seen: false }, 200);
  }

  const { data: existing } = await supabase
    .from("hooks_dedup")
    .select("expires_at")
    .eq("dedup_key", dedup_key)
    .maybeSingle();

  if (!existing) {
    return jsonResponse({ already_seen: false }, 200);
  }

  const isExpired = new Date(existing.expires_at) < new Date();
  if (isExpired) {
    await supabase
      .from("hooks_dedup")
      .update({
        source,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      })
      .eq("dedup_key", dedup_key);
    return jsonResponse({ already_seen: false }, 200);
  }

  return jsonResponse({ already_seen: true }, 200);
});
