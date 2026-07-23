/** DELETE /alerts-delete?id=<uuid> */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "DELETE") return errorResponse("Method not allowed", 405);

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return errorResponse("id obrigatório", 400);

  const supabase = adminClient();
  const { error } = await supabase.from("alerts_config").delete().eq("id", id);
  if (error) return errorResponse(error.message, 500);
  return jsonResponse({ ok: true });
});
