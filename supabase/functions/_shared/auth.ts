// cors-rebuild: force redeploy all functions importing _shared/auth.ts (full CORS headers)
/**
 * _shared/auth.ts
 * Helpers de autenticação para edge functions do Agente CFO (single-tenant).
 *
 * Auth da VPS → painel: header X-Panel-Token validado contra env PANEL_TOKEN.
 * Auth do front → painel: JWT Supabase padrão (push-command).
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Supabase admin client (service_role) — ignora RLS
// ---------------------------------------------------------------------------
export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Token compartilhado VPS <-> painel.
// Fonte da verdade: secret PANEL_TOKEN (env) se existir; senão a tabela
// panel_config (gerada/preenchida pelo setup-installer). Isso permite instalação
// ponta-a-ponta sem o cliente colar nenhum secret à mão.
// ---------------------------------------------------------------------------
export async function getPanelToken(): Promise<string> {
  const env = Deno.env.get("PANEL_TOKEN");
  if (env) return env;
  const { data } = await adminClient()
    .from("panel_config")
    .select("panel_token")
    .eq("id", 1)
    .maybeSingle();
  return data?.panel_token ?? "";
}

// Garante que exista um panel_token no DB (gera na primeira vez) e retorna-o.
// Usado pelo setup-installer pra injetar o token no .install_env.sh da VPS.
export async function ensurePanelToken(): Promise<string> {
  const env = Deno.env.get("PANEL_TOKEN");
  if (env) return env;
  const admin = adminClient();
  const { data } = await admin
    .from("panel_config")
    .select("panel_token")
    .eq("id", 1)
    .maybeSingle();
  if (data?.panel_token) return data.panel_token;
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  const tok = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
  await admin
    .from("panel_config")
    .upsert({ id: 1, panel_token: tok }, { onConflict: "id", ignoreDuplicates: true });
  // Re-lê: se houve corrida, fica com o token que ganhou o insert.
  const { data: after } = await admin
    .from("panel_config")
    .select("panel_token")
    .eq("id", 1)
    .maybeSingle();
  return after?.panel_token ?? tok;
}

// ---------------------------------------------------------------------------
// Validar X-Panel-Token. Retorna true se válido, false caso contrário.
// ---------------------------------------------------------------------------
export async function validatePanelToken(req: Request): Promise<boolean> {
  const token = req.headers.get("X-Panel-Token");
  if (!token) return false;
  const expected = await getPanelToken();
  if (!expected) return false;
  // Comparação constante (evita timing attacks)
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Resposta de erro padronizada
// ---------------------------------------------------------------------------
export function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Resposta de sucesso padronizada
// ---------------------------------------------------------------------------
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// CORS headers padrão
// ---------------------------------------------------------------------------
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-panel-token, x-hooks-token",
};
