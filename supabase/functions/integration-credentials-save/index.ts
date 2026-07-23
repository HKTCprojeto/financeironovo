/**
 * POST /integration-credentials-save
 * Body: { skill_name, credentials: {KEY:val,...}, active }
 * Encripta credentials JSON e faz upsert por skill_name.
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import { encryptVault, decryptVault } from "../_shared/vault.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SLUG_RE = /^[a-z0-9-]{1,64}$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse("Authorization obrigatório", 401);

  const anonKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) return errorResponse("Configuração incompleta", 500);

  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) return errorResponse("JWT inválido", 401);

  let body: {
    skill_name?: string;
    credentials?: Record<string, string>;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body inválido", 400);
  }

  const skill = (body.skill_name ?? "").trim().toLowerCase();
  if (!SLUG_RE.test(skill)) return errorResponse("skill_name inválido", 400);
  const active = body.active !== false;
  const incoming = body.credentials ?? {};
  if (typeof incoming !== "object" || Array.isArray(incoming)) {
    return errorResponse("credentials deve ser objeto", 400);
  }

  const supabase = adminClient();

  // Merge: campos vazios mantêm valor existente (modo edit)
  const { data: existing } = await supabase
    .from("integration_credentials")
    .select("id, credentials_encrypted")
    .eq("skill_name", skill)
    .maybeSingle();

  let merged: Record<string, string> = {};
  if (existing?.credentials_encrypted) {
    try {
      merged = JSON.parse(await decryptVault(existing.credentials_encrypted));
    } catch {
      merged = {};
    }
  }
  for (const [k, v] of Object.entries(incoming)) {
    const val = String(v ?? "").trim();
    if (val) merged[k] = val;
  }

  if (Object.keys(merged).length === 0) {
    return errorResponse("Pelo menos uma credencial obrigatória", 400);
  }

  let encrypted: string;
  try {
    encrypted = await encryptVault(JSON.stringify(merged));
  } catch (e) {
    return errorResponse(`Erro ao encriptar: ${(e as Error).message}`, 500);
  }

  const { data, error } = await supabase
    .from("integration_credentials")
    .upsert(
      {
        skill_name: skill,
        credentials_encrypted: encrypted,
        active,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "skill_name" },
    )
    .select("id")
    .single();

  if (error) return errorResponse(`Erro ao salvar: ${error.message}`, 500);
  return jsonResponse({ id: data.id });
});
