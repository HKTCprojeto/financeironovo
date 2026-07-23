/* ============================================================
   HKTC · Financeiro — Autenticação (padrão do time, via Supabase)
   ------------------------------------------------------------
   Mesmo padrão do sistema Severus: login por e-mail/senha usando
   Supabase Auth. Não precisa de backend próprio — as chamadas vão
   direto para a API REST de auth do Supabase.

   >>> PREENCHA ESTAS DUAS LINHAS com os dados do SEU projeto Supabase
       (Dashboard → Project Settings → API):
         - Project URL          → SUPABASE_URL
         - anon / public key     → SUPABASE_ANON_KEY  (é pública, pode ficar no front)
   ============================================================ */
(function (global) {
  "use strict";

  var SUPABASE_URL      = "https://utowspmmukczjinwgfdv.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0b3dzcG1tdWtjemppbndnZmR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNjEzNTMsImV4cCI6MjA5OTYzNzM1M30.yl_EVey3Fr-LdFJIYAZDQTHt3DxLn9kidO8nn9Tw24Y";

  var SESSION_KEY = "hktc:fin:session";
  var LOGIN_PAGE  = "/login";
  var APP_PAGE    = "/";
  var ADMIN_PAGE  = "/admin";

  // Quem enxerga o painel de administrador (a validação de verdade é feita
  // no servidor, pela Edge Function admin-invite).
  var ADMIN_EMAIL = "rodrigo.coelho@hktc.com.br";

  function isConfigured() {
    return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
  }

  // ---------- armazenamento da sessão ----------
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
    catch (_) { return null; }
  }
  function setSession(s) {
    // Normaliza a resposta do Supabase para o formato que guardamos.
    var expiresAt = s.expires_at || (s.expires_in ? Math.floor(Date.now() / 1000) + s.expires_in : 0);
    var norm = {
      access_token:  s.access_token,
      refresh_token: s.refresh_token,
      expires_at:    expiresAt,
      user: s.user ? { id: s.user.id, email: s.user.email } : null
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(norm));
    return norm;
  }
  function clearSession() { localStorage.removeItem(SESSION_KEY); }

  function nowSec() { return Math.floor(Date.now() / 1000); }
  function hasSession() {
    var s = getSession();
    return !!(s && s.refresh_token);
  }
  function accessValid() {
    var s = getSession();
    return !!(s && s.access_token && s.expires_at && s.expires_at > nowSec() + 30);
  }

  // ---------- chamadas à API de auth ----------
  function authFetch(path, opts) {
    opts = opts || {};
    var headers = Object.assign({
      "apikey": SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    }, opts.headers || {});
    return fetch(SUPABASE_URL + "/auth/v1" + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var msg = (data && (data.error_description || data.msg || data.message || data.error)) || ("Erro " + res.status);
          var err = new Error(msg); err.status = res.status; err.data = data; throw err;
        }
        return data;
      }, function () {
        if (!res.ok) throw new Error("Erro " + res.status);
        return {};
      });
    });
  }

  function signIn(email, password) {
    return authFetch("/token?grant_type=password", {
      method: "POST",
      body: { email: email, password: password }
    }).then(function (data) { return setSession(data); });
  }

  function signUp(email, password, redirectTo) {
    var body = { email: email, password: password };
    if (redirectTo) body.options = { email_redirect_to: redirectTo };
    return authFetch("/signup", { method: "POST", body: body }).then(function (data) {
      // Se a confirmação de e-mail estiver desligada, o Supabase já devolve a sessão.
      if (data && data.access_token) setSession(data);
      return data;
    });
  }

  function resetPassword(email, redirectTo) {
    var body = { email: email };
    if (redirectTo) body.redirect_to = redirectTo;
    return authFetch("/recover", { method: "POST", body: body });
  }

  // Define nova senha (usado após clicar no link de recuperação do e-mail).
  function updatePassword(newPassword, accessToken) {
    return authFetch("/user", {
      method: "PUT",
      headers: { "Authorization": "Bearer " + accessToken },
      body: { password: newPassword }
    });
  }

  function refresh() {
    var s = getSession();
    if (!s || !s.refresh_token) return Promise.reject(new Error("sem sessão"));
    return authFetch("/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: s.refresh_token }
    }).then(function (data) { return setSession(data); });
  }

  function getUser() {
    var s = getSession();
    if (!s || !s.access_token) return Promise.reject(new Error("sem sessão"));
    return authFetch("/user", { headers: { "Authorization": "Bearer " + s.access_token } });
  }

  function signOut() {
    var s = getSession();
    var done = function () { clearSession(); location.replace(LOGIN_PAGE); };
    if (isConfigured() && s && s.access_token) {
      authFetch("/logout", {
        method: "POST",
        headers: { "Authorization": "Bearer " + s.access_token }
      }).then(done, done);
    } else { done(); }
  }

  // ---------- trava de acesso do app ----------
  // Uso no index.html. Se não houver sessão, manda para o login.
  // Se o access_token expirou mas há refresh_token, tenta renovar em segundo plano.
  function guardApp() {
    if (!isConfigured()) {
      console.warn("[auth] Supabase não configurado em auth.js — trava de login desativada.");
      return;
    }
    if (!hasSession()) { location.replace(LOGIN_PAGE); return; }
    if (!accessValid()) {
      refresh().catch(function () { clearSession(); location.replace(LOGIN_PAGE); });
    }
  }

  // Uso no login.html: se já está logado, pula direto para o app.
  function redirectIfLoggedIn() {
    if (isConfigured() && hasSession()) location.replace(APP_PAGE);
  }

  // ---------- administrador ----------
  function currentEmail() {
    var s = getSession();
    return (s && s.user && s.user.email) ? s.user.email : null;
  }
  function isAdmin() {
    var e = currentEmail();
    return !!e && e.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  }

  // Trava do painel admin (admin.html). Sem sessão → login; logado mas não
  // admin → volta para o app.
  function guardAdmin() {
    if (!isConfigured()) {
      console.warn("[auth] Supabase não configurado — painel admin desativado.");
      return false;
    }
    if (!hasSession()) { location.replace(LOGIN_PAGE); return false; }
    if (!isAdmin())    { location.replace(APP_PAGE);   return false; }
    if (!accessValid()) {
      refresh().catch(function () { clearSession(); location.replace(LOGIN_PAGE); });
    }
    return true;
  }

  // Chamada genérica à Edge Function de administração (usa a service_role no
  // servidor). Todas as ações passam por aqui, sempre com o token do admin.
  function adminCall(payload) {
    var s = getSession();
    if (!isConfigured()) return Promise.reject(new Error("Supabase não configurado."));
    if (!s || !s.access_token) return Promise.reject(new Error("Sessão expirada. Entre novamente."));
    return fetch(SUPABASE_URL + "/functions/v1/admin-invite", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + s.access_token,
        "apikey": SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload || {})
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.error) || ("Erro " + res.status));
          err.status = res.status; throw err;
        }
        return data;
      }, function () {
        if (!res.ok) throw new Error("Erro " + res.status);
        return {};
      });
    });
  }

  var DEFAULT_REDIRECT = function () { return location.origin + LOGIN_PAGE; };

  // Gera um link de convite para um novo usuário.
  function inviteUser(email, redirectTo) {
    return adminCall({ action: "invite", email: email, redirectTo: redirectTo || DEFAULT_REDIRECT() });
  }
  // Lista os usuários (sem dados sensíveis — nunca traz senha).
  function listUsers() {
    return adminCall({ action: "list" });
  }
  // Define uma NOVA senha para um usuário (a antiga não é revelada — é hash).
  function resetUserPassword(id, password) {
    return adminCall({ action: "reset_password", id: id, password: password });
  }
  // Reenvia acesso: gera um novo link para o usuário definir/redefinir a senha.
  function resendInvite(email, redirectTo) {
    return adminCall({ action: "resend", email: email, redirectTo: redirectTo || DEFAULT_REDIRECT() });
  }
  // Remove o acesso de um usuário (exclui do Supabase).
  function deleteUser(id) {
    return adminCall({ action: "delete", id: id });
  }

  global.HKTCAuth = {
    isConfigured: isConfigured,
    getSession: getSession,
    clearSession: clearSession,
    hasSession: hasSession,
    accessValid: accessValid,
    signIn: signIn,
    signUp: signUp,
    resetPassword: resetPassword,
    updatePassword: updatePassword,
    refresh: refresh,
    getUser: getUser,
    signOut: signOut,
    guardApp: guardApp,
    redirectIfLoggedIn: redirectIfLoggedIn,
    currentEmail: currentEmail,
    isAdmin: isAdmin,
    guardAdmin: guardAdmin,
    inviteUser: inviteUser,
    listUsers: listUsers,
    resetUserPassword: resetUserPassword,
    resendInvite: resendInvite,
    deleteUser: deleteUser,
    LOGIN_PAGE: LOGIN_PAGE,
    APP_PAGE: APP_PAGE,
    ADMIN_PAGE: ADMIN_PAGE
  };
})(window);
