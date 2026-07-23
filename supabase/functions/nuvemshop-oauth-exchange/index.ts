/**
 * POST /nuvemshop-oauth-exchange
 * Troca authorization code do Nuvemshop por access_token.
 * Nuvemshop não usa refresh_token — access_token não expira.
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

  let body: { code?: string; client_id?: string; client_secret?: string };
  try { body = await req.json(); } catch { return errorResponse("Body JSON inválido", 400); }

  if (!body.code || !body.client_id || !body.client_secret) {
    return errorResponse("code/client_id/client_secret obrigatórios", 400);
  }

  const form = new URLSearchParams({
    client_id: body.client_id,
    client_secret: body.client_secret,
    grant_type: "authorization_code",
    code: body.code,
  });

  let resp: Response;
  let respText: string;
  try {
    resp = await fetch("https://www.nuvemshop.com.br/apps/authorize/token", {
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
    return errorResponse(`Falha ao contatar Nuvemshop: ${String(err)}`, 502);
  }

  if (!resp.ok) return errorResponse(`Nuvemshop retornou ${resp.status}: ${respText}`, 502);

  let tokens: { access_token?: string; user_id?: number; scope?: string };
  try { tokens = JSON.parse(respText); } catch { return errorResponse("Resposta do Nuvemshop não é JSON", 502); }

  if (!tokens.access_token) return errorResponse("Nuvemshop não retornou access_token", 502);

  return jsonResponse(tokens);
});
