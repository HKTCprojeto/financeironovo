/**
 * POST /update-proactive-rules
 * Atualiza config de regras proativas em user_onboarding.data.proactive_rules_config
 * e dispara reload na VPS via push-command.
 *
 * Body: { rules: { [name]: { enabled, ... numbers } } }
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const KNOWN_RULES = [
  "overdue_critical","cash_low","concentration","inadimplencia_high",
  "deal_stale","pipeline_drop","erp_api_health","pipeline_health",
];

function validateRules(rules: unknown): { ok: true; value: Record<string, Record<string, number | boolean>> } | { ok: false; error: string } {
  if (!rules || typeof rules !== "object") return { ok: false, error: "rules deve ser objeto" };
  const out: Record<string, Record<string, number | boolean>> = {};
  for (const [k, v] of Object.entries(rules as Record<string, unknown>)) {
    if (!KNOWN_RULES.includes(k)) return { ok: false, error: `regra desconhecida: ${k}` };
    if (!v || typeof v !== "object") return { ok: false, error: `${k}: config inválida` };
    const cfg: Record<string, number | boolean> = {};
    for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
      if (pk === "enabled") {
        if (typeof pv !== "boolean") return { ok: false, error: `${k}.enabled deve ser boolean` };
        cfg.enabled = pv;
      } else {
        if (typeof pv !== "number" || !Number.isFinite(pv) || pv < 0) {
          return { ok: false, error: `${k}.${pk} deve ser número >= 0` };
        }
        cfg[pk] = pv;
      }
    }
    out[k] = cfg;
  }
  return { ok: true, value: out };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse("Authorization obrigatório", 401);

  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) return errorResponse("Configuração incompleta", 500);

  const supaUser = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: uerr } = await supaUser.auth.getUser();
  if (uerr || !user) return errorResponse("JWT inválido", 401);

  let body: { rules?: unknown };
  try { body = await req.json(); } catch { return errorResponse("JSON inválido", 400); }

  const validation = validateRules(body.rules);
  if (!validation.ok) return errorResponse(validation.error, 422);

  const supabase = adminClient();

  // Lê estado atual do onboarding e mescla
  const { data: onb } = await supabase
    .from("user_onboarding")
    .select("data, current_step, completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const prevData = (onb?.data as Record<string, unknown>) ?? {};
  const nextData = { ...prevData, proactive_rules_config: validation.value };

  const { error: upErr } = await supabase
    .from("user_onboarding")
    .upsert({
      user_id: user.id,
      data: nextData,
      current_step: onb?.current_step ?? 1,
      completed_at: onb?.completed_at ?? null,
    }, { onConflict: "user_id" });

  if (upErr) return errorResponse(`Falha ao salvar: ${upErr.message}`, 500);

  // Tenta recarregar na VPS (best-effort)
  let vpsReload: { ok: boolean; detail: string } = { ok: false, detail: "sem instância" };
  const { data: instance } = await supabase
    .from("instances")
    .select("id, ingress_url, hooks_token")
    .limit(1).maybeSingle();

  if (instance?.ingress_url && instance?.hooks_token) {
    try {
      const r = await fetch(`${instance.ingress_url}/hooks/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${instance.hooks_token}`,
        },
        body: JSON.stringify({
          message: "Execute: bash $SKILL_PATH/scripts/reload_proactive_config.sh",
          name: "PainelCFO",
          wakeMode: "now",
          deliver: false,
          timeoutSeconds: 30,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      vpsReload = { ok: r.ok, detail: `status ${r.status}` };
    } catch (err) {
      vpsReload = { ok: false, detail: String(err) };
    }
  }

  await supabase.from("audit_log").insert({
    actor_user_id: user.id,
    action: "update_proactive_rules",
    payload: { rules: validation.value, vps_reload: vpsReload },
  });

  return jsonResponse({ ok: true, vps_reload: vpsReload });
});
