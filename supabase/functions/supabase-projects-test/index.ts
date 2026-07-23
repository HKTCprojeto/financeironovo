/**
 * POST /supabase-projects-test
 * Body: { id }
 * Testa conexão fazendo GET /rest/v1/ no projeto remoto.
 * Atualiza last_test_at e last_test_status.
 * Auth: JWT Supabase.
 */
import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/auth.ts";
import { decryptVault } from "../_shared/vault.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

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

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }
  if (!body.id) return errorResponse("id obrigatório", 400);

  const supabase = adminClient();
  const { data: project, error: fetchError } = await supabase
    .from("supabase_projects")
    .select("id, project_url, service_role_key_encrypted")
    .eq("id", body.id)
    .maybeSingle();

  if (fetchError) return errorResponse(`Erro ao buscar projeto: ${fetchError.message}`, 500);
  if (!project) return errorResponse("Projeto não encontrado", 404);

  let serviceKey: string;
  try {
    serviceKey = await decryptVault(project.service_role_key_encrypted);
  } catch (e) {
    return errorResponse(`Erro ao descriptografar key: ${(e as Error).message}`, 500);
  }

  let status: "ok" | "invalid_key" | "unreachable" = "unreachable";
  let detail: string | undefined;

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${project.project_url}/rest/v1/`, {
      method: "GET",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      status = "ok";
    } else if (res.status === 401 || res.status === 403) {
      status = "invalid_key";
      detail = `HTTP ${res.status}`;
    } else {
      status = "unreachable";
      detail = `HTTP ${res.status}`;
    }
  } catch (e) {
    status = "unreachable";
    detail = (e as Error).message;
  }

  await supabase
    .from("supabase_projects")
    .update({
      last_test_at: new Date().toISOString(),
      last_test_status: status,
    })
    .eq("id", project.id);

  return jsonResponse({ status, detail });
});
