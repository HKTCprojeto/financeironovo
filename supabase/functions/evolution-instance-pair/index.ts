/**
 * POST /evolution-instance-pair
 * Cria a instância na Evolution API, garante o webhook e retorna o QR base64.
 * Auth: JWT Supabase. Body: { instance_name }.
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import { decryptVault } from "../_shared/vault.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const INSTANCE_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function pickQr(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, any>;
  const candidates = [
    o.base64,
    o.qrcode?.base64,
    o.qrcode?.code,
    o.qr?.base64,
    o.instance?.qrcode?.base64,
    o.data?.qrcode?.base64,
  ].filter(Boolean);
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 20) return c;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse("Authorization obrigatório", 401);

  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) return errorResponse("Config painel incompleta", 500);
  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: uErr } = await supabaseUser.auth.getUser();
  if (uErr || !user) return errorResponse("JWT inválido", 401);

  let body: { instance_name?: string };
  try { body = await req.json(); } catch { return errorResponse("Body inválido", 400); }

  const instanceName = String(body.instance_name ?? "").trim();
  if (!INSTANCE_RE.test(instanceName)) {
    return errorResponse("instance_name inválido (a-z, 0-9, _, -, max 64)", 400);
  }

  const supabase = adminClient();
  const { data: cfg } = await supabase
    .from("evolution_config")
    .select("id, base_url, api_key_encrypted, webhook_secret, active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!cfg || !cfg.active) return errorResponse("Evolution não configurada/ativa", 400);

  let apiKey: string;
  try { apiKey = await decryptVault(cfg.api_key_encrypted); }
  catch (e) { return errorResponse(`Falha ao decriptar api_key: ${(e as Error).message}`, 500); }

  const baseUrl = cfg.base_url.replace(/\/+$/, "");
  const webhookSecret = cfg.webhook_secret ??
    crypto.randomUUID().replace(/-/g, "").slice(0, 32);

  if (!cfg.webhook_secret) {
    await supabase.from("evolution_config").update({ webhook_secret: webhookSecret }).eq("id", cfg.id);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!.replace(/\/+$/, "");
  const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-evolution-webhook?secret=${encodeURIComponent(webhookSecret)}`;

  // 1) Cria instância
  let createJson: any = null;
  try {
    const r = await fetch(`${baseUrl}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const txt = await r.text();
    try { createJson = JSON.parse(txt); } catch { createJson = { raw: txt }; }
    if (!r.ok) {
      const msg = (createJson?.response?.message ?? createJson?.message ?? txt ?? "").toString();
      const already = /already|in use|exist/i.test(msg);
      if (!already) {
        return errorResponse(`Evolution /instance/create ${r.status}: ${msg.slice(0, 300)}`, 502);
      }
    }
  } catch (e) {
    return errorResponse(`Falha ao contatar Evolution: ${(e as Error).message}`, 502);
  }

  // 2) Garante webhook
  try {
    const wbody = {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
      },
    };
    let r = await fetch(`${baseUrl}/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(wbody),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) {
      // Fallback: shape "flat"
      r = await fetch(`${baseUrl}/webhook/set/${encodeURIComponent(instanceName)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({
          enabled: true, url: webhookUrl, byEvents: false, base64: false,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) {
        const txt = await r.text();
        console.warn(`[evolution-instance-pair] webhook/set falhou: ${r.status} ${txt.slice(0, 200)}`);
      }
    }
  } catch (e) {
    console.warn(`[evolution-instance-pair] webhook/set exception: ${(e as Error).message}`);
  }

  // 3) QR
  let qr = pickQr(createJson);
  if (!qr) {
    try {
      const r = await fetch(`${baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, {
        method: "GET",
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(15_000),
      });
      const txt = await r.text();
      let j: any = null; try { j = JSON.parse(txt); } catch { j = null; }
      qr = pickQr(j);
      if (!qr && !r.ok) {
        return errorResponse(`Evolution /instance/connect ${r.status}: ${txt.slice(0, 300)}`, 502);
      }
    } catch (e) {
      return errorResponse(`Falha ao obter QR: ${(e as Error).message}`, 502);
    }
  }

  // Upsert whatsapp_instances
  const { data: existing } = await supabase
    .from("whatsapp_instances")
    .select("id, metadata")
    .eq("instance_name", instanceName)
    .maybeSingle();

  const upsertRow: Record<string, unknown> = {
    instance_name: instanceName,
    display_name: instanceName,
    status: "waiting_scan",
    qr_code_b64: qr ?? null,
    receives_marcos_chat: true,
    updated_at: new Date().toISOString(),
  };
  if (existing) {
    await supabase.from("whatsapp_instances").update(upsertRow).eq("id", existing.id);
  } else {
    await supabase.from("whatsapp_instances").insert(upsertRow);
  }

  return jsonResponse({
    ok: true,
    qr_base64: qr,
    instance_name: instanceName,
    webhook_secret: webhookSecret,
  });
});
