import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Receipt,
  AlertTriangle,
  Search,
  ListTree,
  Wallet,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  CalendarRange,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatCents } from "@/lib/financeiro";

export const Route = createFileRoute("/_authenticated/pagamentos")({
  head: () => ({ meta: [{ title: "Pagamentos — HKTC" }] }),
  component: PagamentosPage,
});

// ---------- tipos (fin_rubricas / fin_pagamentos ainda não estão nos types gerados) ----------
type Rubrica = {
  codigo: string;
  nome: string;
  nivel1_codigo: string;
  nivel1_nome: string;
  nivel2_codigo: string;
  nivel2_nome: string;
  nivel3_codigo: string;
  nivel3_nome: string;
  ativa: boolean;
};

type Pagamento = {
  id: string;
  departamento: string | null;
  fornecedor: string;
  servico: string | null;
  descricao: string | null;
  valor_centavos: number;
  data_vencimento: string;
  data_pagamento: string | null;
  dia_vencimento: number | null;
  tipo: "fixo" | "variavel";
  periodicidade: string | null;
  status: "previsto" | "a_pagar" | "pago" | "atrasado";
  rubrica_codigo: string;
  conta_contabil: string | null;
  mes_ref: string;
  origem: string;
};

// ---------- data layer ----------
async function fetchPlano() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [rub, pag] = await Promise.all([
    sb.from("fin_rubricas").select("*").order("codigo"),
    sb.from("fin_pagamentos").select("*").order("valor_centavos", { ascending: false }),
  ]);
  if (rub.error) throw rub.error;
  if (pag.error) throw pag.error;
  return {
    rubricas: (rub.data ?? []) as Rubrica[],
    pagamentos: (pag.data ?? []) as Pagamento[],
  };
}

