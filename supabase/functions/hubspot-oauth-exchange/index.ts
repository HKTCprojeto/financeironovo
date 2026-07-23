/**
 * POST /hubspot-oauth-exchange
 * Troca authorization code do HubSpot por access_token + refresh_token e
 * persiste em integration_credentials (skill_name=hubspot) encriptado.
 *
 * Body: { client_id, client_secret, code, redirect_uri }
 * Auth: JWT Supabase do dono logado.
 */

import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import { encryptVault } from "../_shared/vault.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Authorization header obrigatório", 401);
  }

  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) return errorResponse("Configuração do painel incompleta", 500);

  const supaUser = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await supaUser.auth.getUser();
  if (userErr || !user) return errorResponse("JWT inválido ou expirado", 401);

  let body: { client_id?: string; client_secret?: string; code?: string; redirect_uri?: string };
  try { body = await req.json(); } catch { return errorResponse("Body JSON inválido", 400); }

  if (!body.client_id) return errorResponse("client_id obrigatório", 400);
  if (!body.client_secret) return errorResponse("client_secret obrigatório", 400);
  if (!body.code) return errorResponse("code obrigatório", 400);
  if (!body.redirect_uri) return errorResponse("redirect_uri obrigatório", 400);

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: body.client_id,
    client_secret: body.client_secret,
    redirect_uri: body.redirect_uri,
    code: body.code,
  });

  let resp: Response;
  let respText: string;
  try {
    resp = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(20_000),
    });
    respText = await resp.text();
  } catch (err) {
    return errorResponse(`Falha ao contatar HubSpot: ${String(err)}`, 502);
  }

  if (!resp.ok) {
    return errorResponse(`HubSpot retornou ${resp.status}: ${respText}`, 502);
  }

  let tokens: { access_token?: string; refresh_token?: string; expires_in?: number };
  try { tokens = JSON.parse(respText); } catch { return errorResponse("Resposta do HubSpot não é JSON", 502); }

  if (!tokens.access_token || !tokens.refresh_token) {
    return errorResponse("HubSpot não retornou tokens", 502);
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  const credentials = {
    HUBSPOT_OAUTH_CLIENT_ID: body.client_id,
    HUBSPOT_OAUTH_CLIENT_SECRET: body.client_secret,
    HUBSPOT_OAUTH_ACCESS_TOKEN: tokens.access_token,
    HUBSPOT_OAUTH_REFRESH_TOKEN: tokens.refresh_token,
    HUBSPOT_OAUTH_EXPIRES_AT: expiresAt ?? "",
  };

  let encrypted: string;
  try {
    encrypted = await encryptVault(JSON.stringify(credentials));
  } catch (e) {
    return errorResponse(`Erro ao encriptar: ${(e as Error).message}`, 500);
  }

  const supabase = adminClient();
  const { error: upErr } = await supabase
    .from("integration_credentials")
    .upsert(
      {
        skill_name: "hubspot",
        credentials_encrypted: encrypted,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "skill_name" },
    );
  if (upErr) return errorResponse(`Erro ao salvar credenciais: ${upErr.message}`, 500);

  await supabase.from("audit_log").insert({
    actor_user_id: user.id,
    action: "hubspot_oauth_exchange",
    payload: { expires_at: expiresAt },
  });

  return jsonResponse({ ok: true, expires_at: expiresAt });
});
