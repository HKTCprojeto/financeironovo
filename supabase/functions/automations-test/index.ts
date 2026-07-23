/**
 * POST /automations-test
 * Dispara teste de automação via push-command.
 * Auth: JWT Supabase.
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Authorization header obrigatório", 401);
  }

  const anonKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) {
    return errorResponse("Configuração do painel incompleta", 500);
  }

  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return errorResponse("JWT inválido ou expirado", 401);
  }

  let body: { automation_id?: string; trigger_payload?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  if (!body.automation_id) {
    return errorResponse("automation_id obrigatório", 400);
  }

  const supabase = adminClient();

  // Verifica existência (single-tenant)
  const { data: automation } = await supabase
    .from("automations")
    .select("id, name")
    .eq("id", body.automation_id)
    .maybeSingle();

  if (!automation) {
    return errorResponse("Automação não encontrada", 404);
  }

  // Busca instância do user para push-command
  const { data: instance } = await supabase
    .from("instances")
    .select("id, ingress_url, hooks_token")
    .limit(1)
    .maybeSingle();

  if (!instance?.ingress_url || !instance?.hooks_token) {
    return errorResponse("Instância não encontrada ou sem ingress_url", 422);
  }

  // Envia comando de teste via hooks/agent
  try {
    const resp = await fetch(`${instance.ingress_url}/hooks/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${instance.hooks_token}`,
      },
      body: JSON.stringify({
        message: `Execute automation test: ${body.automation_id}`,
        name: "AutomationTest",
        wakeMode: "now",
        deliver: false,
        timeoutSeconds: 60,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return errorResponse(`Erro ao contatar VPS: ${errText}`, 502);
    }
  } catch (err) {
    return errorResponse(`Falha ao contatar a instância: ${String(err)}`, 502);
  }

  return jsonResponse({ ok: true, message: "Teste iniciado" });
});
