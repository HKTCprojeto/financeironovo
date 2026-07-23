/**
 * POST /cfo-write-event
 * Registra um write executado por Marcos (create_payable, pay_payable, etc.).
 * Auth: X-Panel-Token.
 * Body: { channel, thread_id, run_id?, action, erp?, erp_record_id?, amount?, supplier?,
 *         due_date?, category?, raw_text?, dedup_key?, status?, error?, confirmed_at?,
 *         instance_id? }
 * Returns: { id, dedup_key, duplicate: bool }
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse, validatePanelToken } from "../_shared/auth.ts";

function makeDedupeKey(body: Record<string, unknown>): string {
  const parts = [
    body.thread_id ?? "",
    String(body.amount ?? ""),
    String(body.supplier ?? ""),
    String(body.due_date ?? ""),
  ].join("|");
  let h = 0;
  for (let i = 0; i < parts.length; i++) {
    h = (Math.imul(31, h) + parts.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);
  if (!(await validatePanelToken(req))) return errorResponse("Token inválido", 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return errorResponse("Body JSON inválido", 400); }

  for (const f of ["channel", "thread_id", "action"]) {
    if (!body[f]) return errorResponse(`Campo obrigatório: ${f}`, 400);
  }

  const dedup_key = (body.dedup_key as string) || makeDedupeKey(body);
  const supabase = adminClient();

  const { data: existing } = await supabase
    .from("cfo_write_events")
    .select("id")
    .eq("dedup_key", dedup_key)
    .maybeSingle();

  if (existing) {
    return jsonResponse({ id: existing.id, dedup_key, duplicate: true }, 200);
  }

  const { data: record, error } = await supabase
    .from("cfo_write_events")
    .insert({
      instance_id: (body.instance_id as string) ?? null,
      channel: body.channel as string,
      thread_id: body.thread_id as string,
      run_id: (body.run_id as string) ?? null,
      action: body.action as string,
      erp: (body.erp as string) ?? null,
      erp_record_id: (body.erp_record_id as string) ?? null,
      amount: body.amount != null ? Number(body.amount) : null,
      supplier: (body.supplier as string) ?? null,
      due_date: (body.due_date as string) ?? null,
      category: (body.category as string) ?? null,
      raw_text: (body.raw_text as string) ?? null,
      dedup_key,
      status: (body.status as string) ?? "success",
      error: (body.error as string) ?? null,
      confirmed_at: (body.confirmed_at as string) ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !record) {
    return errorResponse(error?.message ?? "Insert falhou", 500);
  }

  return jsonResponse({ id: record.id, dedup_key, duplicate: false }, 201);
});
