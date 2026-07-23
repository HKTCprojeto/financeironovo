/**
 * GET /automations-templates-list
 * Retorna templates de automações pré-prontas.
 * Auth: JWT Supabase.
 */
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TEMPLATES = [
  {
    template_key: "weekly_cash_report",
    name: "Relatório semanal de caixa",
    description:
      "Toda segunda às 9h, envia resumo do caixa projetado para os próximos 30 dias.",
    trigger: { type: "cron", expression: "0 9 * * 1" },
    conditions: [],
    actions: [
      { type: "send_report", report_type: "cash", deliver_to: "owner" },
    ],
    require_confirmation: false,
    active: true,
  },
  {
    template_key: "auto_collect_overdue",
    name: "Cobrança automática inadimplentes 15d+",
    description:
      "Todo dia às 10h, lista inadimplentes com >15 dias e pede confirmação para cobrar.",
    trigger: { type: "cron", expression: "0 10 * * *" },
    conditions: [{ field: "overdue_days", op: "gte", value: 15 }],
    actions: [
      {
        type: "cobranca_send",
        customer_id: "{customer_id}",
        message:
          "Olá! Identificamos uma pendência em seu cadastro. Por favor, regularize seu pagamento.",
      },
    ],
    require_confirmation: true,
    active: false,
  },
  {
    template_key: "crm_update_won_deals",
    name: "Atualiza CRM quando fatura paga",
    description:
      "A cada 30 minutos, verifica faturas pagas e atualiza deal para 'Ganho' no CRM.",
    trigger: { type: "cron", expression: "*/30 * * * *" },
    conditions: [],
    actions: [
      {
        type: "crm_update_deal",
        deal_id: "{deal_id}",
        fields: { stage: "Won" },
      },
    ],
    require_confirmation: true,
    active: false,
  },
  {
    template_key: "stale_deals_reminder",
    name: "Lembrete deals parados +7 dias",
    description:
      "Toda terça às 9h, envia lista de deals sem atividade há mais de 7 dias.",
    trigger: { type: "cron", expression: "0 9 * * 2" },
    conditions: [{ field: "days_without_activity", op: "gte", value: 7 }],
    actions: [
      {
        type: "send_whatsapp",
        to: "owner",
        template:
          "⚠️ *Deals parados*: os seguintes negócios estão há mais de 7 dias sem atividade: {stale_deals_list}",
      },
    ],
    require_confirmation: false,
    active: true,
  },
  {
    template_key: "cash_flow_alert",
    name: "Alerta de caixa baixo",
    description:
      "Quando caixa cair abaixo de R$ 50.000, envia alerta imediato pelo WhatsApp.",
    trigger: {
      type: "metric",
      metric: "balance_brl",
      operator: "lt",
      value: 50000,
    },
    conditions: [],
    actions: [
      {
        type: "send_whatsapp",
        to: "owner",
        template:
          "🚨 *Alerta CFO*: Caixa em R$ {balance_brl} — abaixo do limite de R$ 50.000. Ação necessária!",
      },
    ],
    require_confirmation: false,
    active: true,
  },
  {
    template_key: "weekly_overdue_report",
    name: "Top devedores semanal",
    description:
      "Toda sexta às 9h, envia relatório de inadimplência com top 10 devedores.",
    trigger: { type: "cron", expression: "0 9 * * 5" },
    conditions: [],
    actions: [
      { type: "send_report", report_type: "cobranca", deliver_to: "owner" },
    ],
    require_confirmation: false,
    active: true,
  },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return errorResponse("Authorization header obrigatório", 401);
  }

  const anonKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) {
    return errorResponse("Configuração do painel incompleta", 500);
  }

  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();
  if (userError || !user) {
    return errorResponse("JWT inválido ou expirado", 401);
  }

  return jsonResponse(TEMPLATES);
});
