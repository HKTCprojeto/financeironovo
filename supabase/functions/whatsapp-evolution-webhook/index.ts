/**
 * POST /whatsapp-evolution-webhook?secret=<webhook_secret>
 * Recebe eventos da Evolution API v2 (MESSAGES_UPSERT) e encaminha pra incoming-message.
 * verify_jwt=false. Aceita ?secret= ou ?apikey= ou header apikey.
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";

type EvolutionEvent = {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      imageMessage?: { caption?: string };
    };
    pushName?: string;
  };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const url = new URL(req.url);
  const provided =
    url.searchParams.get("secret") ||
    url.searchParams.get("apikey") ||
    req.headers.get("apikey") ||
    "";

  const supabase = adminClient();
  const { data: cfg } = await supabase.from("evolution_config")
    .select("webhook_secret, active").limit(1).maybeSingle();
  if (!cfg || !cfg.active) return errorResponse("Evolution não configurada", 503);
  if (!provided || cfg.webhook_secret !== provided) return errorResponse("Invalid secret", 401);

  let body: EvolutionEvent;
  try { body = await req.json(); } catch { return errorResponse("Body inválido", 400); }

  const evt = String(body.event ?? "").toLowerCase().replace(/_/g, ".");
  if (evt !== "messages.upsert") {
    return jsonResponse({ ok: true, ignored: `event=${body.event ?? "none"}` });
  }

  const instance = String(body.instance ?? "");
  const remoteJid = String(body.data?.key?.remoteJid ?? "");
  if (!instance || !remoteJid) return jsonResponse({ ok: true, ignored: "missing fields" });
  if (body.data?.key?.fromMe === true) return jsonResponse({ ok: true, ignored: "fromMe" });
  if (remoteJid.endsWith("@g.us")) return jsonResponse({ ok: true, ignored: "group" });

  const text =
    body.data?.message?.conversation ??
    body.data?.message?.extendedTextMessage?.text ??
    body.data?.message?.imageMessage?.caption ??
    "";
  if (!text.trim()) return jsonResponse({ ok: true, ignored: "no text" });

  const phone = remoteJid.split("@")[0];
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/incoming-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
      },
      body: JSON.stringify({
        channel: `whatsapp:${instance}`,
        external_id: phone,
        text: text.trim(),
        secret: cfg.webhook_secret,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("[wa-webhook] forward fail", resp.status, txt);
    }
    return jsonResponse({ ok: true });
  } catch (e) {
    console.error("[wa-webhook] exception", e);
    return jsonResponse({ ok: true, warn: String(e) });
  }
});
