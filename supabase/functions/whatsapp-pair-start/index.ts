/**
 * POST /whatsapp-pair-start
 * Dispara ADMIN_ACTION whatsapp_pair_new na VPS via hooks/agent.
 * Auth: JWT Supabase. verify_jwt=true.
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse("Authorization obrigatório", 401);

  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, anonKey!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: uErr } = await supabaseUser.auth.getUser();
  if (uErr || !user) return errorResponse("JWT inválido", 401);

  let body: { instance_name?: string };
  try { body = await req.json(); } catch { return errorResponse("Body inválido", 400); }

  const instanceName = String(body.instance_name ?? "").trim();
  if (!instanceName || !/^[a-zA-Z0-9_-]{1,64}$/.test(instanceName)) {
    return errorResponse("instance_name inválido (alnum, _, -, max 64)", 400);
  }

  // Descobre HOOKS_URL/TOKEN: env primeiro, fallback pra instances mais recente fresh
  let hooksUrl = Deno.env.get("HOOKS_URL") ?? "";
  let hooksToken = Deno.env.get("HOOKS_TOKEN") ?? "";

  if (!hooksUrl || !hooksToken) {
    const supabase = adminClient();
    const { data: vps } = await supabase.from("instances")
      .select("ingress_url, hooks_token, last_heartbeat")
      .not("ingress_url", "is", null).not("hooks_token", "is", null)
      .order("last_heartbeat", { ascending: false, nullsFirst: false })
      .limit(1).maybeSingle();
    const lastHb = vps?.last_heartbeat ? new Date(vps.last_heartbeat).getTime() : 0;
    if (!vps?.ingress_url || !vps?.hooks_token || Date.now() - lastHb > 5 * 60 * 1000) {
      return errorResponse("Nenhuma VPS ativa com heartbeat recente", 502);
    }
    hooksUrl = vps.ingress_url;
    hooksToken = vps.hooks_token;
  }

  const endpoint = hooksUrl.replace(/\/+$/, "") + "/hooks/agent";

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${hooksToken}`,
      },
      body: JSON.stringify({
        message: `[ADMIN_ACTION] whatsapp_pair_new --instance ${instanceName}`,
        source: "panel",
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(JSON.stringify({ ok: false, error: `Hooks ${resp.status}: ${txt.slice(0, 200)}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return jsonResponse({
    ok: true,
    instance_name: instanceName,
    polling_field: "qr_code_b64",
    polling_table: "whatsapp_instances",
    message: "Pareamento iniciado. Aguarde o QR aparecer (~5-15s).",
  });
});
