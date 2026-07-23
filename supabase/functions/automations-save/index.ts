/**
 * POST /automations-save
 * Cria ou atualiza uma automação do usuário.
 * Auth: JWT Supabase.
 */
import {
  adminClient,
  corsHeaders,
  errorResponse,
  jsonResponse,
} from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VALID_TRIGGER_TYPES = ["cron", "metric", "manual"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
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

  let body: {
    id?: string;
    name?: string;
    description?: string;
    trigger?: Record<string, unknown>;
    conditions?: unknown[];
    actions?: unknown[];
    active?: boolean;
    require_confirmation?: boolean;
    template_key?: string;
  };

  try {
    body = await req.json();
  } catch {
    return errorResponse("Body JSON inválido", 400);
  }

  // Validação
  if (!body.name) {
    return errorResponse("name obrigatório", 400);
  }

  const triggerType = (body.trigger as Record<string, unknown>)?.type as string;
  if (body.trigger && !VALID_TRIGGER_TYPES.includes(triggerType)) {
    return errorResponse(
      `trigger.type deve ser um de: ${VALID_TRIGGER_TYPES.join(", ")}`,
      400,
    );
  }

  const supabase = adminClient();

  const record = {
    name: body.name,
    description: body.description || "",
    trigger: body.trigger || { type: "manual" },
    conditions: body.conditions || [],
    actions: body.actions || [],
    active: body.active ?? true,
    require_confirmation: body.require_confirmation ?? true,
    template_key: body.template_key || null,
    updated_at: new Date().toISOString(),
  };

  if (body.id) {
    // UPDATE — single-tenant, sem checagem de user_id
    const { data: existing } = await supabase
      .from("automations")
      .select("id")
      .eq("id", body.id)
      .maybeSingle();

    if (!existing) {
      return errorResponse("Automação não encontrada", 404);
    }

    const { data, error } = await supabase
      .from("automations")
      .update(record)
      .eq("id", body.id)
      .select()
      .single();

    if (error) {
      return errorResponse(`Erro ao atualizar: ${error.message}`, 500);
    }

    return jsonResponse(data);
  } else {
    // INSERT (single-tenant)
    const { data, error } = await supabase
      .from("automations")
      .insert(record)
      .select()
      .single();

    if (error) {
      return errorResponse(`Erro ao criar: ${error.message}`, 500);
    }

    return jsonResponse(data, 201);
  }
});
