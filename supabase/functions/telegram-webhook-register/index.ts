/**
 * POST /telegram-webhook-register
 * Valida token, registra webhook na Bot API e persiste em telegram_bots.
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

  let body: { bot_token?: string; bot_name?: string };
  try { body = await req.json(); } catch { return errorResponse("Body inválido", 400); }

  const token = String(body.bot_token ?? "").trim();
  if (!/^[0-9]+:[A-Za-z0-9_-]+$/.test(token)) {
    return errorResponse("Bot token inválido", 400);
  }

  // getMe
  const meResp = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const me = await meResp.json().catch(() => ({}));
  if (!me?.ok) {
    return new Response(JSON.stringify({ ok: false, error: `Token inválido: ${me?.description ?? "getMe falhou"}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const botUsername: string = me.result.username;
  const botName: string = String(body.bot_name ?? "").trim() || me.result.first_name || botUsername;

  const webhookSecret = crypto.randomUUID();
  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-webhook?secret=${webhookSecret}`;

  const setResp = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message"] }),
  });
  const setJson = await setResp.json().catch(() => ({}));
  if (!setJson?.ok) {
    return new Response(JSON.stringify({ ok: false, error: `setWebhook falhou: ${setJson?.description ?? "erro desconhecido"}` }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = adminClient();
  const { error: upErr } = await supabase.from("telegram_bots").upsert({
    bot_token_encrypted: token,
    bot_username: botUsername,
    bot_name: botName,
    webhook_secret: webhookSecret,
    active: true,
    receives_marcos_chat: false,
  }, { onConflict: "bot_username" });

  if (upErr) {
    return errorResponse(`DB error: ${upErr.message}`, 500);
  }

  return jsonResponse({ ok: true, bot_username: botUsername, bot_name: botName, webhook_url: webhookUrl });
});
