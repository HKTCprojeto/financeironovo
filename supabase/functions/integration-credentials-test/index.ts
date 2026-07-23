/**
 * POST /integration-credentials-test
 * Body: { skill_name }
 * Faz hit de teste e atualiza last_test_*. Retorna { status, detail }.
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import { decryptVault } from "../_shared/vault.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type TestResult = { status: "ok" | "invalid" | "unreachable" | "unknown"; detail?: string };

async function runTest(skill: string, c: Record<string, string>): Promise<TestResult> {
  const t = (name: string) => c[name] ?? "";
  try {
    switch (skill) {
      case "omie": {
        const r = await fetch("https://app.omie.com.br/api/v1/geral/empresas/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            call: "ListarEmpresas",
            app_key: t("OMIE_APP_KEY"),
            app_secret: t("OMIE_APP_SECRET"),
            param: [{ pagina: 1, registros_por_pagina: 1, apenas_importado_api: "N" }],
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (r.ok) return { status: "ok" };
        const txt = await r.text();
        if (/SOAP-ENV|Faultstring|app_key|app_secret/i.test(txt)) {
          return { status: "invalid", detail: "App Key/Secret inválidos" };
        }
        return { status: "unreachable", detail: `HTTP ${r.status}` };
      }
      case "tiny": {
        const r = await fetch(
          `https://api.tiny.com.br/api2/info.php?token=${encodeURIComponent(t("TINY_TOKEN"))}&formato=json`,
          { signal: AbortSignal.timeout(15000) },
        );
        const j = await r.json().catch(() => null);
        const status = j?.retorno?.status;
        if (status === "OK") return { status: "ok" };
        return { status: "invalid", detail: j?.retorno?.erros?.[0]?.erro ?? "Token inválido" };
      }
      case "granatum": {
        const r = await fetch("https://api.granatum.com.br/v1/contas-de-recebimento", {
          headers: { "X-AUTH-TOKEN": t("GRANATUM_API_KEY") },
          signal: AbortSignal.timeout(15000),
        });
        if (r.status === 200) return { status: "ok" };
        if (r.status === 401 || r.status === 403) return { status: "invalid", detail: "API Key inválida" };
        return { status: "unreachable", detail: `HTTP ${r.status}` };
      }
      case "vhsys": {
        const r = await fetch("https://api.vhsys.com/v2/produtos?limit=1", {
          headers: {
            "access-token": t("VHSYS_ACCESS_TOKEN"),
            "secret-access-token": t("VHSYS_SECRET_TOKEN"),
          },
          signal: AbortSignal.timeout(15000),
        });
        if (r.status === 200) return { status: "ok" };
        if (r.status === 401 || r.status === 403) return { status: "invalid", detail: "Tokens inválidos" };
        return { status: "unreachable", detail: `HTTP ${r.status}` };
      }
      case "nibo": {
        const r = await fetch("https://api.nibo.com.br/empresas/v1/organizations", {
          headers: { apitoken: t("NIBO_API_TOKEN") },
          signal: AbortSignal.timeout(15000),
        });
        if (r.status === 200) return { status: "ok" };
        if (r.status === 401 || r.status === 403) return { status: "invalid", detail: "Token inválido" };
        return { status: "unreachable", detail: `HTTP ${r.status}` };
      }
      case "hubspot": {
        const r = await fetch("https://api.hubapi.com/crm/v3/owners?limit=1", {
          headers: { Authorization: `Bearer ${t("HUBSPOT_ACCESS_TOKEN")}` },
          signal: AbortSignal.timeout(15000),
        });
        if (r.status === 200) return { status: "ok" };
        if (r.status === 401) return { status: "invalid", detail: "Private App Token inválido" };
        return { status: "unreachable", detail: `HTTP ${r.status}` };
      }
      case "rd-station": {
        const r = await fetch(
          `https://crm.rdstation.com/api/v1/contact_emails?token=${encodeURIComponent(t("RD_STATION_API_KEY"))}&limit=1`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (r.status === 200) return { status: "ok" };
        if (r.status === 401 || r.status === 403) return { status: "invalid", detail: "API Key inválida" };
        return { status: "unreachable", detail: `HTTP ${r.status}` };
      }
      case "piperun": {
        const r = await fetch(
          `https://api.pipe.run/v1/users?token=${encodeURIComponent(t("PIPERUN_TOKEN"))}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (r.status === 200) return { status: "ok" };
        if (r.status === 401 || r.status === 403) return { status: "invalid", detail: "Token inválido" };
        return { status: "unreachable", detail: `HTTP ${r.status}` };
      }
      case "pipedrive": {
        const dom = t("PIPEDRIVE_COMPANY_DOMAIN").replace(/[^a-z0-9-]/gi, "");
        const r = await fetch(
          `https://${dom}.pipedrive.com/api/v1/users/me?api_token=${encodeURIComponent(t("PIPEDRIVE_API_TOKEN"))}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (r.status === 200) return { status: "ok" };
        if (r.status === 401) return { status: "invalid", detail: "API Token inválido" };
        return { status: "unreachable", detail: `HTTP ${r.status}` };
      }
      case "kommo": {
        const sub = t("KOMMO_SUBDOMAIN").replace(/[^a-z0-9-]/gi, "");
        const r = await fetch(`https://${sub}.kommo.com/api/v4/account`, {
          headers: { Authorization: `Bearer ${t("KOMMO_ACCESS_TOKEN")}` },
          signal: AbortSignal.timeout(15000),
        });
        if (r.status === 200) return { status: "ok" };
        if (r.status === 401) return { status: "invalid", detail: "Access Token inválido" };
        return { status: "unreachable", detail: `HTTP ${r.status}` };
      }
      case "asaas": {
        const env = (t("ASAAS_ENV") || "production").toLowerCase();
        const base = env.startsWith("sand")
          ? "https://api-sandbox.asaas.com/v3"
          : "https://api.asaas.com/v3";
        const r = await fetch(`${base}/customers?limit=1`, {
          headers: { access_token: t("ASAAS_API_KEY") },
          signal: AbortSignal.timeout(15000),
        });
        if (r.status === 200) return { status: "ok" };
        if (r.status === 401) return { status: "invalid", detail: "API Key inválida" };
        return { status: "unreachable", detail: `HTTP ${r.status}` };
      }
      case "iugu": {
        const auth = btoa(`${t("IUGU_API_TOKEN")}:`);
        const r = await fetch("https://api.iugu.com/v1/accounts", {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(15000),
        });
        if (r.status === 200) return { status: "ok" };
        if (r.status === 401) return { status: "invalid", detail: "API Token inválido" };
        return { status: "unreachable", detail: `HTTP ${r.status}` };
      }
      // OAuth — delegado pra fluxo dedicado
      case "bling":
      case "contaazul":
      case "mercado-livre":
      case "nuvemshop":
        return { status: "unknown", detail: "Use o fluxo OAuth dedicado" };
      default:
        return { status: "unknown", detail: "Skill sem teste implementado" };
    }
  } catch (e) {
    return { status: "unreachable", detail: String((e as Error).message ?? e) };
  }
}

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

  let body: { skill_name?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body inválido", 400);
  }
  const skill = (body.skill_name ?? "").trim().toLowerCase();
  if (!skill) return errorResponse("skill_name obrigatório", 400);

  const supabase = adminClient();
  const { data: row, error: rowErr } = await supabase
    .from("integration_credentials")
    .select("credentials_encrypted")
    .eq("skill_name", skill)
    .maybeSingle();
  if (rowErr) return errorResponse(`Erro: ${rowErr.message}`, 500);
  if (!row) return errorResponse("Credenciais não cadastradas", 404);

  let creds: Record<string, string>;
  try {
    creds = JSON.parse(await decryptVault(row.credentials_encrypted));
  } catch (e) {
    return errorResponse(`Erro ao descriptografar: ${(e as Error).message}`, 500);
  }

  const result = await runTest(skill, creds);

  await supabase
    .from("integration_credentials")
    .update({
      last_test_at: new Date().toISOString(),
      last_test_status: result.status,
      last_test_detail: result.detail ?? null,
    })
    .eq("skill_name", skill);

  return jsonResponse(result);
});
