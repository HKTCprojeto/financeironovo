/**
 * GET/POST /reports-cash-projection
 * Lê projeção de caixa do snapshot mais recente pushado pela VPS.
 * Auth: JWT Supabase do dono logado.
 */

import {
  adminClient,
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

  const cashProjection =
    (latest?.data as Record<string, unknown> | null)?.reports?.cash_projection ?? {};

  return jsonResponse({ ok: true, data: cashProjection });
});
