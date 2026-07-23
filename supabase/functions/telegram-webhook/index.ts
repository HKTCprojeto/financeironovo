/**
 * POST /telegram-webhook?secret=<webhook_secret>
 * Recebe updates do Telegram Bot API, valida secret e repassa pra incoming-message.
 * verify_jwt=false.
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? "";
  if (!secret) return errorResponse("secret obrigatório", 401);

  const supabase = adminClient();
  const { data: bot } = await supabase
    .from("telegram_bots")
    .select("bot_username, webhook_secret, active")
    .eq("webhook_secret", secret)
    .maybeSingle();

  if (!bot || !bot.active) return errorResponse("Invalid secret", 401);

  let update: any;
  try { update = await req.json(); } catch { return errorResponse("Body inválido", 400); }

  const msg = update?.message ?? update?.edited_message;
  if (!msg?.chat?.id || !msg?.text) {
    return jsonResponse({ ok: true, ignored: "no_text" });
  }

  const externalId = String(msg.chat.id);
  const text = String(msg.text).slice(0, 4000);
  const channel = `telegram:${bot.bot_username}`;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const resp = await fetch(`${supabaseUrl}/functions/v1/incoming-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ channel, external_id: externalId, text, secret }),
  });

  const respBody = await resp.text();
  if (!resp.ok) {
    console.error("[telegram-webhook] incoming-message error", resp.status, respBody);
    return jsonResponse({ ok: true, warn: "incoming_failed" });
  }

  return jsonResponse({ ok: true });
});
