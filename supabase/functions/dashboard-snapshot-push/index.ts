/**
 * POST /dashboard-snapshot-push
 * Recebe snapshot agregado pushado pela VPS e persiste em dashboard_snapshots.
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
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  if (!body || typeof body !== "object" || !body.as_of || !body.kpis) {
    return errorResponse("Body deve conter as_of e kpis", 400);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

  const { error } = await supabase.from("dashboard_snapshots").insert({
    data: body,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    return errorResponse(`Erro ao inserir snapshot: ${error.message}`, 500);
  }

  return jsonResponse({ ok: true }, 201);
});
