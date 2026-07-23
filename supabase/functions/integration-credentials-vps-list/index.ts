/**
 * GET /integration-credentials-vps-list
 * Auth: X-Panel-Token + X-Hooks-Token (válido em instances).
 * Retorna [{ skill_name, credentials, active }] descriptografado.
 */
import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
  validatePanelToken,
} from "../_shared/auth.ts";
import { decryptVault } from "../_shared/vault.ts";

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
  if (instErr) return errorResponse(`Erro: ${instErr.message}`, 500);
  if (!instance) return errorResponse("X-Hooks-Token inválido", 401);

  const { data: rows, error } = await supabase
    .from("integration_credentials")
    .select("skill_name, credentials_encrypted, active")
    .eq("active", true);
  if (error) return errorResponse(`Erro: ${error.message}`, 500);

  const out: Array<{ skill_name: string; credentials: Record<string, string>; active: boolean }> = [];
  for (const r of rows ?? []) {
    try {
      const creds = JSON.parse(await decryptVault(r.credentials_encrypted));
      out.push({ skill_name: r.skill_name, credentials: creds, active: r.active });
    } catch (e) {
      console.error(`decrypt fail ${r.skill_name}: ${(e as Error).message}`);
    }
  }
  return jsonResponse(out);
});
