/**
 * POST /report-issue
 * Permite que usuários reportem issues direto do painel para o GitHub.
 * Sprint SHIP-1 — 2026-05-25
 *
 * Body: {
 *   subject: string,
 *   description: string,
 *   include_telemetry?: boolean
 * }
 *
 * Auth: JWT Supabase (verify_jwt=true via config.toml)
 *
 * Rate limit: 5 issues por user por hora (tabela report_issues_log).
 *
 * Requer secret GITHUB_REPORT_ISSUE_TOKEN no Supabase Dashboard
 * (Personal Access Token com escopo `issues`).
 */

import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Sanitização: remove valores de variáveis sensíveis ──────────────────────
const SENSITIVE_PATTERNS = [
  /PANEL_TOKEN=[^\s\n"']+/gi,
  /ANTHROPIC_API_KEY=[^\s\n"']+/gi,
  /OMIE_APP_SECRET=[^\s\n"']+/gi,
  /OPENAI_API_KEY=[^\s\n"']+/gi,
  /SUPABASE_SERVICE_ROLE_KEY=[^\s\n"']+/gi,
  /GITHUB_[A-Z_]+=[\w-]+/gi,
  /sk-[a-zA-Z0-9-]{20,}/g,      // OpenAI keys
  /eyJ[a-zA-Z0-9._-]{30,}/g,    // JWTs
  /[a-f0-9]{40,}/g,              // Hashes longas (tokens hex)
  /ghp_[a-zA-Z0-9]{36}/g,       // GitHub tokens
  /ghs_[a-zA-Z0-9]{36}/g,
];

function sanitize(text: string): string {
  let result = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

// ── Rate limiting via tabela report_issues_log ───────────────────────────────
async function checkRateLimit(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("report_issues_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", oneHourAgo);

  const used = count ?? 0;
  const limit = 5;
  return { allowed: used < limit, remaining: limit - used };
}

async function logReport(
  supabase: ReturnType<typeof adminClient>,
  userId: string,
  subject: string,
  issueUrl: string,
): Promise<void> {
  await supabase.from("report_issues_log").insert({
    user_id: userId,
    subject: subject.slice(0, 200),
    issue_url: issueUrl,
    created_at: new Date().toISOString(),
  }).then(() => {}); // Ignora erro de log — não crítico
}

// ── Coleta telemetria sanitizada ─────────────────────────────────────────────
async function collectTelemetry(
  supabase: ReturnType<typeof adminClient>,
): Promise<string> {
  const lines: string[] = ["", "---", "### Telemetria do Sistema (sanitizada)", ""];

  // VPS heartbeat
  try {
    const { data: instance } = await supabase
      .from("instances")
      .select("last_heartbeat, instance_name, setup_version")
      .order("last_heartbeat", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (instance) {
      lines.push(`**VPS heartbeat:** ${instance.last_heartbeat ?? "nunca"}`);
      lines.push(`**Instância:** ${instance.instance_name ?? "N/A"}`);
      if (instance.setup_version) {
        lines.push(`**Setup version:** ${instance.setup_version}`);
      }
    }
  } catch { /* ignora */ }

  // Último erro registrado
  try {
    const { data: errors } = await supabase
      .from("events")
      .select("created_at, event_type, summary")
      .eq("severity", "error")
      .order("created_at", { ascending: false })
      .limit(5);

    if (errors && errors.length > 0) {
      lines.push("", "**Últimos erros registrados:**");
      for (const err of errors) {
        const summary = sanitize((err.summary ?? "").slice(0, 150));
        lines.push(`- [${err.created_at}] ${err.event_type}: ${summary}`);
      }
    }
  } catch { /* ignora */ }

  // Integrações com erro
  try {
    const { count: invalidCount } = await supabase
      .from("integration_credentials")
      .select("id", { count: "exact", head: true })
      .eq("last_test_status", "invalid");

    if (invalidCount !== null) {
      lines.push("", `**Integrações com credencial inválida:** ${invalidCount}`);
    }
  } catch { /* ignora */ }

  return sanitize(lines.join("\n"));
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  // Valida JWT Supabase do usuário logado
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Authorization header obrigatório", 401);
  }

  const supabase = adminClient();
  const anonKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supaUser = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await supaUser.auth.getUser();
  if (userErr || !user) return errorResponse("JWT inválido ou expirado", 401);

  // Parse body
  let body: { subject?: string; description?: string; include_telemetry?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  const subject = (body.subject ?? "").trim();
  const description = (body.description ?? "").trim();
  const includeTelemetry = body.include_telemetry === true;

  if (!subject) return errorResponse("subject é obrigatório", 400);
  if (!description) return errorResponse("description é obrigatório", 400);
  if (subject.length > 200) return errorResponse("subject máximo 200 caracteres", 400);
  if (description.length > 5000) return errorResponse("description máximo 5000 caracteres", 400);

  // Rate limit
  const { allowed, remaining } = await checkRateLimit(supabase, user.id);
  if (!allowed) {
    return errorResponse(
      `Rate limit: máximo 5 reports por hora. Tente novamente em breve.`,
      429,
    );
  }

  // GitHub token
  const githubToken = Deno.env.get("GITHUB_REPORT_ISSUE_TOKEN");
  if (!githubToken) {
    console.error("report-issue: GITHUB_REPORT_ISSUE_TOKEN não configurado");
    return errorResponse(
      "Token de issue não configurado. Contate o administrador para configurar GITHUB_REPORT_ISSUE_TOKEN.",
      503,
    );
  }

  // Monta body do issue
  const userInfo = `**Reportado por:** ${sanitize(user.email ?? user.id)}`;
  const timestamp = `**Data/Hora:** ${new Date().toISOString()}`;

  let telemetry = "";
  if (includeTelemetry) {
    try {
      telemetry = await collectTelemetry(supabase);
    } catch (e) {
      telemetry = "\n\n---\n### Telemetria\n_Erro ao coletar telemetria._";
    }
  }

  const issueBody = [
    "## Descrição",
    "",
    sanitize(description),
    "",
    "---",
    "### Informações do Report",
    "",
    userInfo,
    timestamp,
    `**Telemetria incluída:** ${includeTelemetry ? "Sim" : "Não"}`,
    telemetry,
    "",
    "---",
    "_Issue criado automaticamente via painel Agente CFO._",
  ].join("\n");

  // Cria issue no GitHub
  const issueTitle = `[Report do Painel] ${sanitize(subject)}`;
  const githubPayload = {
    title: issueTitle,
    body: issueBody,
    labels: ["user-report", "from-panel"],
  };

  let issueUrl = "";
  try {
    const ghResp = await fetch(
      "https://api.github.com/repos/MindOpsTeam/agente-cfo/issues",
      {
        method: "POST",
        headers: {
          "Authorization": `token ${githubToken}`,
          "Content-Type": "application/json",
          "Accept": "application/vnd.github.v3+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "agente-cfo-panel/1.0",
        },
        body: JSON.stringify(githubPayload),
        signal: AbortSignal.timeout(20000),
      },
    );

    if (!ghResp.ok) {
      const errText = await ghResp.text();
      console.error(`report-issue: GitHub API error ${ghResp.status}: ${errText.slice(0, 200)}`);
      if (ghResp.status === 401 || ghResp.status === 403) {
        return errorResponse("Token GitHub sem permissão para criar issues (escopo 'issues' necessário)", 503);
      }
      if (ghResp.status === 404) {
        return errorResponse("Repositório não encontrado ou inacessível com o token fornecido", 503);
      }
      return errorResponse(`Erro ao criar issue no GitHub: HTTP ${ghResp.status}`, 502);
    }

    const ghData = await ghResp.json();
    issueUrl = ghData.html_url ?? "";
    console.log(`report-issue: issue criado por ${user.email} → ${issueUrl}`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("report-issue: erro de rede:", msg);
    return errorResponse(`Erro de rede ao contatar GitHub: ${msg.slice(0, 100)}`, 502);
  }

  // Log do report
  await logReport(supabase, user.id, subject, issueUrl);

  return jsonResponse({
    ok: true,
    issue_url: issueUrl,
    remaining_reports: remaining - 1,
    message: `Issue criado com sucesso! Você tem ${remaining - 1} reports restantes nesta hora.`,
  });
});
