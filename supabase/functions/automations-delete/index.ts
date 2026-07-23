/**
 * POST /automations-delete
 * Deleta uma automação e seus runs.
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

  if (req.method !== "POST" && req.method !== "DELETE") {
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

  let body: { automation_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  if (!body.automation_id) {
    return errorResponse("automation_id obrigatório", 400);
  }

  const supabase = adminClient();

  // Verifica existência (single-tenant)
  const { data: existing } = await supabase
    .from("automations")
    .select("id")
    .eq("id", body.automation_id)
    .maybeSingle();

  if (!existing) {
    return errorResponse("Automação não encontrada", 404);
  }

  // Deleta runs primeiro (FK)
  await supabase
    .from("automation_runs")
    .delete()
    .eq("automation_id", body.automation_id);

  // Deleta automação
  const { error } = await supabase
    .from("automations")
    .delete()
    .eq("id", body.automation_id);

  if (error) {
    return errorResponse(`Erro ao deletar: ${error.message}`, 500);
  }

  return new Response(null, { status: 204, headers: corsHeaders });
});
