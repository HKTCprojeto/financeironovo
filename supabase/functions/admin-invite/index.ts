// ============================================================
// Edge Function: admin-invite
// ------------------------------------------------------------
// Gera um link de convite para um novo usuário do sistema financeiro.
// Só o admin (ADMIN_EMAIL) pode chamar. A chave secreta (service_role)
// fica SÓ aqui no servidor — nunca vai para o navegador.
//
// Deploy (pelo painel do Supabase, sem CLI):
//   Edge Functions → Deploy a new function → nome: admin-invite
//   Cole este arquivo. IMPORTANTE: desligue "Verify JWT" / "Enforce JWT"
//   (a verificação é feita aqui dentro, manualmente).
//
// Variáveis de ambiente:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY  → já vêm prontas
//   ADMIN_EMAIL           (opcional) → padrão abaixo
//   INVITE_REDIRECT_URL   (opcional) → padrão abaixo
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY       = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL    = (Deno.env.get("ADMIN_EMAIL") ?? "rodrigo.coelho@hktc.com.br").toLowerCase();
const DEFAULT_REDIRECT = Deno.env.get("INVITE_REDIRECT_URL") ?? "https://financeiro.hktcdobrasil.com.br/login";

const ALLOWED_ORIGINS = [
  "https://financeiro.hktcdobrasil.com.br",
  "https://financeironovo.vercel.app",
  "http://127.0.0.1:8777",
  "http://localhost:8777",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(obj: unknown, status: number, extra: Record<string, string>) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405, cors);

  // 1) Valida quem está chamando (precisa ser o admin).
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Não autenticado" }, 401, cors);

  const asUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Sessão inválida" }, 401, cors);

  const callerEmail = (userData.user.email ?? "").toLowerCase();
  if (callerEmail !== ADMIN_EMAIL) {
    return json({ error: "Sem permissão de administrador." }, 403, cors);
  }

  // 2) Lê o e-mail a convidar.
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* corpo vazio */ }
  const email = String(body.email ?? "").trim().toLowerCase();
  const redirectTo = String(body.redirectTo ?? DEFAULT_REDIRECT);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: "E-mail inválido." }, 400, cors);
  }

  // 3) Gera o link de convite usando a service_role (só no servidor).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });

  if (error) {
    const already = /already|registered|exists/i.test(error.message);
    return json({ error: already ? "Este e-mail já tem conta." : error.message }, 400, cors);
  }

  const link = (data as any)?.properties?.action_link ?? null;
  if (!link) return json({ error: "Não foi possível gerar o link." }, 500, cors);

  return json({ email, action_link: link }, 200, cors);
});
