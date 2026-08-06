/**
 * POST /chat-send-message
 * Envia mensagem do dono (painel web) ao agente Lívia com o MESMO pipeline
 * completo usado por WhatsApp/Telegram (incoming-message → /hooks/agent).
 * Auth: JWT Supabase do dono logado.
 *
 * Body: { content: string }
 * Retorna: { message_id, placeholder_id, run_id }
 */

import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/auth.ts";
import {
  buildToolContext,
  dispatchAgentHook,
  resolveFreshInstance,
} from "../_shared/agent-dispatch.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Authorization header obrigatório", 401);
  }

  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) return errorResponse("Configuração do painel incompleta", 500);

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    anonKey,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
  if (userError || !user) return errorResponse("JWT inválido ou expirado", 401);

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  const content = (body.content ?? "").trim();
  if (!content) return errorResponse("content obrigatório", 400);
  if (content.length > 4000) return errorResponse("content muito longo", 400);

  const supabase = adminClient();
  const threadId = `panel:${user.id}`;
  const channel = `panel:${user.id}`;
  const externalId = user.id;
  const channelLabel = "Painel web";

  // 1. Insere mensagem do user
  const { data: userMsg, error: userMsgErr } = await supabase
    .from("chat_messages")
    .insert({ thread_id: threadId, role: "user", content, status: "sent", channel })
    .select("id")
    .single();

  if (userMsgErr || !userMsg) {
    return errorResponse(`Falha ao salvar mensagem: ${userMsgErr?.message}`, 500);
  }

  // 2. Resolve instância VPS fresca
  const instance = await resolveFreshInstance(supabase);
  if (!instance) {
    await supabase
      .from("chat_messages")
      .update({ status: "error", metadata: { error: "no_instance" } })
      .eq("id", userMsg.id);
    return errorResponse(
      "Lívia está offline — sua VPS não está conectada (sem heartbeat recente). Verifique em /settings.",
      503,
    );
  }

  // 3. Contexto de tools (MCP + skills)
  const contextBlock = await buildToolContext(supabase);

  // 4a. Histórico recente do thread (cross-turn context — hooks são stateless)
  let historyBlock = "";
  const { data: recentMsgs } = await supabase
    .from("chat_messages")
    .select("role,content,status,created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(8);
  if (recentMsgs && recentMsgs.length > 0) {
    const chrono = recentMsgs
      .filter((m) => m.content && m.content.trim() && m.status !== "pending")
      .reverse();
    if (chrono.length > 0) {
      const lines = chrono.map((m) => {
        const c = m.content.length > 300 ? m.content.slice(0, 300) + "…" : m.content;
        return `[${m.role}]: ${c}`;
      }).join("\n");
      historyBlock = `\n\nHISTÓRICO RECENTE DA CONVERSA (mais antigo→mais novo):\n${lines}\n\nUse o histórico acima como contexto. Se a mensagem atual for uma confirmação (SIM/NÃO) de um rascunho que VOCÊ propôs no histórico, execute/cancele esse lançamento.`;
    }
  }

  // 4b. Detecta write pendente do turn anterior (fallback via metadata)
  let pendingWriteBlock = "";
  const { data: pendingMsg } = await supabase
    .from("chat_messages")
    .select("metadata")
    .eq("thread_id", threadId)
    .eq("role", "marcos")
    .not("metadata->>pending_write", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pendingMsg?.metadata?.pending_write) {
    const pw = pendingMsg.metadata.pending_write as Record<string, unknown>;
    const expiresRaw = pw.expires_at as string | undefined;
    const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
    if (!expiresAt || expiresAt > new Date()) {
      pendingWriteBlock = `\n\n⚠️ WRITE PENDENTE DO TURN ANTERIOR — AGUARDANDO CONFIRMAÇÃO:\n${JSON.stringify(pw, null, 2)}\nSe o usuário responder SIM, execute. Se NÃO ou ambíguo, cancele e informe.`;
    }
  }

  // 5. runId gerado UMA vez, reutilizado em prompt + placeholder
  const runId = `panel_${Date.now()}_${userMsg.id}`;

  const promptMsg = `[INCOMING_MESSAGE]
Canal: ${channelLabel}
Phone/Chat: ${externalId}
Usuário: ${content}
${contextBlock}${historyBlock}${pendingWriteBlock}
Você é Lívia, CFO virtual. Leia e siga rigorosamente:
  $HOME/.openclaw/workspace/skills/agente-cfo/prompts/conversa.md

## COMO SUA RESPOSTA CHEGA AO USUÁRIO
Responda normalmente, em texto — a entrega ao painel é automática. NÃO tente
executar script para enviar a resposta (o bridge da VPS faz isso por você).

## VOCÊ AINDA NÃO EXECUTA LANÇAMENTOS
Você não tem ferramenta de escrita em ERP nem execução de shell. Logo:
- NUNCA afirme que lançou, pagou, registrou ou conciliou algo — seria falso.
- Ao receber um pedido de lançamento, extraia os dados, devolva o rascunho e
  avise que a confirmação é feita pelo usuário na tela Pagamentos do painel.

Extração (sem data informada, assuma hoje):
  "gastei 50 com Uber"          → despesa, R\\$ 50, Uber, hoje, Transporte
  "paguei 200 de aluguel"       → despesa, R\\$ 200, Aluguel, hoje, Aluguel
  "recebi 1500 do cliente Acme" → receita, R\\$ 1.500, Acme, hoje, Receita
  "quanto tenho em caixa"       → leitura, sem rascunho

Formato do rascunho:
  "Entendi: R\\$X de <descrição>, categoria <Y>, vencimento DD/MM.
   Ainda não consigo lançar sozinha — registre na tela Pagamentos do painel."`;

  // 6. Placeholder pending do "marcos" (com channel + external_id no metadata)
  const { data: marcosMsg } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      role: "marcos",
      content: "",
      status: "pending",
      channel,
      metadata: { runId, channel, external_id: externalId },
    })
    .select("id")
    .single();

  // 7. Dispara hook (não sobrescreve runId com resposta)
  try {
    await dispatchAgentHook({
      instance,
      message: promptMsg,
      name: "panel_chat",
      metadata: {
        thread_id: threadId,
        user_email: user.email,
        run_id: runId,
        channel,
        external_id: externalId,
      },
      timeoutSeconds: 180,
      abortMs: 30_000,
    });
  } catch (err) {
    const msg = String(err);
    await supabase
      .from("chat_messages")
      .update({ status: "error", metadata: { error: msg, runId, channel, external_id: externalId } })
      .eq("id", marcosMsg?.id ?? userMsg.id);
    const friendly = msg.includes("502")
      ? "Lívia está offline — o túnel da VPS caiu. Reinicie o agente na VPS ou verifique em /settings."
      : `Falha ao contatar Lívia: ${msg}`;
    return errorResponse(friendly, 503);
  }

  return jsonResponse({
    message_id: userMsg.id,
    placeholder_id: marcosMsg?.id ?? null,
    run_id: runId,
  });
});
