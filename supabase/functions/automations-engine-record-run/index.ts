/**
 * POST /automations-engine-record-run
 * Cria ou atualiza um automation_run. Optionally atualiza automations.last_run_at.
 *
 * Auth: X-Panel-Token + X-Hooks-Token
 *
 * Body:
 * {
 *   run: {
 *     id?: number,                   // se presente → UPDATE; ausente → INSERT
 *     automation_id: string,
 *     user_id?: string,
 *     status: string,
 *     trigger_payload?: object,
 *     steps?: array,
 *     result?: object,
 *     error?: string,
 *     confirmation_token?: string,
 *     started_at: string,
 *     finished_at?: string
 *   },
 *   update_automation_last_run?: boolean   // default false
 * }
 *
 * Resposta: { run_id: number }
 *
 * Sprint 19 — daemon usa edge functions, sem SUPABASE_SERVICE_ROLE_KEY na VPS.
 */

import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
  validatePanelToken,
} from "../_shared/auth.ts";

// ---------------------------------------------------------------------------
// Auth: valida X-Hooks-Token contra instances.hooks_token no DB
// ---------------------------------------------------------------------------

async function validateHooksToken(req: Request): Promise<boolean> {
  const token = req.headers.get("X-Hooks-Token");
  if (!token) return false;

  const supabase = adminClient();
  const { data: instance, error } = await supabase
    .from("instances")
    .select("hooks_token")
    .not("hooks_token", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !instance?.hooks_token) return false;

  const expected = instance.hooks_token as string;
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

interface RunPayload {
  id?: number;
  automation_id: string;
  user_id?: string;
  status: string;
  trigger_payload?: Record<string, unknown>;
  steps?: unknown[];
  result?: Record<string, unknown>;
  error?: string;
  confirmation_token?: string;
  started_at: string;
  finished_at?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // ── Auth dupla ────────────────────────────────────────────────────────
  if (!(await validatePanelToken(req))) {
    return errorResponse("X-Panel-Token inválido ou ausente", 401);
  }

  if (!(await validateHooksToken(req))) {
    return errorResponse("X-Hooks-Token inválido ou ausente", 401);
  }

  // ── Parse body ─────────────────────────────────────────────────────────
  let body: {
    run?: RunPayload;
    update_automation_last_run?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  const run = body.run;
  if (!run) {
    return errorResponse("Campo 'run' obrigatório", 400);
  }
  if (!run.automation_id) {
    return errorResponse("run.automation_id obrigatório", 400);
  }
  if (!run.status) {
    return errorResponse("run.status obrigatório", 400);
  }
  if (!run.started_at) {
    return errorResponse("run.started_at obrigatório", 400);
  }

  const supabase = adminClient();

  let runId: number;

  if (run.id) {
    // ── UPDATE run existente ────────────────────────────────────────────
    const updateData: Record<string, unknown> = {
      status: run.status,
    };
    if (run.steps !== undefined) updateData.steps = run.steps;
    if (run.result !== undefined) updateData.result = run.result;
    if (run.error !== undefined) updateData.error = run.error;
    if (run.finished_at !== undefined) updateData.finished_at = run.finished_at;
    if (run.trigger_payload !== undefined) updateData.trigger_payload = run.trigger_payload;

    const { data: updated, error: updateError } = await supabase
      .from("automation_runs")
      .update(updateData)
      .eq("id", run.id)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return errorResponse(`Erro ao atualizar run: ${updateError.message}`, 500);
    }

    if (!updated) {
      return errorResponse(`Run ${run.id} não encontrado`, 404);
    }

    runId = updated.id as number;
  } else {
    // ── INSERT novo run ─────────────────────────────────────────────────
    const insertData: Record<string, unknown> = {
      automation_id: run.automation_id,
      status: run.status,
      started_at: run.started_at,
    };
    if (run.user_id) insertData.user_id = run.user_id;
    if (run.trigger_payload !== undefined) insertData.trigger_payload = run.trigger_payload;
    if (run.steps !== undefined) insertData.steps = run.steps;
    if (run.result !== undefined) insertData.result = run.result;
    if (run.error !== undefined) insertData.error = run.error;
    if (run.confirmation_token !== undefined) insertData.confirmation_token = run.confirmation_token;
    if (run.finished_at !== undefined) insertData.finished_at = run.finished_at;

    const { data: inserted, error: insertError } = await supabase
      .from("automation_runs")
      .insert(insertData)
      .select("id")
      .maybeSingle();

    if (insertError) {
      return errorResponse(`Erro ao criar run: ${insertError.message}`, 500);
    }

    if (!inserted) {
      return errorResponse("Falha ao criar run (sem retorno)", 500);
    }

    runId = inserted.id as number;
  }

  // ── Atualiza last_run_at da automação (opcional) ──────────────────────
  if (body.update_automation_last_run) {
    const { error: lastRunError } = await supabase
      .from("automations")
      .update({ last_run_at: new Date().toISOString() })
      .eq("id", run.automation_id);

    if (lastRunError) {
      // Não bloqueia resposta — loga e segue
      console.error(
        `[record-run] Erro ao atualizar last_run_at para ${run.automation_id}:`,
        lastRunError,
      );
    }
  }

  return jsonResponse({ run_id: runId }, run.id ? 200 : 201);
});
