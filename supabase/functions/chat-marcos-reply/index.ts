/**
 * POST /chat-marcos-reply
 * Recebe a resposta do agente Lívia (chamado pela VPS) e grava no chat_messages.
 * Auth: header X-Panel-Token.
 *
 * Body: { thread_id, run_id, content, status: 'sent'|'error' }
 */

import {
  adminClient,
  corsHeaders,
  errorResponse,
  validatePanelToken,
} from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  if (!(await validatePanelToken(req))) return errorResponse("Invalid panel token", 401);

  let body: {
    thread_id?: string;
    run_id?: string;
    content?: string;
    status?: string;
  };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  const threadId = body.thread_id;
  const runId = body.run_id;
  const content = body.content ?? "";
  const status = body.status === "error" ? "error" : "sent";

  if (!threadId || !runId) {
    return errorResponse("thread_id e run_id obrigatórios", 400);
  }

  const supabase = adminClient();

  // Tenta achar o placeholder pending
  const { data: existing } = await supabase
    .from("chat_messages")
    .select("id, metadata")
    .eq("thread_id", threadId)
    .eq("role", "marcos")
    .eq("status", "pending")
    .filter("metadata->>runId", "eq", runId)
    .maybeSingle();

  if (existing) {
    const prevMeta = (existing.metadata ?? {}) as Record<string, unknown>;
    await supabase
      .from("chat_messages")
      .update({ content, status, metadata: { ...prevMeta, runId } })
      .eq("id", existing.id);
  } else {
    await supabase.from("chat_messages").insert({
      thread_id: threadId,
      role: "marcos",
      content,
      status,
      metadata: { runId },
    });
  }

  return new Response(null, { status: 204, headers: corsHeaders });
});
