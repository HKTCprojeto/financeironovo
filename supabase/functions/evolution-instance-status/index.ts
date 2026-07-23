/**
 * POST /evolution-instance-status
 * Consulta connectionState da Evolution, atualiza whatsapp_instances e
 * dispara credentials_sync na Lívia quando virar "open" pela 1a vez.
 * Auth: JWT.
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import { decryptVault } from "../_shared/vault.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const INSTANCE_RE = /^[a-zA-Z0-9_-]{1,64}$/;

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
  if (!INSTANCE_RE.test(instanceName)) return errorResponse("instance_name inválido", 400);

  const supabase = adminClient();
  const { data: cfg } = await supabase
    .from("evolution_config")
    .select("base_url, api_key_encrypted, active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!cfg || !cfg.active) return errorResponse("Evolution não configurada", 400);

  let apiKey: string;
  try { apiKey = await decryptVault(cfg.api_key_encrypted); }
  catch (e) { return errorResponse(`Falha decrypt: ${(e as Error).message}`, 500); }

  const baseUrl = cfg.base_url.replace(/\/+$/, "");

  let stateRaw = "close";
  let phone: string | null = null;
  try {
    const r = await fetch(`${baseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`, {
      method: "GET",
      headers: { apikey: apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    const txt = await r.text();
    let j: any = null; try { j = JSON.parse(txt); } catch { j = null; }
    if (!r.ok) {
      return errorResponse(`Evolution ${r.status}: ${txt.slice(0, 200)}`, 502);
    }
    stateRaw = String(j?.instance?.state ?? j?.state ?? "close").toLowerCase();
    phone = j?.instance?.user?.id ?? j?.instance?.owner ?? null;
    if (phone && typeof phone === "string") phone = phone.split("@")[0];
  } catch (e) {
    return errorResponse(`Falha consulta: ${(e as Error).message}`, 502);
  }

  let mapped = "close";
  if (stateRaw === "open") mapped = "open";
  else if (stateRaw === "connecting") mapped = "waiting_scan";

  const { data: row } = await supabase
    .from("whatsapp_instances")
    .select("id, status, metadata")
    .eq("instance_name", instanceName)
    .maybeSingle();

  const meta = (row?.metadata ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {
    status: mapped,
    last_seen: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (phone) update.phone_number = phone;
  if (mapped === "open") update.qr_code_b64 = null;

  // 1ª vez open → empurra creds pra Lívia
  const credsPushed = meta.creds_pushed === true;
  let credsPushedNow = false;
  if (mapped === "open" && !credsPushed) {
    try {
      const { data: vps } = await supabase
        .from("instances")
        .select("id, ingress_url, hooks_token, last_heartbeat")
        .not("ingress_url", "is", null).not("hooks_token", "is", null)
        .order("last_heartbeat", { ascending: false, nullsFirst: false })
        .limit(1).maybeSingle();
      const lastHb = vps?.last_heartbeat ? new Date(vps.last_heartbeat).getTime() : 0;
      if (vps?.ingress_url && vps?.hooks_token && Date.now() - lastHb < 5 * 60 * 1000) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        await fetch(`${supabaseUrl}/functions/v1/push-command`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
          },
          body: JSON.stringify({
            instance_id: vps.id,
            command: "Execute: bash $HOME/.openclaw/workspace/skills/agente-cfo/scripts/credentials_sync.py --once",
          }),
          signal: AbortSignal.timeout(15_000),
        });
        credsPushedNow = true;
      }
    } catch (e) {
      console.warn("[evolution-instance-status] creds push fail:", (e as Error).message);
    }
    update.metadata = { ...meta, creds_pushed: credsPushedNow || credsPushed };
  }

  if (row) {
    await supabase.from("whatsapp_instances").update(update).eq("id", row.id);
  }

  return jsonResponse({ ok: true, state: mapped, phone_number: phone });
});
