/**
 * GET /automations-engine-poll
 * Retorna automações que precisam executar agora + runs pendentes de expiração.
 *
 * Auth: X-Panel-Token (validado contra env PANEL_TOKEN)
 *       X-Hooks-Token (validado contra instances.hooks_token no DB)
 *
 * Sprint 19 — daemon usa edge functions, sem SUPABASE_SERVICE_ROLE_KEY na VPS.
 *
 * Resposta:
 * {
 *   scheduled: Array<{ automation_id, automation, reason: "cron"|"metric" }>,
 *   pending_runs: Array<automation_run row>    // status=pending_confirm > 24h (para expirar)
 * }
 */

import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
  validatePanelToken,
} from "../_shared/auth.ts";

// ---------------------------------------------------------------------------
// Croner — parse de cron expressions
// ---------------------------------------------------------------------------
import { Cron } from "https://deno.land/x/croner@8.0.0/dist/croner.js";

// ---------------------------------------------------------------------------
// Helpers de auth
// ---------------------------------------------------------------------------

/** Valida X-Hooks-Token contra instances.hooks_token (busca no DB). */
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

  // Comparação constante
  const expected = instance.hooks_token as string;
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Avaliação de triggers
// ---------------------------------------------------------------------------

/**
 * Retorna true se a expressão cron deveria ter disparado desde last_run_at.
 * Usa Croner para calcular o próximo slot da cron antes de "now".
 */
function shouldRunCron(expr: string, lastRunAt: string | null): boolean {
  const now = new Date();

  let lastRun: Date;
  if (lastRunAt) {
    try {
      lastRun = new Date(lastRunAt);
    } catch {
      lastRun = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }
  } else {
    lastRun = new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  try {
    // Cria iterador a partir do último run e verifica se há um slot <= now
    const job = new Cron(expr, { startAt: lastRun, timezone: "America/Sao_Paulo" });
    const nextSlot = job.nextRun();
    if (!nextSlot) return false;
    return nextSlot <= now;
  } catch (err) {
    console.error(`[poll] Erro ao parsear cron "${expr}":`, err);
    return false;
  }
}

interface AutomationRow {
  id: string;
  user_id: string;
  name: string;
  trigger: {
    type: "cron" | "metric" | "manual";
    expression?: string;
    metric?: string;
    operator?: string;
    value?: number | string;
  };
  actions: Array<Record<string, unknown>>;
  active: boolean;
  require_confirmation?: boolean | null;
  last_run_at?: string | null;
  [key: string]: unknown;
}

interface ScheduledItem {
  automation_id: string;
  automation: AutomationRow;
  reason: "cron" | "metric";
}

/**
 * Avalia trigger metric buscando último snapshot no DB.
 * Cooldown implícito via last_run_at da automação (24h).
 */
async function shouldRunMetric(
  trigger: AutomationRow["trigger"],
  automation: AutomationRow,
): Promise<boolean> {
  // Cooldown: se executou há menos de 24h, não dispara novamente
  if (automation.last_run_at) {
    const lastRun = new Date(automation.last_run_at);
    const elapsed = Date.now() - lastRun.getTime();
    if (elapsed < 24 * 60 * 60 * 1000) return false;
  }

  const metricName = trigger.metric ?? "balance_brl";
  const operator = trigger.operator ?? "lt";
  const threshold = Number(trigger.value ?? 0);

  // Busca snapshot mais recente
  const supabase = adminClient();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: snapshot } = await supabase
    .from("dashboard_snapshots")
    .select("data")
    .gt("created_at", fiveMinAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!snapshot?.data) return false;

  const kpis = (snapshot.data as Record<string, unknown>).kpis as
    | Record<string, unknown>
    | undefined;
  if (!kpis) return false;

  const rawValue = kpis[metricName];
  if (rawValue === undefined || rawValue === null) return false;

  const value = Number(rawValue);
  if (isNaN(value)) return false;

  const ops: Record<string, boolean> = {
    lt: value < threshold,
    lte: value <= threshold,
    gt: value > threshold,
    gte: value >= threshold,
    eq: value === threshold,
    neq: value !== threshold,
  };

  return ops[operator] ?? false;
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  // ── Auth dupla: X-Panel-Token + X-Hooks-Token ────────────────────────
  if (!(await validatePanelToken(req))) {
    return errorResponse("X-Panel-Token inválido ou ausente", 401);
  }

  if (!(await validateHooksToken(req))) {
    return errorResponse("X-Hooks-Token inválido ou ausente", 401);
  }

  const supabase = adminClient();

  // ── 1. Busca automações ativas ────────────────────────────────────────
  const { data: automations, error: autoError } = await supabase
    .from("automations")
    .select("*")
    .eq("active", true);

  if (autoError) {
    return errorResponse(`Erro ao buscar automações: ${autoError.message}`, 500);
  }

  const rows = (automations ?? []) as AutomationRow[];

  // ── 2. Avalia quais precisam executar agora ───────────────────────────
  const scheduled: ScheduledItem[] = [];

  for (const automation of rows) {
    const trigger = automation.trigger ?? {};
    const ttype = trigger.type ?? "manual";

    if (ttype === "cron") {
      if (shouldRunCron(trigger.expression ?? "", automation.last_run_at ?? null)) {
        scheduled.push({ automation_id: automation.id, automation, reason: "cron" });
      }
    } else if (ttype === "metric") {
      const fire = await shouldRunMetric(trigger, automation);
      if (fire) {
        scheduled.push({ automation_id: automation.id, automation, reason: "metric" });
      }
    }
    // manual: só via run-now, nunca pelo engine
  }

  // ── 3. Runs pending_confirm > 24h (para expirar) ─────────────────────
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pendingRuns, error: runsError } = await supabase
    .from("automation_runs")
    .select("*")
    .eq("status", "pending_confirm")
    .lt("started_at", cutoff);

  if (runsError) {
    console.error("[poll] Erro ao buscar pending_runs:", runsError);
  }

  // ── 4. Runs com status=running aguardando execução (confirmados pelo dono) ──
  // Embute o objeto da automação para que o daemon possa executar sem REST adicional.
  const { data: runningRunsRaw, error: runningError } = await supabase
    .from("automation_runs")
    .select("*")
    .eq("status", "running")
    .is("finished_at", null);

  if (runningError) {
    console.error("[poll] Erro ao buscar running_runs:", runningError);
  }

  // Para cada running_run, embute o objeto completo da automação
  const runningRuns: Array<Record<string, unknown>> = [];
  for (const run of runningRunsRaw ?? []) {
    const runRow = run as Record<string, unknown>;
    const automationId = runRow.automation_id as string | undefined;
    if (automationId) {
      const automationObj = rows.find((a) => a.id === automationId);
      if (automationObj) {
        runningRuns.push({ ...runRow, automation: automationObj });
        continue;
      }
      // Automação desativada ou removida: busca direta com service_role
      const { data: fetchedAutomation } = await supabase
        .from("automations")
        .select("*")
        .eq("id", automationId)
        .maybeSingle();
      if (fetchedAutomation) {
        runningRuns.push({ ...runRow, automation: fetchedAutomation });
        continue;
      }
    }
    // Sem automação encontrada: inclui o run sem ela (daemon vai logar e pular)
    runningRuns.push(runRow);
  }

  return jsonResponse({
    scheduled,
    pending_runs: pendingRuns ?? [],
    running_runs: runningRuns,
  });
});
