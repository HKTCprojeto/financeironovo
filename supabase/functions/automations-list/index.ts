/**
 * GET /automations-list
 * Lista automações do usuário autenticado com último run de cada.
 * Auth: JWT Supabase.
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

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

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

  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return errorResponse("JWT inválido ou expirado", 401);
  }

  const supabase = adminClient();

  // Busca todas as automações (single-tenant)
  const { data: automations, error: automationsError } = await supabase
    .from("automations")
    .select("*")
    .order("created_at", { ascending: false });

  if (automationsError) {
    return errorResponse(`Erro ao buscar automações: ${automationsError.message}`, 500);
  }

  // Para cada automação, busca o último run
  const runs_by_automation: Record<string, unknown> = {};
  for (const automation of automations || []) {
    const { data: lastRun } = await supabase
      .from("automation_runs")
      .select("id, status, started_at, finished_at, steps, result, error")
      .eq("automation_id", automation.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastRun) runs_by_automation[automation.id] = lastRun;
  }

  return jsonResponse({ automations: automations || [], runs_by_automation });
});
