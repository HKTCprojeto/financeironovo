/**
 * POST /evolution-config-save
 * Body: { id?, base_url, api_key?, active }
 * Em update sem api_key, preserva api_key_encrypted existente.
 * webhook_secret é gerado server-side na 1ª vez e preservado depois.
 * Auth: JWT Supabase.
 */
import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/auth.ts";
import { encryptVault } from "../_shared/vault.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL_RE = /^https:\/\/.+/i;

function newSecret() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Authorization header obrigatório", 401);
  }

  const anonKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) return errorResponse("Configuração do painel incompleta", 500);

  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) return errorResponse("JWT inválido ou expirado", 401);

  let body: { id?: string; base_url?: string; api_key?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  const base_url = (body.base_url ?? "").trim().replace(/\/$/, "");
  const active = body.active !== false;
  if (!URL_RE.test(base_url)) {
    return errorResponse("base_url inválida (esperado https://...)", 400);
  }

  const supabase = adminClient();

  // Single-tenant: usa o registro existente ou cria um
  const { data: existing } = await supabase
    .from("evolution_config")
    .select("id, api_key_encrypted, webhook_secret")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let api_key_encrypted: string | null = existing?.api_key_encrypted ?? null;
  if (body.api_key && body.api_key.trim()) {
    try {
      api_key_encrypted = await encryptVault(body.api_key.trim());
    } catch (e) {
      return errorResponse(`Erro ao encriptar api_key: ${(e as Error).message}`, 500);
    }
  }
  if (!api_key_encrypted) {
    return errorResponse("api_key obrigatória ao criar", 400);
  }

  const webhook_secret = existing?.webhook_secret ?? newSecret();

  if (existing) {
    const { error } = await supabase
      .from("evolution_config")
      .update({
        base_url,
        active,
        api_key_encrypted,
        webhook_secret,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (error) return errorResponse(`Erro ao atualizar: ${error.message}`, 500);
    return jsonResponse({ ok: true, id: existing.id, webhook_secret });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("evolution_config")
    .insert({
      base_url,
      active,
      api_key_encrypted,
      webhook_secret,
    })
    .select("id")
    .single();
  if (insErr) return errorResponse(`Erro ao criar: ${insErr.message}`, 500);
  return jsonResponse({ ok: true, id: inserted.id, webhook_secret });
});
