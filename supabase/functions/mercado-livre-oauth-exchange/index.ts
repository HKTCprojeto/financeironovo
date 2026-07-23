/**
 * POST /mercado-livre-oauth-exchange
 * Troca authorization code do Mercado Livre por access_token + refresh_token.
 */
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse("Authorization header obrigatório", 401);

  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) return errorResponse("Configuração do painel incompleta", 500);

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await supa.auth.getUser();
  if (userErr || !user) return errorResponse("JWT inválido ou expirado", 401);

  let body: { code?: string; client_id?: string; client_secret?: string; redirect_uri?: string };
  try { body = await req.json(); } catch { return errorResponse("Body JSON inválido", 400); }

  if (!body.code || !body.client_id || !body.client_secret || !body.redirect_uri) {
    return errorResponse("code/client_id/client_secret/redirect_uri obrigatórios", 400);
  }

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: body.client_id,
    client_secret: body.client_secret,
    code: body.code,
    redirect_uri: body.redirect_uri,
  });

  let resp: Response;
  let respText: string;
  try {
    resp = await fetch("https://api.mercadolibre.com/oauth/token", {
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
    return errorResponse(`Falha ao contatar Mercado Livre: ${String(err)}`, 502);
  }

  if (!resp.ok) return errorResponse(`Mercado Livre retornou ${resp.status}: ${respText}`, 502);

  let tokens: { access_token?: string; refresh_token?: string; expires_in?: number; user_id?: number };
  try { tokens = JSON.parse(respText); } catch { return errorResponse("Resposta do Mercado Livre não é JSON", 502); }

  if (!tokens.access_token) return errorResponse("Mercado Livre não retornou access_token", 502);

  return jsonResponse(tokens);
});
