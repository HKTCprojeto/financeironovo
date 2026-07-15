// ============================================================
// Edge Function: admin-invite
// ------------------------------------------------------------
// Administração de usuários do sistema financeiro. Só o admin
// (ADMIN_EMAIL) pode chamar. A chave secreta (service_role) fica
// SÓ aqui no servidor — nunca vai para o navegador.
//
// Ações (campo "action" no corpo):
//   invite          → gera link de convite para novo e-mail
//   list            → lista usuários (sem senha; senha é hash, não existe em texto)
//   reset_password  → define uma NOVA senha para um usuário (id + password)
//   resend          → gera novo link para o usuário definir/redefinir a senha (email)
//   delete          → remove o usuário (id)
//
// Deploy (painel, sem CLI): Edge Functions → função admin-invite → colar este
// arquivo → Deploy. Mantenha "Verify JWT" DESLIGADO (a checagem é feita aqui).
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

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

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

  const callerId = userData.user.id;
  const callerEmail = (userData.user.email ?? "").toLowerCase();
  if (callerEmail !== ADMIN_EMAIL) {
    return json({ error: "Sem permissão de administrador." }, 403, cors);
  }

  // 2) Corpo + ação.
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_) { /* corpo vazio */ }
  const action = String(body.action ?? "invite");
  const redirectTo = String(body.redirectTo ?? DEFAULT_REDIRECT);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---------- listar usuários ----------
  if (action === "list") {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) return json({ error: error.message }, 400, cors);
    const users = (data.users ?? []).map((u: any) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      email_confirmed_at: u.email_confirmed_at ?? u.confirmed_at ?? null,
      invited_at: u.invited_at ?? null,
      is_admin: (u.email ?? "").toLowerCase() === ADMIN_EMAIL,
    }));
    // mais recentes primeiro
    users.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return json({ users }, 200, cors);
  }

  // ---------- convidar novo usuário ----------
  if (action === "invite") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!isEmail(email)) return json({ error: "E-mail inválido." }, 400, cors);
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite", email, options: { redirectTo },
    });
    if (error) {
      const already = /already|registered|exists/i.test(error.message);
      return json({ error: already ? "Este e-mail já tem conta." : error.message }, 400, cors);
    }
    const link = (data as any)?.properties?.action_link ?? null;
    if (!link) return json({ error: "Não foi possível gerar o link." }, 500, cors);
    return json({ email, action_link: link }, 200, cors);
  }

  // ---------- reenviar acesso (gera novo link p/ definir senha) ----------
  if (action === "resend") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!isEmail(email)) return json({ error: "E-mail inválido." }, 400, cors);
    // recovery funciona tanto para quem já ativou quanto para convidado pendente.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery", email, options: { redirectTo },
    });
    if (error) return json({ error: error.message }, 400, cors);
    const link = (data as any)?.properties?.action_link ?? null;
    if (!link) return json({ error: "Não foi possível gerar o link." }, 500, cors);
    return json({ email, action_link: link }, 200, cors);
  }

  // ---------- redefinir senha ----------
  if (action === "reset_password") {
    const id = String(body.id ?? "");
    const password = String(body.password ?? "");
    if (!id) return json({ error: "Usuário inválido." }, 400, cors);
    if (password.length < 6) return json({ error: "A senha deve ter ao menos 6 caracteres." }, 400, cors);
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return json({ error: error.message }, 400, cors);
    return json({ ok: true }, 200, cors);
  }

  // ---------- remover usuário ----------
  if (action === "delete") {
    const id = String(body.id ?? "");
    if (!id) return json({ error: "Usuário inválido." }, 400, cors);
    if (id === callerId) return json({ error: "Você não pode remover a própria conta." }, 400, cors);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return json({ error: error.message }, 400, cors);
    return json({ ok: true }, 200, cors);
  }

  return json({ error: "Ação desconhecida." }, 400, cors);
});
