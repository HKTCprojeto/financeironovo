import { adminClient, corsHeaders, errorResponse, jsonResponse, validatePanelToken } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);
  if (!(await validatePanelToken(req))) return errorResponse("Token inválido", 401);

  const url = new URL(req.url);
  const channel = (url.searchParams.get("channel") ?? "").trim();
  const external_id = (url.searchParams.get("external_id") ?? "").trim();

  if (!channel || !external_id) {
    return errorResponse("channel e external_id são obrigatórios", 400);
  }

  const supabase = adminClient();
  const { data } = await supabase
    .from("chat_messages")
    .select("thread_id, metadata")
    .eq("channel", channel)
    .eq("role", "marcos")
    .eq("status", "pending")
    .filter("metadata->>external_id", "eq", external_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return jsonResponse({ thread_id: null, run_id: null }, 200);
  }

  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const run_id = (meta.runId as string) ?? (meta.run_id as string) ?? null;

  return jsonResponse({ thread_id: data.thread_id, run_id }, 200);
});
