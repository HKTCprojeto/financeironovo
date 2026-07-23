/**
 * DELETE /supabase-projects-delete?id=<uuid>
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
  if (req.method !== "DELETE") return errorResponse("Method not allowed", 405);

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

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return errorResponse("Parâmetro id obrigatório", 400);

  const supabase = adminClient();
  const { error } = await supabase.from("supabase_projects").delete().eq("id", id);
  if (error) return errorResponse(`Erro ao deletar: ${error.message}`, 500);

  return jsonResponse({ deleted: true });
});
