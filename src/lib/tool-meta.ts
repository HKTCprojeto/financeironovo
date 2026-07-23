/**
 * Mapeia nomes técnicos de tools (chamadas pelo Marcos) → label/ícone amigável.
 * Usado no chat pra mostrar pílulas legíveis quando Marcos chama tools.
 */

export type ToolMeta = {
  icon: string;
  label: string;
  color: string; // tailwind text/bg class hint
};

const PREFIXES: Array<{ match: RegExp; meta: ToolMeta }> = [
  { match: /^hubspot[_.-]/i, meta: { icon: "🟧", label: "HubSpot", color: "orange" } },
  { match: /^asaas[_.-]/i, meta: { icon: "💰", label: "Asaas", color: "green" } },
  { match: /^bling[_.-]/i, meta: { icon: "🔵", label: "Bling", color: "blue" } },
  { match: /^contaazul[_.-]/i, meta: { icon: "🔷", label: "ContaAzul", color: "sky" } },
  { match: /^mercado[_.-]?livre[_.-]/i, meta: { icon: "🟡", label: "Mercado Livre", color: "yellow" } },
  { match: /^nuvemshop[_.-]/i, meta: { icon: "🛒", label: "Nuvemshop", color: "indigo" } },
  { match: /^omie[_.-]/i, meta: { icon: "📊", label: "Omie", color: "emerald" } },
  { match: /^pipedrive[_.-]/i, meta: { icon: "🟢", label: "Pipedrive", color: "green" } },
  { match: /^supabase[_.-].*execute_sql/i, meta: { icon: "🗄️", label: "SQL no Supabase", color: "violet" } },
  { match: /^supabase[_.-]/i, meta: { icon: "🗄️", label: "Supabase", color: "violet" } },
  { match: /^evolution[_.-]|^whatsapp[_.-]/i, meta: { icon: "💬", label: "WhatsApp", color: "green" } },
];

const EXACT: Record<string, ToolMeta> = {
  bash: { icon: "🖥️", label: "Terminal", color: "slate" },
  shell: { icon: "🖥️", label: "Terminal", color: "slate" },
  read: { icon: "📄", label: "Ler arquivo", color: "slate" },
  write: { icon: "✏️", label: "Escrever arquivo", color: "slate" },
  edit: { icon: "✏️", label: "Editar arquivo", color: "slate" },
  fetch: { icon: "🌐", label: "HTTP", color: "blue" },
  web_search: { icon: "🔎", label: "Busca web", color: "blue" },
  panel_reply: { icon: "📨", label: "Responder painel", color: "primary" },
};

export function getToolMeta(name: string): ToolMeta {
  if (!name) return { icon: "🔧", label: "Ferramenta", color: "slate" };
  const exact = EXACT[name.toLowerCase()];
  if (exact) return exact;
  for (const { match, meta } of PREFIXES) {
    if (match.test(name)) return meta;
  }
  // fallback: tenta mostrar o nome cru bonito
  const pretty = name.replace(/[_.-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { icon: "🔧", label: pretty, color: "slate" };
}
