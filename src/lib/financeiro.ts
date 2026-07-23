// Núcleo de domínio do módulo Financeiro — portado fielmente do index.html legado.
// Regra de ouro do projeto: valores sempre reais, sempre em centavos inteiros (nunca float de dinheiro).

export type Natureza = "fixa" | "variavel";
export type Escopo = "categoria" | "totalFixas" | "totalVariaveis" | "totalGeral";
export type ModoTrava = "hard" | "soft";

export interface Categoria {
  id: string;
  nome: string;
  natureza: Natureza;
  cor: string;
  teto_padrao_centavos: number | null;
  arquivada: boolean;
}

export interface Despesa {
  id: string;
  descricao: string;
  amount_cents: number;
  tipo: Natureza;
  categoria_id: string | null;
  mes_ref: string; // 'YYYY-MM'
  data: string; // 'YYYY-MM-DD'
  justificativa: string | null;
  excluido: boolean;
}

export interface Limite {
  id: string;
  escopo: Escopo;
  alvo: string | null; // categoria_id quando escopo = 'categoria'
  limite_centavos: number;
  modo: ModoTrava;
  limiar_hard_pct: number | null;
  alertas_pct: number[];
}

export const MAX_CENTS = 99999999999; // R$ 999.999.999,99

// ---------- datas / mês ----------
export function ymLocal(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
export function mesAtual(): string {
  return ymLocal(new Date());
}
export function shiftMes(ym: string, delta: number): string {
  const p = ym.split("-");
  const d = new Date(Number(p[0]), Number(p[1]) - 1 + delta, 1);
  return ymLocal(d);
}
export function mesLabel(ym: string): string {
  const p = ym.split("-");
  const d = new Date(Number(p[0]), Number(p[1]) - 1, 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(d);
}

// ---------- moeda ----------
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatCents(c: number | null | undefined): string {
  return fmtBRL.format((c || 0) / 100);
}

// parse robusto de moeda BRL -> centavos inteiros (ou null). Rejeita milhar malformado,
// >2 casas decimais e entradas sem dígitos. (Idêntico ao legado.)
export function parseBRLToCents(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  let s = String(input).replace(/ /g, " ").replace(/R\$/gi, "").trim().replace(/\s/g, "");
  if (!s) return null;
  if (!/^[0-9.,]+$/.test(s)) return null;
  const hasComma = s.indexOf(",") >= 0;
  const hasDot = s.indexOf(".") >= 0;
  let norm: string;
  let dec: string | undefined;
  if (hasComma && hasDot) {
    if ((s.match(/,/g) || []).length > 1) return null;
    dec = s.split(",")[1];
    if (dec && dec.length > 2) return null;
    norm = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    if ((s.match(/,/g) || []).length > 1) return null;
    dec = s.split(",")[1];
    if (dec && dec.length > 2) return null;
    norm = s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length !== 3) {
      if (parts[1].length > 2) return null;
      norm = s;
    } else {
      if (parts[0].length < 1 || parts[0].length > 3) return null;
      for (let i = 1; i < parts.length; i++) {
        if (parts[i].length !== 3) return null;
      }
      norm = s.replace(/\./g, "");
    }
  } else {
    norm = s;
  }
  if (!/[0-9]/.test(norm)) return null;
  const num = Number(norm);
  if (!Number.isFinite(num) || num < 0) return null;
  const cents = Math.round(num * 100);
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_CENTS) return null;
  return cents;
}

// ---------- núcleo de cálculo ----------
export function despesasMes(despesas: Despesa[], ym: string): Despesa[] {
  return despesas.filter((d) => !d.excluido && d.mes_ref === ym);
}

export function gastoEscopo(
  despesas: Despesa[],
  escopo: Escopo,
  alvo: string | null,
  ym: string,
  excludeId?: string | null,
): number {
  return despesasMes(despesas, ym).reduce((acc, d) => {
    if (excludeId && d.id === excludeId) return acc;
    let pert = false;
    if (escopo === "categoria") pert = d.categoria_id === alvo;
    else if (escopo === "totalFixas") pert = d.tipo === "fixa";
    else if (escopo === "totalVariaveis") pert = d.tipo === "variavel";
    else if (escopo === "totalGeral") pert = true;
    return pert ? acc + (d.amount_cents || 0) : acc;
  }, 0);
}

