/**
 * POST /push-command
 * Envia comando do painel para a instância via Cloudflare Tunnel.
 * Auth: JWT Supabase do dono logado no front Lovable.
 *
 * Body: { instance_id, command }
 * Retorna: { ok: true, openclaw_response }
 */

import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // Auth: JWT do dono (Supabase Auth padrão)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Authorization header obrigatório", 401);
  }

  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) {
    console.error("Missing SUPABASE_PUBLISHABLE_KEY/SUPABASE_ANON_KEY env");
    return errorResponse("Configuracao do painel incompleta", 500);
  }

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    anonKey,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return errorResponse("JWT inválido ou expirado", 401);
  }

  let body: { instance_id?: string; command?: string };

  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  if (!body.instance_id) return errorResponse("instance_id obrigatório", 400);
  if (!body.command)     return errorResponse("command obrigatório", 400);

  const supabase = adminClient();

  const { data: instance } = await supabase
    .from("instances")
    .select("id, ingress_url, hooks_token, status")
    .eq("id", body.instance_id)
    .maybeSingle();

  if (!instance) {
    return errorResponse("instance_id não encontrado", 404);
  }

  if (!instance.ingress_url) {
    return errorResponse("Instância sem ingress_url configurado", 422);
  }

  if (!instance.hooks_token) {
    return errorResponse(
      "Instância sem hooks_token — execute setup.sh novamente na VPS",
      422,
    );
  }

  // POST para o OpenClaw da VPS via Cloudflare Tunnel
  let clientResponse: Response;
  let clientBody: string;

  try {
    clientResponse = await fetch(`${instance.ingress_url}/hooks/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${instance.hooks_token}`,
      },
      body: JSON.stringify({
        message: body.command,
        name: "PainelCFO",
        wakeMode: "now",
        deliver: false,
        timeoutSeconds: 60,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    clientBody = await clientResponse.text();
  } catch (err) {
    await supabase.from("audit_log").insert({
      actor_user_id: user.id,
      action: "push_command_failed",
      payload: { instance_id: body.instance_id, command: body.command, error: String(err) },
    });
    await supabase.from("instances").update({ status: "degraded" }).eq("id", body.instance_id);
    return errorResponse(`Falha ao contatar a instância: ${String(err)}`, 502);
  }

  await supabase.from("audit_log").insert({
    actor_user_id: user.id,
    action: "push_command",
    payload: {
      instance_id: body.instance_id,
      command: body.command,
      client_status: clientResponse.status,
    },
  });

  if (!clientResponse.ok) {
    return errorResponse(`Cliente retornou erro ${clientResponse.status}: ${clientBody}`, 502);
  }

  return jsonResponse({ ok: true, openclaw_response: clientBody });
});
