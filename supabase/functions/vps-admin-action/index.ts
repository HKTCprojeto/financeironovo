/**
 * POST /vps-admin-action
 * Auth: JWT Supabase. Dispara ação administrativa no agente da VPS via /hooks/agent.
 * Marcos executa admin_action.sh e responde no chat_messages com runId.
 *
 * Body: { action: string, params?: Record<string, unknown> }
 * Retorna: { run_id, thread_id }
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ACTIONS = new Set([
  "systemctl_restart", "systemctl_status", "service_logs",
  "openclaw_config_get", "openclaw_config_set", "openclaw_config_unset",
  "openclaw_plugins_install", "openclaw_plugins_list",
  "mcp_sync_now",
  "whatsapp_pair_new", "whatsapp_pair_status",
  "openclaw_status", "openclaw_health", "openclaw_doctor",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse("Auth obrigatório", 401);

  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) return errorResponse("Config incompleta", 500);

  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !user) return errorResponse("JWT inválido", 401);

  let body: { action?: string; params?: Record<string, unknown> };
  try { body = await req.json(); } catch { return errorResponse("Body inválido", 400); }

  const action = String(body.action ?? "").trim();
  const params = body.params ?? {};
  if (!action) return errorResponse("action obrigatória", 400);
  if (!ALLOWED_ACTIONS.has(action)) return errorResponse(`Action não permitida: ${action}`, 400);

  const supabase = adminClient();
  const { data: vps } = await supabase
    .from("instances")
    .select("id, ingress_url, hooks_token, last_heartbeat")
    .not("ingress_url", "is", null)
    .not("hooks_token", "is", null)
    .order("last_heartbeat", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const lastHbMs = vps?.last_heartbeat ? new Date(vps.last_heartbeat).getTime() : 0;
  const isFresh = Date.now() - lastHbMs < 5 * 60 * 1000;
  if (!vps?.ingress_url || !vps?.hooks_token || !isFresh) {
    return errorResponse("VPS offline — sem heartbeat recente", 503);
  }

  const threadId = `admin:${user.id}`;
  const runId = `adm_${Date.now()}_${action}`;

  // Placeholder no chat de admin
  await supabase.from("chat_messages").insert({
    thread_id: threadId,
    role: "marcos",
    content: "",
    status: "pending",
    channel: "admin",
    metadata: { runId, action, params },
  });

  const payloadJson = JSON.stringify({ action, params });
  // escape pra single-quoted shell string
  const safeJson = payloadJson.replace(/'/g, `'\\''`);
  const promptMsg = `[ADMIN_ACTION]
echo '${safeJson}' | bash $HOME/.openclaw/workspace/skills/agente-cfo/scripts/admin_action.sh

Reporte o output completo (stdout + stderr) via:
  bash $HOME/.openclaw/workspace/skills/agente-cfo/scripts/panel_reply.sh "${threadId}" "${runId}" "<output completo>" "sent"

Não resuma — cole o output exato dentro de aspas (escape \\" se necessário).`;

  try {
    const resp = await fetch(`${vps.ingress_url}/hooks/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${vps.hooks_token}`,
      },
      body: JSON.stringify({
        message: promptMsg,
        name: "admin_action",
        wakeMode: "now",
        deliver: false,
        timeoutSeconds: 120,
        metadata: { thread_id: threadId, run_id: runId, action },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`hook ${resp.status}: ${t}`);
    }
  } catch (err) {
    return errorResponse(`Falha ao contatar VPS: ${String(err)}`, 503);
  }

  return jsonResponse({ ok: true, run_id: runId, thread_id: threadId });
});
