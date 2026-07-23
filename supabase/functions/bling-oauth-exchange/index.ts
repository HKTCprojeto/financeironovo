/**
 * POST /bling-oauth-exchange
 * Troca o authorization code do Bling por access_token + refresh_token.
 * Auth: JWT Supabase do dono logado no painel.
 *
 * Body: { code, client_id, client_secret, redirect_uri }
 * Retorna: { access_token, refresh_token, expires_in, token_type }
 */

import { corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
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

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await supa.auth.getUser();
  if (userErr || !user) return errorResponse("JWT inválido ou expirado", 401);

  let body: { code?: string; client_id?: string; client_secret?: string; redirect_uri?: string };
  try { body = await req.json(); } catch { return errorResponse("Body JSON inválido", 400); }

  if (!body.code) return errorResponse("code obrigatório", 400);
  if (!body.client_id) return errorResponse("client_id obrigatório", 400);
  if (!body.client_secret) return errorResponse("client_secret obrigatório", 400);
  if (!body.redirect_uri) return errorResponse("redirect_uri obrigatório", 400);

  const basic = btoa(`${body.client_id}:${body.client_secret}`);
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: body.code,
  });

  let resp: Response;
  let respText: string;
  try {
    resp = await fetch("https://www.bling.com.br/Api/v3/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${basic}`,
        "Accept": "application/json",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(20_000),
    });
    respText = await resp.text();
  } catch (err) {
    return errorResponse(`Falha ao contatar Bling: ${String(err)}`, 502);
  }

  if (!resp.ok) {
    return errorResponse(`Bling retornou ${resp.status}: ${respText}`, 502);
  }

  let tokens: { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string };
  try { tokens = JSON.parse(respText); } catch { return errorResponse("Resposta do Bling não é JSON", 502); }

  if (!tokens.access_token || !tokens.refresh_token) {
    return errorResponse("Bling não retornou tokens", 502);
  }

  return jsonResponse(tokens);
});
