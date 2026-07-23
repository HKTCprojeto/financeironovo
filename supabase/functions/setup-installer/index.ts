/**
 * GET /setup-installer?token=xxx
 * Público (verify_jwt=false). Valida token one-time e retorna shell script bash
 * com .install_env.sh já preenchido + curl do setup.sh real.
 */
import { adminClient, ensurePanelToken } from "../_shared/auth.ts";

// Repo do instalador. O script gerado resolve a ÚLTIMA RELEASE publicada em
// runtime e fixa a instalação nessa tag (REPO_REF) — instalação reproduzível;
// um push ruim no main não chega aos clientes. Fallback para main.
const REPO_SLUG = "MindOpsTeam/agente-cfo";

function shEscape(v: string): string {
  return `'${String(v).replace(/'/g, "'\\''")}'`;
}

// Base64 UTF-8-safe (payload do onboarding é pequeno, <1KB).
function b64(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

// PAINEL "BURRO" (estável): emite apenas o JSON do onboarding em base64. TODO o
// mapeamento nome-de-variável (CFO_ERP_NAME, OMIE_APP_KEY, none→nenhum, etc.) mora
// no setup.sh central (MindOpsTeam/agente-cfo), que se propaga sozinho. Assim,
// mudanças no instalador NÃO exigem reatualizar o painel de cada cliente.
function buildEnvVars(data: Record<string, unknown>): string[] {
  return [
    `export NONINTERACTIVE=1`,
    `export CFO_ONBOARDING_B64=${shEscape(b64(JSON.stringify(data ?? {})))}`,
  ];
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new Response("# erro: token ausente\nexit 1\n", { status: 400 });

  const admin = adminClient();
  const { data: row } = await admin
    .from("installer_tokens")
    .select("token, expires_at, used_at, metadata")
    .eq("token", token)
    .maybeSingle();

  if (!row) return new Response("# erro: token inválido\nexit 1\n", { status: 404 });
  if (row.used_at) return new Response("# erro: token já utilizado\nexit 1\n", { status: 410 });
  if (new Date(row.expires_at) < new Date()) {
    return new Response("# erro: token expirado\nexit 1\n", { status: 410 });
  }

  await admin.from("installer_tokens").update({ used_at: new Date().toISOString() }).eq("token", token);

  const envLines = buildEnvVars((row.metadata ?? {}) as Record<string, unknown>);
  // PANEL_BASE_URL: usa a URL CANÔNICA do projeto (SUPABASE_URL) — NÃO o url.origin
  // da requisição, que pode ser um host que redireciona (301 Cloudflare) e quebra o
  // registro/heartbeat da VPS. Fallback no origin se SUPABASE_URL não existir.
  const panelBase = (Deno.env.get("SUPABASE_URL") ?? url.origin).replace(/\/+$/, "");
  envLines.unshift(`export PANEL_BASE_URL=${shEscape(`${panelBase}/functions/v1`)}`);
  // PANEL_TOKEN compartilhado: o painel gera/guarda (panel_config) e injeta aqui.
  // Assim a VPS já recebe o token e o painel o valida — sem colar secret à mão.
  envLines.unshift(`export PANEL_TOKEN=${shEscape(await ensurePanelToken())}`);

  const script = `#!/usr/bin/env bash
# Agente CFO — installer (gerado pelo painel)
set -euo pipefail

echo "==> Configurando variáveis de ambiente do agente..."
mkdir -p "$HOME/.agente-cfo"
cat > "$HOME/.agente-cfo/.install_env.sh" <<'AGENTE_CFO_ENV_EOF'
${envLines.join("\n")}
AGENTE_CFO_ENV_EOF
chmod 600 "$HOME/.agente-cfo/.install_env.sh"
# shellcheck disable=SC1091
source "$HOME/.agente-cfo/.install_env.sh"

echo "==> Resolvendo última release do Agente CFO..."
REPO_REF="$(curl -fsSL https://api.github.com/repos/${REPO_SLUG}/releases/latest 2>/dev/null \
  | grep -oE '"tag_name"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 \
  | sed -E 's/.*"([^"]+)"$/\\1/')"
[ -z "$REPO_REF" ] && { echo "   (sem release publicada — usando main)"; REPO_REF=main; }
export REPO_REF
echo "==> Baixando e executando setup.sh (ref: $REPO_REF)..."
curl -fsSL "https://raw.githubusercontent.com/${REPO_SLUG}/$REPO_REF/install/setup.sh" | bash
`;

  return new Response(script, {
    status: 200,
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});
