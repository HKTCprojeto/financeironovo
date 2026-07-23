/**
 * POST /channel-send
 * Auth: JWT Supabase (verify_jwt=true)
 * Body: { thread_id, channel, external_id, text }
 * Insere msg em chat_messages (role=user) e dispara /hooks/agent na VPS.
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  let body: { thread_id?: string; channel?: string; external_id?: string; text?: string };
  try { body = await req.json(); } catch { return errorResponse("Body inválido", 400); }

  const thread_id = String(body.thread_id ?? "").trim();
  const channel = String(body.channel ?? "").trim();
  const external_id = String(body.external_id ?? "").trim();
  const text = String(body.text ?? "").trim();

  if (!thread_id || !channel || !external_id || !text) {
    return errorResponse("thread_id, channel, external_id e text são obrigatórios", 400);
  }
  if (text.length > 4000) return errorResponse("Mensagem muito longa", 400);

  const supabase = adminClient();

  const { data: userMsg, error: insErr } = await supabase
    .from("chat_messages")
    .insert({ thread_id, role: "user", content: text, status: "sent", channel })
    .select("id")
    .single();
  if (insErr || !userMsg) return errorResponse(insErr?.message ?? "Insert falhou", 500);

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
    await supabase.from("chat_messages")
      .update({ status: "error", metadata: { error: "no_vps_instance" } })
      .eq("id", userMsg.id);
    return jsonResponse({ ok: true, warn: "no_vps", message_id: userMsg.id }, 200);
  }

  const runId = `panel_${Date.now()}_${userMsg.id}`;
  const promptMsg = `[INCOMING_MESSAGE]
Canal: ${channel}
ExternalId: ${external_id}
Text: ${text}
Source: panel_inbox`;

  const { data: marcosMsg } = await supabase.from("chat_messages").insert({
    thread_id, role: "marcos", content: "", status: "pending", channel,
    metadata: { runId, channel, external_id },
  }).select("id").single();

  fetch(`${vps.ingress_url}/hooks/agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${vps.hooks_token}`,
    },
    body: JSON.stringify({
      message: promptMsg,
      name: "panel_inbox_send",
      wakeMode: "now",
      deliver: false,
      timeoutSeconds: 180,
      metadata: { thread_id, run_id: runId, channel, external_id },
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch(async (err) => {
    await supabase.from("chat_messages").update({
      status: "error", metadata: { error: String(err) }
    }).eq("id", marcosMsg?.id ?? userMsg.id);
  });

  return jsonResponse({ ok: true, message_id: userMsg.id, run_id: runId }, 201);
});