export function limiteSeAplica(lim: Limite, categoriaId: string | null, natureza: Natureza): boolean {
  if (lim.escopo === "categoria") return lim.alvo === categoriaId;
  if (lim.escopo === "totalFixas") return natureza === "fixa";
  if (lim.escopo === "totalVariaveis") return natureza === "variavel";
  if (lim.escopo === "totalGeral") return true;
  return false;
}

export function escopoLabel(lim: Limite, catById: (id: string) => Categoria | undefined): string {
  if (lim.escopo === "categoria") {
    const c = lim.alvo ? catById(lim.alvo) : undefined;
    return c ? c.nome : "Categoria removida";
  }
  if (lim.escopo === "totalFixas") return "Total de gastos fixos";
  if (lim.escopo === "totalVariaveis") return "Total de gastos variáveis";
  if (lim.escopo === "totalGeral") return "Total geral do mês";
  return lim.escopo;
}

export interface InfoTrava {
  lim: Limite;
  gasto: number;
  projetado: number;
  folga: number;
  excedente: number;
  limiteEfetivo: number;
  escalado: boolean;
}
export interface ResultadoTravas {
  bloqueia: boolean;
  bloqueios: InfoTrava[];
  avisos: InfoTrava[];
  maxCabe: number | null;
}

// motor de travas — projetado = gasto (excluindo a própria despesa em edição) + valorNovo
export function avaliarTravas(
  limites: Limite[],
  despesas: Despesa[],
  ctx: { categoriaId: string | null; natureza: Natureza; ym: string; valorNovo: number; despesaId?: string | null },
): ResultadoTravas {
  const bloqueios: InfoTrava[] = [];
  const avisos: InfoTrava[] = [];
  limites.forEach((lim) => {
    if (!limiteSeAplica(lim, ctx.categoriaId, ctx.natureza)) return;
    const gasto = gastoEscopo(despesas, lim.escopo, lim.alvo, ctx.ym, ctx.despesaId || null);
    const projetado = gasto + ctx.valorNovo;
    if (projetado <= lim.limite_centavos) return; // igualdade exata é permitida
    const info: InfoTrava = {
      lim,
      gasto,
      projetado,
      folga: Math.max(0, lim.limite_centavos - gasto),
      excedente: projetado - lim.limite_centavos,
      limiteEfetivo: lim.limite_centavos,
      escalado: false,
    };
    if (lim.modo === "hard") {
      bloqueios.push(info);
    } else {
      const limiarHard = lim.limiar_hard_pct != null ? lim.limite_centavos * (lim.limiar_hard_pct / 100) : null;
      if (limiarHard != null && projetado > limiarHard) {
        info.escalado = true;
        info.limiteEfetivo = limiarHard;
        info.folga = Math.max(0, limiarHard - gasto);
        info.excedente = projetado - limiarHard;
        bloqueios.push(info);
      } else {
        avisos.push(info);
      }
    }
  });
  bloqueios.sort((a, b) => a.folga - b.folga);
  avisos.sort((a, b) => b.excedente - a.excedente);
  const maxCabe = bloqueios.length ? Math.min(...bloqueios.map((b) => b.folga)) : null;
  return { bloqueia: bloqueios.length > 0, bloqueios, avisos, maxCabe };
}

export type EstadoSemaforo = "ok" | "warn" | "danger";
export interface EstadoLimite {
  gasto: number;
  teto: number;
  pct: number;
  estado: EstadoSemaforo;
  resta: number;
}

// estado do semáforo — teto exato NÃO é estouro (coerente com a trava que permite a igualdade)
export function estadoLimite(lim: Limite, despesas: Despesa[], ym: string): EstadoLimite {
  const gasto = gastoEscopo(despesas, lim.escopo, lim.alvo, ym, null);
  const teto = lim.limite_centavos;
  const pct = teto > 0 ? (gasto * 100) / teto : gasto > 0 ? 999 : 0;
  const menorAlerta = lim.alertas_pct && lim.alertas_pct.length ? Math.min(...lim.alertas_pct) : 80;
  let estado: EstadoSemaforo;
  if (teto === 0) estado = gasto > 0 ? "danger" : "ok";
  else if (gasto > teto) estado = "danger";
  else if (pct >= menorAlerta) estado = "warn";
  else estado = "ok";
  return { gasto, teto, pct, estado, resta: teto - gasto };
}
