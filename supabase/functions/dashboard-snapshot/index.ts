/**
 * GET/POST /dashboard-snapshot
 * Lê o snapshot mais recente persistido em dashboard_snapshots (pushado pela VPS)
 * e mescla os lançamentos manuais via chat (cfo_write_events com erp='dashboard_only').
 * Auth: JWT Supabase do dono logado no front Lovable.
 */

import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMPTY_SNAPSHOT = {
  kpis: {
    balance_brl: 0,
    receivables_30d_brl: 0,
    payables_30d_brl: 0,
    pipeline_weighted_brl: 0,
    ecommerce_revenue_month_brl: 0,
    overdue_total_brl: 0,
  },
  by_channel_revenue_30d: [],
  pipeline_by_stage: [],
  cash_projection_90d: [],
  top_debtors: [],
  integrations_health: [],
  empty: true,
};

const OUTFLOW_KEYWORDS = ["payable", "expense", "despesa", "pagar"];
const INFLOW_KEYWORDS = ["receivable", "income", "revenue", "receber", "receita"];

type ManualChat = { inflow_brl: number; outflow_brl: number; count: number };

async function computeManualChat(
  supabase: ReturnType<typeof adminClient>,
): Promise<ManualChat> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("cfo_write_events")
    .select("action, amount")
    .eq("erp", "dashboard_only")
    .eq("status", "success")
    .not("confirmed_at", "is", null)
    .gte("created_at", since);

  const result: ManualChat = { inflow_brl: 0, outflow_brl: 0, count: 0 };
  if (error || !data) return result;

  for (const row of data as Array<{ action: string | null; amount: number | string | null }>) {
    const amt = Number(row.amount ?? 0);
    if (!Number.isFinite(amt) || amt === 0) continue;
    const action = (row.action ?? "").toLowerCase();
    const isOut = OUTFLOW_KEYWORDS.some((k) => action.includes(k));
    const isIn = INFLOW_KEYWORDS.some((k) => action.includes(k));
    if (isOut) {
      result.outflow_brl += Math.abs(amt);
      result.count += 1;
    } else if (isIn) {
      result.inflow_brl += Math.abs(amt);
      result.count += 1;
    }
  }
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── Auth JWT ──────────────────────────────────────────────────────────────
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

  const supabase = adminClient();

  const { data: latest } = await supabase
    .from("dashboard_snapshots")
    .select("data")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const manual_chat = await computeManualChat(supabase);

  const base = latest?.data ?? {
    as_of: new Date().toISOString(),
    ...EMPTY_SNAPSHOT,
  };

  // Merge manual chat writes into KPIs (conciliated: dashboard_only only)
  const kpis = { ...(base.kpis ?? EMPTY_SNAPSHOT.kpis) };
  kpis.payables_30d_brl = Number(kpis.payables_30d_brl ?? 0) + manual_chat.outflow_brl;
  kpis.receivables_30d_brl = Number(kpis.receivables_30d_brl ?? 0) + manual_chat.inflow_brl;

  return jsonResponse({ ...base, kpis, manual_chat });
});
