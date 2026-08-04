/**
 * Exportação de tabelas para XLSX formatado.
 *
 * CSV foi descartado de propósito: abre como texto cru, sem largura de coluna
 * nem formato de moeda, e o arquivo vai parar na mão da diretoria.
 *
 * Números são gravados como número, não como texto já formatado — quem receber
 * precisa conseguir somar e filtrar no Excel. A formatação vai no `numFmt` da
 * célula, que é o jeito certo: o dado continua sendo dado.
 *
 * O exceljs (~1 MB) entra por import dinâmico, então só é baixado por quem
 * clica em exportar.
 */

export type FormatoColuna = "moeda" | "data" | "inteiro" | "percentual" | "texto";

export type ColunaXlsx = {
  cabecalho: string;
  chave: string;
  largura?: number;
  formato?: FormatoColuna;
};

export type AbaXlsx = {
  nome: string;
  colunas: ColunaXlsx[];
  linhas: Array<Record<string, unknown>>;
  /** Chaves que ganham soma na última linha. */
  totalizar?: string[];
};

const NUM_FMT: Record<FormatoColuna, string | undefined> = {
  moeda: 'R$ #,##0.00',
  data: "dd/mm/yyyy",
  inteiro: "#,##0",
  percentual: '0.0"%"',
  texto: undefined,
};

const AZUL = "FF3F4BB3"; // mesmo roxo/azul do cabeçalho dos e-mails e do logo

/** Excel recusa >31 chars e alguns símbolos no nome da aba. */
function nomeAbaValido(nome: string): string {
  return nome.replace(/[[\]:*?/\\]/g, "-").slice(0, 31);
}

export async function exportarXlsx(opts: {
  arquivo: string;
  titulo: string;
  subtitulo?: string;
  abas: AbaXlsx[];
}): Promise<void> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Agente CFO — HKTC";
  wb.created = new Date();

  for (const aba of opts.abas) {
    const ws = wb.addWorksheet(nomeAbaValido(aba.nome), {
      views: [{ state: "frozen", ySplit: 3 }], // título + subtítulo + cabeçalho
    });

    const nCols = aba.colunas.length;

    // --- título e subtítulo, mesclados na largura da tabela ---
    ws.mergeCells(1, 1, 1, nCols);
    const cTitulo = ws.getCell(1, 1);
    cTitulo.value = opts.titulo;
    cTitulo.font = { bold: true, size: 14 };
    cTitulo.alignment = { vertical: "middle" };
    ws.getRow(1).height = 22;

    ws.mergeCells(2, 1, 2, nCols);
    const cSub = ws.getCell(2, 1);
    cSub.value = opts.subtitulo ?? "";
    cSub.font = { size: 10, color: { argb: "FF6B7280" } };

    // --- cabeçalho ---
    const linhaCab = ws.getRow(3);
    aba.colunas.forEach((col, i) => {
      const c = linhaCab.getCell(i + 1);
      c.value = col.cabecalho;
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL } };
      c.alignment = { vertical: "middle", horizontal: numerica(col) ? "right" : "left" };
    });
    linhaCab.height = 18;

    // --- dados ---
    aba.linhas.forEach((linha) => {
      const r = ws.addRow(aba.colunas.map((col) => valorCelula(linha[col.chave], col.formato)));
      aba.colunas.forEach((col, i) => {
        const c = r.getCell(i + 1);
        const fmt = NUM_FMT[col.formato ?? "texto"];
        if (fmt) c.numFmt = fmt;
        if (numerica(col)) c.alignment = { horizontal: "right" };
      });
    });

    // --- linha de total ---
    if (aba.totalizar?.length) {
      const valores = aba.colunas.map((col) => {
        if (!aba.totalizar?.includes(col.chave)) return null;
        return aba.linhas.reduce((s, l) => s + (Number(l[col.chave]) || 0), 0);
      });
      valores[0] = `Total (${aba.linhas.length})` as unknown as number;
      const r = ws.addRow(valores);
      aba.colunas.forEach((col, i) => {
        const c = r.getCell(i + 1);
        c.font = { bold: true };
        c.border = { top: { style: "thin", color: { argb: "FF9CA3AF" } } };
        const fmt = NUM_FMT[col.formato ?? "texto"];
        if (fmt && aba.totalizar?.includes(col.chave)) c.numFmt = fmt;
        if (numerica(col)) c.alignment = { horizontal: "right" };
      });
    }

    // --- largura e filtro ---
    aba.colunas.forEach((col, i) => {
      ws.getColumn(i + 1).width = col.largura ?? larguraAuto(col, aba.linhas);
    });
    if (aba.linhas.length > 0) {
      ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: nCols } };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  baixar(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    opts.arquivo,
  );
}

function numerica(col: ColunaXlsx): boolean {
  return col.formato === "moeda" || col.formato === "inteiro" || col.formato === "percentual";
}

/** Converte para o tipo que o Excel entende — Date para data, number para o resto. */
function valorCelula(v: unknown, formato?: FormatoColuna): string | number | Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (formato === "data") {
    const s = String(v);
    // ISO (yyyy-mm-dd) montado como data local, senão o fuso puxa um dia atrás
    const [a, m, d] = s.slice(0, 10).split("-").map(Number);
    return a && m && d ? new Date(a, m - 1, d) : s;
  }
  if (formato === "moeda" || formato === "inteiro" || formato === "percentual") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return String(v);
}

/** Largura pelo conteúdo mais longo, com piso e teto para não ficar grotesco. */
function larguraAuto(col: ColunaXlsx, linhas: Array<Record<string, unknown>>): number {
  const maior = linhas.reduce((max, l) => {
    const s = String(l[col.chave] ?? "");
    return Math.max(max, s.length);
  }, col.cabecalho.length);
  return Math.min(45, Math.max(10, maior + 3));
}

function baixar(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
