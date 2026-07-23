/**
 * GET /supabase-projects-list
 * Lista projetos Supabase conectados (sem expor a key encriptada).
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Authorization header obrigatório", 401);
  }

  const anonKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) return errorResponse("Configuração do painel incompleta", 500);

  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) return errorResponse("JWT inválido ou expirado", 401);

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("supabase_projects")
    .select(
      "id, name, project_url, active, description, last_test_at, last_test_status, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) return errorResponse(`Erro ao listar projetos: ${error.message}`, 500);
  return jsonResponse(data ?? []);
});
