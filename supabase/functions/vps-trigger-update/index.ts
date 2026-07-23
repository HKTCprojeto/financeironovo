/**
 * POST /vps-trigger-update
 * Dispara Lívia (via /hooks/agent na VPS) pra rodar self_update.sh.
 * Auth: JWT Supabase.
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROMPT = `Rode agora o comando bash:

bash $HOME/.openclaw/workspace/skills/agente-cfo/scripts/self_update.sh

Quando terminar (sucesso ou erro), responda no painel via:

bash $HOME/.openclaw/workspace/skills/agente-cfo/scripts/panel_reply.sh "Atualização concluída: <resumo do resultado>"

Não faça mais nada além disso.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse("Authorization obrigatório", 401);

  const anonKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) return errorResponse("Configuração incompleta", 500);

  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) return errorResponse("JWT inválido", 401);

  const supabase = adminClient();

  // Pega instance ativa mais recente
  const { data: instance, error: instErr } = await supabase
    .from("instances")
    .select("id, ingress_url, hooks_token")
    .order("last_heartbeat", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (instErr) return errorResponse(`Erro ao buscar instance: ${instErr.message}`, 500);
  if (!instance) return errorResponse("VPS não conectada — rode setup.sh primeiro", 422);
  if (!instance.ingress_url || !instance.hooks_token) {
    return errorResponse("VPS sem ingress_url/hooks_token — rode setup.sh novamente", 422);
  }

  let resp: Response;
  let txt: string;
  try {
    resp = await fetch(`${instance.ingress_url}/hooks/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${instance.hooks_token}`,
      },
      body: JSON.stringify({
        message: PROMPT,
        name: "PainelCFO",
        wakeMode: "now",
        deliver: false,
        timeoutSeconds: 60,
      }),
      signal: AbortSignal.timeout(30000),
    });
    txt = await resp.text();
  } catch (e) {
    await supabase.from("audit_log").insert({
      actor_user_id: user.id,
      action: "vps_trigger_update_failed",
      payload: { error: String(e) },
    });
    return errorResponse(`Falha ao contatar VPS: ${String(e)}`, 502);
  }

  await supabase.from("audit_log").insert({
    actor_user_id: user.id,
    action: "vps_trigger_update",
    payload: { instance_id: instance.id, status: resp.status },
  });

  if (!resp.ok) return errorResponse(`VPS retornou ${resp.status}: ${txt}`, 502);

  let runId: string | null = null;
  try {
    const j = JSON.parse(txt);
    runId = j.run_id ?? j.runId ?? null;
  } catch { /* noop */ }

  return jsonResponse({ ok: true, run_id: runId });
});
