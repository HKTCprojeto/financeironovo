/** GET /alerts-list → array de alerts_config */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("alerts_config")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return errorResponse(error.message, 500);
  return jsonResponse(data ?? []);
});