const STATUS_STYLE: Record<Pagamento["status"], { label: string; cls: string }> = {
  previsto: { label: "Previsto", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  a_pagar: { label: "A pagar", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  pago: { label: "Pago", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  atrasado: { label: "Atrasado", cls: "bg-red-100 text-red-800 border-red-200" },
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.split("-").reverse().join("/");
}

const MESES_ABREV = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

// 'YYYY-MM' -> 'Jul/2025'
function fmtMesRef(mes: string): string {
  const [ano, m] = mes.split("-");
  const idx = Number(m) - 1;
  const nome = MESES_ABREV[idx] ?? m;
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${ano}`;
}

// ordem lógica dos status (para ordenação da coluna)
const STATUS_ORDER: Record<Pagamento["status"], number> = {
  atrasado: 0,
  a_pagar: 1,
  previsto: 2,
  pago: 3,
};

type SortKey =
  | "fornecedor"
  | "departamento"
  | "rubrica"
  | "tipo"
  | "data_vencimento"
  | "status"
  | "valor_centavos";
type SortDir = "asc" | "desc";

function PagamentosPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["plano-gerencial"],
    queryFn: fetchPlano,
  });

  const rubricas = data?.rubricas ?? [];
  const pagamentos = data?.pagamentos ?? [];

  // mapa codigo -> nome da rubrica (para exibir nome legível no pagamento)
  const rubricaNome = useMemo(() => {
    const m = new Map<string, string>();
    rubricas.forEach((r) => m.set(r.codigo, r.nome));
    return m;
  }, [rubricas]);

  // filtros de pagamentos
  const [depto, setDepto] = useState<string>("todos");
  const [rubricaFiltro, setRubricaFiltro] = useState<string>("todas");
  const [mesRef, setMesRef] = useState<string>("todos");
  const [buscaPag, setBuscaPag] = useState("");
  const [buscaRub, setBuscaRub] = useState("");

  // ordenação da tabela de pagamentos
  const [sortKey, setSortKey] = useState<SortKey>("valor_centavos");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // valores começam decrescentes; texto/data começam crescentes
      setSortDir(key === "valor_centavos" ? "desc" : "asc");
    }
  }

  const deptos = useMemo(
    () =>
      Array.from(new Set(pagamentos.map((p) => p.departamento).filter(Boolean))).sort() as string[],
    [pagamentos],
  );

  // meses de competência presentes (desc, mais recente primeiro)
  const mesesRef = useMemo(
    () =>
      Array.from(new Set(pagamentos.map((p) => p.mes_ref).filter(Boolean)))
        .sort()
        .reverse() as string[],
    [pagamentos],
  );

  // rubricas presentes nos pagamentos (para o filtro), ordenadas por nome
  const rubricasNosPagamentos = useMemo(() => {
    const codigos = Array.from(new Set(pagamentos.map((p) => p.rubrica_codigo).filter(Boolean)));
    return codigos
      .map((c) => ({ codigo: c, nome: rubricaNome.get(c) ?? c }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [pagamentos, rubricaNome]);

  const pagFiltrados = useMemo(() => {
    const q = buscaPag.trim().toLowerCase();
    const filtrados = pagamentos.filter((p) => {
      if (depto !== "todos" && p.departamento !== depto) return false;
      if (rubricaFiltro !== "todas" && p.rubrica_codigo !== rubricaFiltro) return false;
      if (mesRef !== "todos" && p.mes_ref !== mesRef) return false;
      if (!q) return true;
      return (
        p.fornecedor.toLowerCase().includes(q) ||
        (p.servico ?? "").toLowerCase().includes(q) ||
        (p.descricao ?? "").toLowerCase().includes(q) ||
        (rubricaNome.get(p.rubrica_codigo) ?? "").toLowerCase().includes(q)
      );
    });

    const dir = sortDir === "asc" ? 1 : -1;
    const cmp = (a: Pagamento, b: Pagamento): number => {
      switch (sortKey) {
        case "valor_centavos":
          return (a.valor_centavos - b.valor_centavos) * dir;
        case "status":
          return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * dir;
        case "data_vencimento":
          return a.data_vencimento.localeCompare(b.data_vencimento) * dir;
        case "rubrica": {
          const an = rubricaNome.get(a.rubrica_codigo) ?? a.rubrica_codigo;
          const bn = rubricaNome.get(b.rubrica_codigo) ?? b.rubrica_codigo;
          return an.localeCompare(bn, "pt-BR") * dir;
        }
        case "departamento":
          return (a.departamento ?? "").localeCompare(b.departamento ?? "", "pt-BR") * dir;
        case "tipo":
          return a.tipo.localeCompare(b.tipo) * dir;
        case "fornecedor":
        default:
          return a.fornecedor.localeCompare(b.fornecedor, "pt-BR") * dir;
      }
    };
    return [...filtrados].sort(cmp);
  }, [pagamentos, depto, rubricaFiltro, mesRef, buscaPag, rubricaNome, sortKey, sortDir]);

  const rubFiltradas = useMemo(() => {
    const q = buscaRub.trim().toLowerCase();
    if (!q) return rubricas;
    return rubricas.filter(
      (r) =>
        r.codigo.toLowerCase().includes(q) ||
        r.nome.toLowerCase().includes(q) ||
        r.nivel1_nome.toLowerCase().includes(q) ||
        r.nivel2_nome.toLowerCase().includes(q) ||
        r.nivel3_nome.toLowerCase().includes(q),
    );
  }, [rubricas, buscaRub]);

  // KPIs (sobre os pagamentos filtrados)
  const totalCents = pagFiltrados.reduce((s, p) => s + p.valor_centavos, 0);
  const totalFixo = pagFiltrados
    .filter((p) => p.tipo === "fixo")
    .reduce((s, p) => s + p.valor_centavos, 0);
  const totalVar = pagFiltrados
    .filter((p) => p.tipo === "variavel")
    .reduce((s, p) => s + p.valor_centavos, 0);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Erro ao carregar os Pagamentos
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>{(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-2">
        <Receipt className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Pagamentos</h1>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <Tabs defaultValue="pagamentos">
          <TabsList>
            <TabsTrigger value="pagamentos">
              <Wallet className="mr-1 h-3.5 w-3.5" /> Pagamentos ({pagamentos.length})
            </TabsTrigger>
            <TabsTrigger value="rubricas">
              <ListTree className="mr-1 h-3.5 w-3.5" /> Rubricas ({rubricas.length})
            </TabsTrigger>
          </TabsList>

          {/* ---------------- PAGAMENTOS ---------------- */}
          <TabsContent value="pagamentos" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard
                titulo="Total a pagar"
                valor={totalCents}
                sub={`${pagFiltrados.length} lançamentos`}
              />
              <KpiCard
                titulo="Fixos"
                valor={totalFixo}
                sub={`${pagFiltrados.filter((p) => p.tipo === "fixo").length} lançamentos`}
              />
              <KpiCard
                titulo="Variáveis"
                valor={totalVar}
                sub={`${pagFiltrados.filter((p) => p.tipo === "variavel").length} lançamentos`}
              />
            </div>

            <Card>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-base">Pagamentos</CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={mesRef} onValueChange={setMesRef}>
                      <SelectTrigger className="w-[150px]">
                        <CalendarRange className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os meses</SelectItem>
                        {mesesRef.map((m) => (
                          <SelectItem key={m} value={m}>
                            {fmtMesRef(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={depto} onValueChange={setDepto}>
                      <SelectTrigger className="w-[170px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos os departamentos</SelectItem>
                        {deptos.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={rubricaFiltro} onValueChange={setRubricaFiltro}>
                      <SelectTrigger className="w-[220px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todas">Todas as rubricas</SelectItem>
                        {rubricasNosPagamentos.map((r) => (
                          <SelectItem key={r.codigo} value={r.codigo}>
                            {r.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={buscaPag}
                        onChange={(e) => setBuscaPag(e.target.value)}
                        placeholder="Buscar fornecedor, rubrica…"
                        className="w-[220px] pl-8"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {pagFiltrados.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhum pagamento encontrado com esses filtros.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortHead
                            sk="fornecedor"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={toggleSort}
                          >
                            Fornecedor
                          </SortHead>
                          <SortHead
                            sk="departamento"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={toggleSort}
                          >
                            Departamento
                          </SortHead>
                          <SortHead
                            sk="rubrica"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={toggleSort}
                          >
                            Rubrica
                          </SortHead>
                          <SortHead
                            sk="tipo"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={toggleSort}
                          >
                            Tipo
                          </SortHead>
                          <SortHead
                            sk="data_vencimento"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={toggleSort}
                          >
                            Vencimento
                          </SortHead>
                          <SortHead
                            sk="status"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={toggleSort}
                          >
                            Status
                          </SortHead>
                          <SortHead
                            sk="valor_centavos"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={toggleSort}
                            align="right"
                          >
                            Valor
                          </SortHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagFiltrados.map((p) => {
                          const st = STATUS_STYLE[p.status];
                          return (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">
                                {p.fornecedor}
                                {p.servico && (
                                  <span className="block text-xs text-muted-foreground">
                                    {p.servico}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {p.departamento ? (
                                  <Badge variant="outline" className="text-[10px]">
                                    {p.departamento}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="max-w-[220px]">
                                <span className="text-sm">
                                  {rubricaNome.get(p.rubrica_codigo) ?? p.rubrica_codigo}
                                </span>
                                <span className="block font-mono text-[10px] text-muted-foreground">
                                  {p.rubrica_codigo}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-[10px]">
                                  {p.tipo === "fixo" ? "Fixo" : "Variável"}
                                </Badge>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {fmtDate(p.data_vencimento)}
                              </TableCell>
                              <TableCell>
                                <span
                                  className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${st.cls}`}
                                >
                                  {st.label}
                                </span>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right font-mono">
                                {formatCents(p.valor_centavos)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- RUBRICAS ---------------- */}
          <TabsContent value="rubricas" className="space-y-6">
            <Card>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-base">Rubricas · plano de contas gerencial</CardTitle>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={buscaRub}
                      onChange={(e) => setBuscaRub(e.target.value)}
                      placeholder="Buscar código ou nome…"
                      className="w-[260px] pl-8"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-xs text-muted-foreground">
                  {rubFiltradas.length} de {rubricas.length} rubricas
                </p>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Rubrica</TableHead>
                        <TableHead>Nível 1</TableHead>
                        <TableHead>Nível 2</TableHead>
                        <TableHead>Nível 3</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rubFiltradas.map((r) => (
                        <TableRow key={r.codigo}>
                          <TableCell className="whitespace-nowrap font-mono text-xs">
                            {r.codigo}
                          </TableCell>
                          <TableCell className="font-medium">{r.nome}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.nivel1_nome}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.nivel2_nome}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.nivel3_nome}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function SortHead({
  children,
  sk,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  children: ReactNode;
  sk: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sk === sortKey;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(sk)}
        className={`inline-flex items-center gap-1 select-none hover:text-foreground ${
          active ? "text-foreground font-semibold" : "text-muted-foreground"
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {children}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
        )}
      </button>
    </TableHead>
  );
}

function KpiCard({ titulo, valor, sub }: { titulo: string; valor: number; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-sm text-muted-foreground">{titulo}</div>
        <div className="mt-1 font-mono text-2xl font-bold">{formatCents(valor)}</div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}
