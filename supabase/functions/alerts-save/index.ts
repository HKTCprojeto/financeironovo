/**
 * POST /alerts-save
 * Body: { id?, name, type, condition, channels: string[], cooldown_min?, active? }
 *
 * type ∈ { cost_anthropic, daemon_down, tool_errors, latency_high }
 * channels ⊆ { panel, whatsapp, telegram }
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";

const VALID_TYPES = new Set(["cost_anthropic", "daemon_down", "tool_errors", "latency_high"]);
const VALID_CHANNELS = new Set(["panel", "whatsapp", "telegram"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: {
    id?: string;
    name?: string;
    type?: string;
    condition?: Record<string, unknown>;
    channels?: string[];
    cooldown_min?: number;
    active?: boolean;
  };
  try { body = await req.json(); } catch { return errorResponse("Body inválido", 400); }

  const name = (body.name ?? "").trim();
  const type = (body.type ?? "").trim();
  const condition = body.condition && typeof body.condition === "object" ? body.condition : null;
  const channels = Array.isArray(body.channels) ? body.channels.filter((c) => typeof c === "string") : [];
  const cooldown_min = Number.isFinite(body.cooldown_min) ? Math.max(1, Math.min(1440, Number(body.cooldown_min))) : 30;
  const active = body.active !== false;

  if (!name || name.length > 120) return errorResponse("name inválido", 400);
  if (!VALID_TYPES.has(type)) return errorResponse("type inválido", 400);
  if (!condition) return errorResponse("condition obrigatório", 400);
  if (channels.length === 0) return errorResponse("Pelo menos 1 canal", 400);
  for (const c of channels) {
    if (!VALID_CHANNELS.has(c)) return errorResponse(`canal inválido: ${c}`, 400);
  }

  const supabase = adminClient();
  const payload = {
    name,
    type,
    condition,
    channels,
    cooldown_min,
    active,
    updated_at: new Date().toISOString(),
  };

  if (body.id) {
    const { error } = await supabase.from("alerts_config").update(payload).eq("id", body.id);
    if (error) return errorResponse(`Erro ao salvar: ${error.message}`, 500);
    return jsonResponse({ id: body.id });
  }

  const { data, error } = await supabase
    .from("alerts_config")
    .insert(payload)
    .select("id")
    .single();
  if (error) return errorResponse(`Erro ao salvar: ${error.message}`, 500);
  return jsonResponse({ id: data.id });
});
