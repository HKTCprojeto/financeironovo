/**
 * GET /supabase-projects-vps-list
 * Auth: X-Panel-Token + X-Hooks-Token (existir em alguma instances row).
 * Retorna lista COMPLETA com keys descriptografadas + slug.
 */
import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
  validatePanelToken,
} from "../_shared/auth.ts";
import { decryptVault } from "../_shared/vault.ts";

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  if (!(await validatePanelToken(req))) return errorResponse("Invalid panel token", 401);

  const hooksToken = req.headers.get("X-Hooks-Token");
  if (!hooksToken) return errorResponse("X-Hooks-Token obrigatório", 401);

  const supabase = adminClient();

  const { data: instance, error: instErr } = await supabase
    .from("instances")
    .select("id")
    .eq("hooks_token", hooksToken)
    .maybeSingle();
  if (instErr) return errorResponse(`Erro ao validar hooks token: ${instErr.message}`, 500);
  if (!instance) return errorResponse("X-Hooks-Token inválido", 401);

  const { data: projects, error } = await supabase
    .from("supabase_projects")
    .select("id, name, project_url, service_role_key_encrypted, active")
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (error) return errorResponse(`Erro ao listar: ${error.message}`, 500);

  const out: Array<{
    id: string;
    name: string;
    slug: string;
    project_url: string;
    service_role_key: string;
    active: boolean;
  }> = [];
  for (const p of projects ?? []) {
    try {
      const key = await decryptVault(p.service_role_key_encrypted);
      out.push({
        id: p.id,
        name: p.name,
        slug: slugify(p.name),
        project_url: p.project_url,
        service_role_key: key,
        active: p.active,
      });
    } catch (e) {
      console.error(`Falha ao decriptar projeto ${p.id}: ${(e as Error).message}`);
    }
  }

  return jsonResponse(out);
});
