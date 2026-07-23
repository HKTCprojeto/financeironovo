/**
 * POST /hubspot-oauth-refresh-tokens
 * VPS chama quando faz refresh OAuth pra atualizar os tokens encriptados.
 * Auth: X-Panel-Token + X-Hooks-Token (válido em instances).
 *
 * Body: { access_token, refresh_token, expires_at }
 */
import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
  validatePanelToken,
} from "../_shared/auth.ts";
import { encryptVault, decryptVault } from "../_shared/vault.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  if (!(await validatePanelToken(req))) return errorResponse("Invalid panel token", 401);
  const hooksToken = req.headers.get("X-Hooks-Token");
  if (!hooksToken) return errorResponse("X-Hooks-Token obrigatório", 401);

  const supabase = adminClient();
  const { data: instance } = await supabase
    .from("instances")
    .select("id")
    .eq("hooks_token", hooksToken)
    .maybeSingle();
  if (!instance) return errorResponse("X-Hooks-Token inválido", 401);

  let body: { access_token?: string; refresh_token?: string; expires_at?: string };
  try { body = await req.json(); } catch { return errorResponse("Body JSON inválido", 400); }

  if (!body.access_token) return errorResponse("access_token obrigatório", 400);
  if (!body.refresh_token) return errorResponse("refresh_token obrigatório", 400);

  const { data: existing, error: selErr } = await supabase
    .from("integration_credentials")
    .select("id, credentials_encrypted")
    .eq("skill_name", "hubspot")
    .maybeSingle();
  if (selErr) return errorResponse(`Erro: ${selErr.message}`, 500);
  if (!existing) return errorResponse("HubSpot não configurado ainda", 404);

  let merged: Record<string, string> = {};
  try {
    merged = JSON.parse(await decryptVault(existing.credentials_encrypted));
  } catch (e) {
    return errorResponse(`Erro ao decriptar atual: ${(e as Error).message}`, 500);
  }

  merged.HUBSPOT_OAUTH_ACCESS_TOKEN = body.access_token;
  merged.HUBSPOT_OAUTH_REFRESH_TOKEN = body.refresh_token;
  merged.HUBSPOT_OAUTH_EXPIRES_AT = body.expires_at ?? "";

  let encrypted: string;
  try {
    encrypted = await encryptVault(JSON.stringify(merged));
  } catch (e) {
    return errorResponse(`Erro ao encriptar: ${(e as Error).message}`, 500);
  }

  const { error: upErr } = await supabase
    .from("integration_credentials")
    .update({
      credentials_encrypted: encrypted,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);
  if (upErr) return errorResponse(`Erro ao atualizar: ${upErr.message}`, 500);

  return jsonResponse({ ok: true });
});
