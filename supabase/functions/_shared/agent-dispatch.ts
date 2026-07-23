/**
 * _shared/agent-dispatch.ts
 * Helpers compartilhados entre chat-send-message e incoming-message para
 * disparar o agente Marcos via /hooks/agent na VPS.
 */
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type FreshInstance = {
  id: string;
  ingress_url: string;
  hooks_token: string;
  last_heartbeat: string | null;
};

const FRESH_MS = 5 * 60 * 1000;

/**
 * Retorna a instância VPS mais recente com heartbeat fresco (< 5min).
 * Retorna null se não houver instância ou heartbeat estiver velho.
 */
export async function resolveFreshInstance(
  supabase: SupabaseClient,
): Promise<FreshInstance | null> {
  const { data: instance } = await supabase
    .from("instances")
    .select("id, ingress_url, hooks_token, last_heartbeat")
    .not("ingress_url", "is", null)
    .not("hooks_token", "is", null)
    .order("last_heartbeat", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!instance?.ingress_url || !instance?.hooks_token) return null;
  const lastHb = instance.last_heartbeat
    ? new Date(instance.last_heartbeat).getTime()
    : 0;
  if (Date.now() - lastHb >= FRESH_MS) return null;
  return instance as FreshInstance;
}

/**
 * Monta o bloco de contexto de ferramentas (MCP supabase + skills com credenciais).
 * Versão detalhada com tools list para o agente saber o que pode usar.
 */
export async function buildToolContext(
  supabase: SupabaseClient,
): Promise<string> {
  const { data: supabaseProjects } = await supabase
    .from("supabase_projects")
    .select("name, project_url")
    .eq("active", true);
  const { data: integrationCreds } = await supabase
    .from("integration_credentials")
    .select("skill_name")
    .eq("active", true);

  const slugify = (s: string) =>
    s.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const supaCtx = (supabaseProjects ?? []).map((p) =>
    `- supabase_${slugify(p.name)} (${p.name}): MCP server oficial Supabase em ${p.project_url}. Tools: execute_sql, list_tables, list_extensions, get_advisors, apply_migration, deploy_edge_function, get_logs, get_project_url, list_organizations, etc.`
  ).join("\n");
  const integCtx = (integrationCreds ?? []).map((c) =>
    `- skill ${c.skill_name}: scripts em $HOME/.openclaw/workspace/skills/${c.skill_name}/`
  ).join("\n");

  if (!supaCtx && !integCtx) return "";

  return `

CONTEXTO — FERRAMENTAS DISPONÍVEIS AGORA:
${supaCtx ? "\n[MCP servers Supabase conectados pelo dono — use essas tools pra responder perguntas sobre os bancos do dono]\n" + supaCtx : ""}${integCtx ? "\n[Integrações com credenciais ativas — use os scripts/clients locais]\n" + integCtx : ""}

`;
}

/**
 * Dispara o agente via /hooks/agent. Não aguarda a resposta completa
 * (o agente responde via panel_post_reply.sh → chat-marcos-reply).
 */
export async function dispatchAgentHook(opts: {
  instance: FreshInstance;
  message: string;
  name: string;
  metadata: Record<string, unknown>;
  timeoutSeconds?: number;
  abortMs?: number;
}): Promise<void> {
  const { instance, message, name, metadata, timeoutSeconds = 180, abortMs = 20_000 } = opts;
  const resp = await fetch(`${instance.ingress_url}/hooks/agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${instance.hooks_token}`,
    },
    body: JSON.stringify({
      message,
      name,
      wakeMode: "now",
      deliver: false,
      timeoutSeconds,
      metadata,
    }),
    signal: AbortSignal.timeout(abortMs),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`hook ${resp.status}: ${text}`);
  }
}
