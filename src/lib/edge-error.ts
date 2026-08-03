/**
 * Mensagem de erro real de uma Edge Function.
 *
 * Quando a função responde 4xx/5xx, o supabase-js entrega um FunctionsHttpError
 * cujo `message` é sempre o mesmo texto inútil ("Edge Function returned a
 * non-2xx status code"). O corpo da resposta — onde está o motivo de verdade,
 * no formato `{ error: "..." }` que o errorResponse() do _shared/auth.ts
 * produz — fica escondido em `error.context`, que é a Response original.
 *
 * Sem isto, mensagens como "Lívia está offline — sua VPS não está conectada"
 * nunca chegam na tela.
 */
export async function mensagemErroEdge(error: unknown): Promise<string> {
  const generica =
    error instanceof Error ? error.message : String(error ?? "Erro desconhecido");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (error as any)?.context;
  if (!ctx || typeof ctx.json !== "function") return generica;
  try {
    const corpo = await ctx.json();
    return corpo?.error || generica;
  } catch {
    return generica; // corpo não é JSON — fica a genérica mesmo
  }
}
