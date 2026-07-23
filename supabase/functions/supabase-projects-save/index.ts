/**
 * POST /supabase-projects-save
 * Body: { id?, name, project_url, service_role_key?, active, description? }
 * Em update sem service_role_key, mantém a key existente.
 * Auth: JWT Supabase.
 */
import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/auth.ts";
import { encryptVault } from "../_shared/vault.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

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

  let body: {
    id?: string;
    name?: string;
    project_url?: string;
    service_role_key?: string;
    active?: boolean;
    description?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  const name = (body.name ?? "").trim();
  const project_url = (body.project_url ?? "").trim();
  const description = body.description?.toString().trim() || null;
  const active = body.active !== false;

  if (!name) return errorResponse("Nome obrigatório", 400);
  if (!URL_RE.test(project_url)) {
    return errorResponse("project_url inválida (esperado https://<sub>.supabase.co)", 400);
  }

  const supabase = adminClient();

  // Update existente
  if (body.id) {
    const update: Record<string, unknown> = {
      name,
      project_url,
      active,
      description,
      updated_at: new Date().toISOString(),
    };
    if (body.service_role_key && body.service_role_key.trim()) {
      try {
        update.service_role_key_encrypted = await encryptVault(body.service_role_key.trim());
      } catch (e) {
        return errorResponse(`Erro ao encriptar key: ${(e as Error).message}`, 500);
      }
    }
    const { data, error } = await supabase
      .from("supabase_projects")
      .update(update)
      .eq("id", body.id)
      .select("id")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        return errorResponse("Já existe um projeto com essa URL", 409);
      }
      return errorResponse(`Erro ao atualizar: ${error.message}`, 500);
    }
    if (!data) return errorResponse("Projeto não encontrado", 404);
    return jsonResponse({ id: data.id });
  }

  // Insert novo
  if (!body.service_role_key || !body.service_role_key.trim()) {
    return errorResponse("service_role_key obrigatória ao criar", 400);
  }
  let encrypted: string;
  try {
    encrypted = await encryptVault(body.service_role_key.trim());
  } catch (e) {
    return errorResponse(`Erro ao encriptar key: ${(e as Error).message}`, 500);
  }

  const { data, error } = await supabase
    .from("supabase_projects")
    .insert({
      name,
      project_url,
      active,
      description,
      service_role_key_encrypted: encrypted,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return errorResponse("Já existe um projeto com essa URL", 409);
    }
    return errorResponse(`Erro ao criar: ${error.message}`, 500);
  }
  return jsonResponse({ id: data.id });
});
