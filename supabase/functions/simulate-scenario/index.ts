/**
 * POST /simulate-scenario
 * Simula cenários financeiros what-if sobre o snapshot atual.
 * Auth: JWT Supabase do dono logado no front Lovable.
 */

import {
  corsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // ── Auth JWT ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Authorization header obrigatório", 401);
  }

  const anonKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) {
    return errorResponse("Configuração do painel incompleta", 500);
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    anonKey,
    { global: { headers: { Authorization: authHeader } } },
  );

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return errorResponse("JWT inválido ou expirado", 401);
  }

  // ── Parse body ─────────────────────────────────────────────────────────
  let body: {
    collect_percent_overdue?: number;
    close_deal_ids?: string[];
    cut_cost_pct?: number;
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  // ── Busca snapshot via dashboard-snapshot ──────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  let snapshot: Record<string, unknown>;

  try {
    const snapshotResp = await fetch(
      `${supabaseUrl}/functions/v1/dashboard-snapshot`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        signal: AbortSignal.timeout(60_000),
      },
    );

    if (!snapshotResp.ok) {
      const errText = await snapshotResp.text();
      return errorResponse(`Erro ao obter snapshot: ${errText}`, 502);
    }

    snapshot = await snapshotResp.json();
  } catch (err) {
    return errorResponse(`Falha ao chamar dashboard-snapshot: ${String(err)}`, 502);
  }

  const kpis = (snapshot.kpis ?? {}) as Record<string, number>;
  const balanceBrl = Number(kpis.balance_brl ?? 0);
  const overdueTotalBrl = Number(kpis.overdue_total_brl ?? 0);
  const pipelineWeightedBrl = Number(kpis.pipeline_weighted_brl ?? 0);
  const payables30dBrl = Number(kpis.payables_30d_brl ?? 0);

  // ── Simulações ─────────────────────────────────────────────────────────
  let newBalance = balanceBrl;
  let newPipelineWon = 0;
  let simulatedSavings = 0;

  // collect_percent_overdue: recebe X% do inadimplente
  if (body.collect_percent_overdue != null && body.collect_percent_overdue > 0) {
    const extraCash = overdueTotalBrl * (body.collect_percent_overdue / 100);
    newBalance += extraCash;
  }

  // close_deal_ids: fecha deals (simplified)
  if (body.close_deal_ids && body.close_deal_ids.length > 0) {
    newPipelineWon = pipelineWeightedBrl * 0.15 * body.close_deal_ids.length;
  }

  // cut_cost_pct: corta X% dos custos
  let newPayables = payables30dBrl;
  if (body.cut_cost_pct != null && body.cut_cost_pct > 0) {
    newPayables = payables30dBrl * (1 - body.cut_cost_pct / 100);
    simulatedSavings = payables30dBrl - newPayables;
  }

  const newBalance30d = newBalance + newPipelineWon + simulatedSavings;

  return jsonResponse({
    new_balance_30d: Math.round(newBalance30d * 100) / 100,
    new_pipeline_won: Math.round(newPipelineWon * 100) / 100,
    new_cash_projection: snapshot.cash_projection_90d ?? [],
    simulated_savings: Math.round(simulatedSavings * 100) / 100,
  });
});
