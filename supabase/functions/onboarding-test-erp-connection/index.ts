/**
 * POST /onboarding-test-erp-connection
 * Body: { erp_name, credentials }
 * MVP: valida formato das credenciais. Retorna {valid, company_name?}.
 * (Validação real fica pro setup.sh na VPS).
 */
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";

const REQUIRED: Record<string, string[]> = {
  omie: ["app_key", "app_secret"],
  bling: [], // OAuth, validado em outra rota
  tiny: ["token"],
  granatum: ["token"],
  vhsys: ["access_token", "secret_token"],
  nibo: ["api_token"],
  holdprint: ["api_key"],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: { erp_name?: string; credentials?: Record<string, string> };
  try { body = await req.json(); } catch { return errorResponse("Body inválido", 400); }

  const name = body.erp_name?.toLowerCase().trim();
  const creds = body.credentials ?? {};
  if (!name) return errorResponse("erp_name obrigatório", 400);

  const required = REQUIRED[name];
  if (!required) return jsonResponse({ valid: false, error: `ERP '${name}' não suportado` });

  for (const f of required) {
    if (!creds[f] || String(creds[f]).trim().length < 4) {
      return jsonResponse({ valid: false, error: `Campo '${f}' obrigatório` });
    }
  }

  // Holdprint: validação REAL da API key (GET barato) — feedback imediato ao cliente.
  if (name === "holdprint") {
    try {
      const r = await fetch("https://api.holdworks.ai/api-key/customers/data?limit=1", {
        headers: { "x-api-key": String(creds.api_key ?? "") },
      });
      if (r.status === 401) {
        return jsonResponse({ valid: false, error: "API Key inválida (401). Confira em Holdprint → Ajustes → API." });
      }
      if (r.ok) return jsonResponse({ valid: true, company_name: "Holdprint", message: "API Key válida." });
      return jsonResponse({ valid: true, company_name: null, message: `Holdprint respondeu ${r.status}; validação final no setup da VPS.` });
    } catch {
      return jsonResponse({ valid: true, company_name: null, message: "Não consegui validar agora; validação no setup da VPS." });
    }
  }

  return jsonResponse({
    valid: true,
    company_name: null,
    message: "Credenciais aceitas. Validação real será feita no setup da VPS.",
  });
});
