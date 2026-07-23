/** GET /alerts-history-list?limit=100 → últimas N entries */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("alerts_history")
    .select("id, alert_id, triggered_at, payload, status, resolved_at")
    .order("triggered_at", { ascending: false })
    .limit(limit);
  if (error) return errorResponse(error.message, 500);
  return jsonResponse(data ?? []);
});
