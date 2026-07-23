/**
 * POST /dashboard-publish-insights
 * Persiste insights gerados por Marcos (CFO IA).
 * Auth: X-Panel-Token (VPS → painel).
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

  // ── Auth: X-Panel-Token (single-tenant) ───────────────────────────────
  if (!(await validatePanelToken(req))) {
    return errorResponse("X-Panel-Token inválido ou ausente", 401);
  }

  const supabase = adminClient();

  // ── Parse body ─────────────────────────────────────────────────────────
  let body: Array<{
    section?: string;
    text?: string;
    severity?: string;
    data?: unknown;
  }>;

  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  if (!Array.isArray(body) || body.length === 0) {
    return errorResponse("Body deve ser um array não-vazio de insights", 400);
  }

  // Valida campos obrigatórios
  const validSeverities = ["info", "warn", "critical"];
  for (const item of body) {
    if (!item.section || !item.text || !item.severity) {
      return errorResponse("Cada insight requer section, text e severity", 400);
    }
    if (!validSeverities.includes(item.severity)) {
      return errorResponse(
        `severity deve ser: ${validSeverities.join(", ")}`,
        400,
      );
    }
  }

  // ── Limpa insights expirados ──────────────────────────────────────────
  await supabase
    .from("marcos_insights")
    .delete()
    .lt("expires_at", new Date().toISOString());

  // ── Insere novos insights ─────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const rows = body.map((item) => ({
    section: item.section,
    text: item.text,
    severity: item.severity,
    data: item.data ?? null,
    expires_at: expiresAt,
  }));

  const { error } = await supabase.from("marcos_insights").insert(rows);

  if (error) {
    return errorResponse(`Erro ao inserir insights: ${error.message}`, 500);
  }

  return jsonResponse({ inserted: rows.length }, 201);
});
