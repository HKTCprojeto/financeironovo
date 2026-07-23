/**
 * POST /contaazul-push-tokens
 * Empurra os tokens ContaAzul pra VPS (escreve em ~/.agente-cfo/.env via OpenClaw).
 * Atualiza instances.connected_integrations.contaazul.
 *
 * Body: { instance_id, access_token, refresh_token, expires_in, client_id, client_secret }
 * Auth: JWT Supabase do dono logado.
 */

import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
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

  let body: {
    instance_id?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    client_id?: string;
    client_secret?: string;
  };
  try { body = await req.json(); } catch { return errorResponse("Body JSON inválido", 400); }

  if (!body.instance_id) return errorResponse("instance_id obrigatório", 400);
  if (!body.access_token) return errorResponse("access_token obrigatório", 400);
  if (!body.refresh_token) return errorResponse("refresh_token obrigatório", 400);
  if (!body.client_id) return errorResponse("client_id obrigatório", 400);
  if (!body.client_secret) return errorResponse("client_secret obrigatório", 400);

  const supabase = adminClient();
  const { data: instance } = await supabase
    .from("instances")
    .select("id, ingress_url, hooks_token, connected_integrations")
    .eq("id", body.instance_id)
    .maybeSingle();

  if (!instance) return errorResponse("instance_id não encontrado", 404);
  if (!instance.ingress_url) return errorResponse("Instância sem ingress_url", 422);
  if (!instance.hooks_token) return errorResponse("Instância sem hooks_token", 422);

  const expiresAt = body.expires_in
    ? new Date(Date.now() + body.expires_in * 1000).toISOString()
    : null;

  const command = [
    "Execute em sequência:",
    `1) mkdir -p ~/.agente-cfo`,
    `2) Atualize ~/.agente-cfo/.env definindo (sobrescreva se já existir):`,
    `CONTAAZUL_CLIENT_ID=${body.client_id}`,
    `CONTAAZUL_CLIENT_SECRET=${body.client_secret}`,
    `CONTAAZUL_ACCESS_TOKEN=${body.access_token}`,
    `CONTAAZUL_REFRESH_TOKEN=${body.refresh_token}`,
    `CONTAAZUL_TOKEN_EXPIRES_AT=${expiresAt ?? ""}`,
    `3) chmod 600 ~/.agente-cfo/.env`,
    `4) openclaw plugins reload agente-cfo`,
  ].join("\n");

  let clientResp: Response;
  let clientBody: string;
  try {
    clientResp = await fetch(`${instance.ingress_url}/hooks/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${instance.hooks_token}`,
      },
      body: JSON.stringify({
        message: command,
        name: "PainelCFO",
        wakeMode: "now",
        deliver: false,
        timeoutSeconds: 60,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    clientBody = await clientResp.text();
  } catch (err) {
    await supabase.from("audit_log").insert({
      actor_user_id: user.id,
      action: "contaazul_push_tokens_failed",
      payload: { instance_id: body.instance_id, error: String(err) },
    });
    return errorResponse(`Falha ao contatar a instância: ${String(err)}`, 502);
  }

  if (!clientResp.ok) {
    await supabase.from("audit_log").insert({
      actor_user_id: user.id,
      action: "contaazul_push_tokens_failed",
      payload: { instance_id: body.instance_id, status: clientResp.status, body: clientBody },
    });
    return errorResponse(`Cliente retornou ${clientResp.status}: ${clientBody}`, 502);
  }

  const current = (instance.connected_integrations ?? {}) as Record<string, unknown>;
  const updated = {
    ...current,
    contaazul: {
      connected_at: new Date().toISOString(),
      expires_at: expiresAt,
    },
  };
  await supabase
    .from("instances")
    .update({ connected_integrations: updated })
    .eq("id", body.instance_id);

  await supabase.from("audit_log").insert({
    actor_user_id: user.id,
    action: "contaazul_push_tokens",
    payload: { instance_id: body.instance_id, expires_at: expiresAt },
  });

  return jsonResponse({ ok: true, openclaw_response: clientBody });
});
