/**
 * POST /onboarding-test-crm-connection
 * Body: { crm_name, credentials }
 * MVP: valida formato.
 */
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";

const REQUIRED: Record<string, string[]> = {
  hubspot: ["private_app_token"],
  rdstation: ["token"],
  piperun: ["token"],
  pipedrive: ["api_token"],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: { crm_name?: string; credentials?: Record<string, string> };
  try { body = await req.json(); } catch { return errorResponse("Body inválido", 400); }

  const name = body.crm_name?.toLowerCase().trim();
  const creds = body.credentials ?? {};
  if (!name) return errorResponse("crm_name obrigatório", 400);

  const required = REQUIRED[name];
  if (!required) return jsonResponse({ valid: false, error: `CRM '${name}' não suportado` });

  for (const f of required) {
    if (!creds[f] || String(creds[f]).trim().length < 4) {
      return jsonResponse({ valid: false, error: `Campo '${f}' obrigatório` });
    }
  }
  return jsonResponse({ valid: true, account_name: null });
});
