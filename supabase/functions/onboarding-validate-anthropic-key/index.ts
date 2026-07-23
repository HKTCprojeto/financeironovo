/**
 * POST /onboarding-validate-anthropic-key
 * Body: { key: string }
 * Faz uma chamada minúscula pra Anthropic só pra validar credencial.
 */
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: { key?: string };
  try { body = await req.json(); } catch { return errorResponse("Body inválido", 400); }

  const key = body.key?.trim();
  if (!key) return errorResponse("key obrigatória", 400);
  if (!key.startsWith("sk-ant-")) {
    return jsonResponse({ valid: false, error: "Formato inválido — chave deve começar com sk-ant-" });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (r.ok) return jsonResponse({ valid: true });

    const errBody = await r.text();
    if (r.status === 401 || r.status === 403) {
      return jsonResponse({ valid: false, error: "Chave inválida ou sem permissão" });
    }
    // 400 com erro de parâmetro mas chave é válida — aceita.
    if (r.status === 400 && errBody.includes("model")) {
      return jsonResponse({ valid: true });
    }
    return jsonResponse({ valid: false, error: `Anthropic ${r.status}: ${errBody.slice(0, 200)}` });
  } catch (e) {
    return jsonResponse({ valid: false, error: `Falha de rede: ${String(e)}` });
  }
});
