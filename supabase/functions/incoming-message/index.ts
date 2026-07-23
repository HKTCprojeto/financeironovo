/**
 * POST /incoming-message
 * Ponto único de entrada pra mensagens externas (WhatsApp, Telegram).
 * Auth: secret específico do canal validado contra DB. verify_jwt=false.
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import {
  buildToolContext,
  dispatchAgentHook,
  resolveFreshInstance,
} from "../_shared/agent-dispatch.ts";

type Body = { channel?: string; external_id?: string; text?: string; secret?: string; };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: Body;
  try { body = await req.json(); } catch { return errorResponse("Body inválido", 400); }

  const channel = String(body.channel ?? "").trim();
  const externalId = String(body.external_id ?? "").trim();
  const text = String(body.text ?? "").trim();
  const secret = String(body.secret ?? "");

  if (!channel || !externalId || !text || !secret) {
    return errorResponse("channel, external_id, text e secret são obrigatórios", 400);
  }
  if (text.length > 4000) return errorResponse("text muito longo", 400);

  const supabase = adminClient();

  let channelLabel = "";
  if (channel.startsWith("whatsapp:")) {
    const instanceName = channel.slice("whatsapp:".length);
    if (!instanceName) return errorResponse("instance vazio", 400);
    const { data: cfg } = await supabase.from("evolution_config").select("webhook_secret, active").limit(1).maybeSingle();
    if (!cfg || !cfg.active) return errorResponse("Evolution não configurada/ativa", 404);
    if (cfg.webhook_secret !== secret) return errorResponse("Invalid secret", 401);
    const { data: wa } = await supabase.from("whatsapp_instances").select("display_name, receives_marcos_chat").eq("instance_name", instanceName).maybeSingle();
    if (!wa) return jsonResponse({ ok: true, ignored: "unknown_instance" });
    if (!wa.receives_marcos_chat) return jsonResponse({ ok: true, ignored: "not_subscribed" });
    channelLabel = `WhatsApp ${instanceName}${wa.display_name ? ` (${wa.display_name})` : ""}`;
  } else if (channel.startsWith("telegram:")) {
    const botUsername = channel.slice("telegram:".length);
    if (!botUsername) return errorResponse("bot_username vazio", 400);
    const { data: bot } = await supabase.from("telegram_bots").select("webhook_secret, active, receives_marcos_chat, bot_name").eq("bot_username", botUsername).maybeSingle();
    if (!bot || !bot.active) return errorResponse("Bot Telegram não configurado/ativo", 404);
    if (bot.webhook_secret !== secret) return errorResponse("Invalid secret", 401);
    if (!bot.receives_marcos_chat) return jsonResponse({ ok: true, ignored: "not_subscribed" });
    channelLabel = `Telegram @${botUsername}${bot.bot_name ? ` (${bot.bot_name})` : ""}`;
  } else {
    return errorResponse(`Canal não suportado: ${channel}`, 400);
  }

  const threadId = `${channel}:${externalId}`;

  const { data: userMsg, error: userMsgErr } = await supabase.from("chat_messages").insert({
    thread_id: threadId, role: "user", content: text, status: "sent", channel,
  }).select("id").single();
  if (userMsgErr || !userMsg) return errorResponse(userMsgErr?.message ?? "insert fail", 500);

  const instance = await resolveFreshInstance(supabase);
  if (!instance) {
    await supabase.from("chat_messages").update({ status: "error", metadata: { error: "no_vps_instance" } }).eq("id", userMsg.id);
    return jsonResponse({ ok: true, warn: "no_vps" });
  }

  const contextBlock = await buildToolContext(supabase);

  // Histórico recente do thread (cross-turn context — hooks são stateless)
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

  // Detecta write pendente do turn anterior (fallback via metadata)
  let pendingWriteBlock = "";
  const { data: pendingMsg } = await supabase.from("chat_messages")
    .select("metadata").eq("thread_id", threadId).eq("role", "marcos")
    .not("metadata->>pending_write", "is", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (pendingMsg?.metadata?.pending_write) {
    const pw = pendingMsg.metadata.pending_write as Record<string, unknown>;
    const expiresRaw = pw.expires_at as string | undefined;
    const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
    if (!expiresAt || expiresAt > new Date()) {
      pendingWriteBlock = `\n\n⚠️ WRITE PENDENTE DO TURN ANTERIOR — AGUARDANDO CONFIRMAÇÃO:\n${JSON.stringify(pw, null, 2)}\nSe o usuário responder SIM, execute. Se NÃO ou ambíguo, cancele e informe.`;
    }
  }

  const runId = `inc_${Date.now()}_${userMsg.id}`;
  const promptMsg = `[INCOMING_MESSAGE]
Canal: ${channelLabel}
Phone/Chat: ${externalId}
Usuário: ${text}
${contextBlock}${historyBlock}${pendingWriteBlock}
Você é Marcos, CFO virtual. Leia e siga rigorosamente:
  $HOME/.openclaw/workspace/skills/agente-cfo/prompts/conversa.md

CANAL ATIVO: ${channel} — RESPONDA SEMPRE NESTE CANAL via panel_post_reply.sh.

## EXTRAÇÃO DE ENTIDADE (few-shot)
Quando o usuário mencionar despesa ou receita sem data, assuma hoje.
Exemplos:
  "gastei 50 com Uber"          → {action:create_payable, amount:50, supplier:Uber, due_date:HOJE, category:Transporte}
  "paguei 200 de aluguel"       → {action:create_payable, amount:200, supplier:Aluguel, due_date:HOJE, category:Aluguel}
  "recebi 1500 do cliente Acme" → {action:create_receivable, amount:1500, customer:Acme, due_date:HOJE, category:Receita}
  "quanto tenho em caixa"       → {action:get_balance} (leitura, sem write)

## PROTOCOLO WRITE (obrigatório)
1. Extraia entidades.
2. SEMPRE mostre rascunho antes de executar:
   "Entendi: R\\$X pago para Y, categoria Z, data DD/MM. Confirma? (SIM/NÃO)"
3. Envie o rascunho via panel_post_reply.sh para o CANAL DE ORIGEM.
4. Aguarde resposta no próximo turn (estado persistido em chat_messages.metadata.pending_write).
5. Só execute create_payable/create_receivable após "SIM" explícito.
6. Após executar: chame panel_write_event.sh e confirme no canal.

## SCRIPT DE WRITE EVENT
  bash \$HOME/.openclaw/workspace/skills/agente-cfo/scripts/panel_write_event.sh \\
    --action "<create_payable|create_receivable|pay_payable>" --erp "<nome_erp>" \\
    --erp_record_id "<id>" --amount "<valor>" --supplier_or_customer "<nome>" \\
    --due_date "<YYYY-MM-DD>" --category "<categoria>" --raw_text "<texto original>" \\
    --thread_id "${threadId}" --run_id "${runId}" --channel "${channel}"

## FORMATO DE CONFIRMAÇÃO FINAL
  "✅ Lançado R\\$X em <ERP> (id=Y), categoria <Z>."
  Se ERP retornar {"error":"not_supported"}: "⚠️ <ERP> não suporta essa operação via API."

## RESPOSTA FINAL — OBRIGATÓRIO (ORDEM CORRETA DOS ARGS)
  bash \$HOME/.openclaw/workspace/skills/agente-cfo/scripts/panel_post_reply.sh "${channel}" "${externalId}" "<sua resposta>" "${threadId}" "${runId}"`;

  const { data: marcosMsg } = await supabase.from("chat_messages").insert({
    thread_id: threadId, role: "marcos", content: "", status: "pending", channel,
    metadata: { runId, channel, external_id: externalId },
  }).select("id").single();

  dispatchAgentHook({
    instance,
    message: promptMsg,
    name: "incoming_message",
    metadata: { thread_id: threadId, run_id: runId, channel, external_id: externalId },
    timeoutSeconds: 180,
    abortMs: 20_000,
  }).catch(async (err) => {
    console.error("hook dispatch failed:", err);
    await supabase.from("chat_messages").update({ status: "error", metadata: { error: String(err) } }).eq("id", marcosMsg?.id ?? userMsg.id);
  });

  return jsonResponse({ ok: true, message_id: userMsg.id, run_id: runId });
});
