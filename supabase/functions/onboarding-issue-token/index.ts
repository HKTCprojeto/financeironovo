/**
 * POST /onboarding-issue-token
 * Auth: JWT do user. Gera token one-time pra setup-installer.
 * Lê o user_onboarding.data e congela como metadata do token.
 */
import { adminClient, corsHeaders, errorResponse, jsonResponse } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function genToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse("Auth obrigatória", 401);

  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return errorResponse("JWT inválido", 401);

  const admin = adminClient();
  const { data: onb } = await admin
    .from("user_onboarding")
    .select("data")
    .eq("user_id", user.id)
    .maybeSingle();

  const token = genToken();
  const { error } = await admin.from("installer_tokens").insert({
    token,
    user_id: user.id,
    metadata: onb?.data ?? {},
  });
  if (error) return errorResponse(error.message, 500);

  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const installerUrl = `${baseUrl}/functions/v1/setup-installer?token=${token}`;
  return jsonResponse({ token, installer_url: installerUrl, expires_in_minutes: 30 });
});
