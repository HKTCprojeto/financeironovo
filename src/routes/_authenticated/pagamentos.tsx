import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  Plus,
  CopyPlus,
  Trash2,
  Check,
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatCents, formatReais, parseBRLToCents } from "@/lib/financeiro";

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
  tipo: "fixo" | "variavel" | "imposto";
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

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

// Status efetivo exibido: "Vencido" (atrasado) é automático quando está
// "A pagar" e já passou do vencimento. "Pago" e "Vencido" manual mandam sobre a data.
function statusEfetivo(p: Pagamento, hoje: string): Pagamento["status"] {
  if (p.status === "pago" || p.status === "atrasado") return p.status;
  // a_pagar / previsto: vira atrasado se venceu
  if (p.data_vencimento < hoje) return "atrasado";
  return "a_pagar";
}

// opções do seletor de status (valores gravados no banco)
const STATUS_OPCOES: { value: Pagamento["status"]; label: string }[] = [
  { value: "a_pagar", label: "A pagar" },
  { value: "pago", label: "Pago" },
  { value: "atrasado", label: "Vencido" },
];

// 'YYYY-MM' -> próximo mês 'YYYY-MM'
function proxMesRef(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m >= 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

// último dia do mês 1-based
function ultimoDia(ano: number, mes1a12: number): number {
  return new Date(ano, mes1a12, 0).getDate();
}

// data de vencimento no mês, com o dia (limitado ao último dia do mês)
function vencimentoNoMes(mesRef: string, dia: number): string {
  const [a, m] = mesRef.split("-").map(Number);
  const d = Math.min(Math.max(1, dia), ultimoDia(a, m));
  return `${mesRef}-${String(d).padStart(2, "0")}`;
}

// formulário de novo pagamento
type FormPag = {
  fornecedor: string;
  servico: string;
  descricao: string;
  departamento: string;
  valorStr: string;
  data_vencimento: string;
  tipo: "fixo" | "variavel" | "imposto";
  status: Pagamento["status"];
  rubrica_codigo: string;
};

const TIPO_LABEL: Record<Pagamento["tipo"], string> = {
  fixo: "Fixo",
  variavel: "Variável",
  imposto: "Imposto",
};

// centavos -> "185.000,00" (sem R$), para o campo de valor do formulário
const nfValor = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
function valorBR(cents: number): string {
  return nfValor.format(cents / 100);
}

function formVazio(hoje: string): FormPag {
  return {
    fornecedor: "",
    servico: "",
    descricao: "",
    departamento: "",
    valorStr: "",
    data_vencimento: hoje,
    tipo: "fixo",
    status: "a_pagar",
    rubrica_codigo: "",
  };
}

// pré-preenche o formulário a partir de um pagamento existente (edição)
function formDePagamento(p: Pagamento): FormPag {
  return {
    fornecedor: p.fornecedor,
    servico: p.servico ?? "",
    descricao: p.descricao ?? "",
    departamento: p.departamento ?? "",
    valorStr: valorBR(p.valor_centavos),
    data_vencimento: p.data_vencimento,
    tipo: p.tipo,
    status: p.status,
    rubrica_codigo: p.rubrica_codigo,
  };
}

function PagamentosPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["plano-gerencial"],
    queryFn: fetchPlano,
  });

  const queryClient = useQueryClient();
  const hoje = hojeISO();

  const rubricas = data?.rubricas ?? [];
  const pagamentos = data?.pagamentos ?? [];

  // ---- escrita: alterar status / data de pagamento ----
  const updateStatus = useMutation({
    mutationFn: async (vars: {
      id: string;
      status: Pagamento["status"];
      data_pagamento: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: rows, error: err } = await sb
        .from("fin_pagamentos")
        .update({ status: vars.status, data_pagamento: vars.data_pagamento })
        .eq("id", vars.id)
        .select("id");
      if (err) throw err;
      if (!rows || rows.length === 0) {
        throw new Error(
          "Nenhuma linha alterada — verifique se a policy de UPDATE foi aplicada no Supabase.",
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plano-gerencial"] });
      toast.success("Status atualizado");
    },
    onError: (e) => {
      toast.error("Não foi possível atualizar", { description: (e as Error).message });
    },
  });

  // ---- seleção em massa + escrita (novo / duplicar / excluir) ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [novoOpen, setNovoOpen] = useState(false);
  const [editando, setEditando] = useState<Pagamento | null>(null);
  const [confirmDelOpen, setConfirmDelOpen] = useState(false);

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["plano-gerencial"] });

  const insertPagamento = useMutation({
    mutationFn: async (f: FormPag) => {
      const cents = parseBRLToCents(f.valorStr);
      if (cents == null) throw new Error("Valor inválido");
      if (!f.fornecedor.trim()) throw new Error("Informe o fornecedor");
      if (!f.rubrica_codigo) throw new Error("Escolha a rubrica");
      if (!f.data_vencimento) throw new Error("Informe o vencimento");
      const mes_ref = f.data_vencimento.slice(0, 7);
      const dia = Number(f.data_vencimento.slice(8, 10));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: rows, error: err } = await sb
        .from("fin_pagamentos")
        .insert({
          departamento: f.departamento.trim() || null,
          fornecedor: f.fornecedor.trim(),
          servico: f.servico.trim() || null,
          descricao: f.descricao.trim() || null,
          valor_centavos: cents,
          data_vencimento: f.data_vencimento,
          data_pagamento: f.status === "pago" ? hoje : null,
          dia_vencimento: dia,
          tipo: f.tipo,
          periodicidade: "mensal",
          status: f.status,
          rubrica_codigo: f.rubrica_codigo,
          mes_ref,
          origem: "manual",
        })
        .select("id");
      if (err) throw err;
      if (!rows || rows.length === 0)
        throw new Error(
          "Nada inserido — verifique se a policy de INSERT foi aplicada no Supabase.",
        );
    },
    onSuccess: () => {
      invalidar();
      toast.success("Pagamento cadastrado");
      setNovoOpen(false);
    },
    onError: (e) =>
      toast.error("Não foi possível cadastrar", { description: (e as Error).message }),
  });

  const updatePagamento = useMutation({
    mutationFn: async ({ orig, f }: { orig: Pagamento; f: FormPag }) => {
      const cents = parseBRLToCents(f.valorStr);
      if (cents == null) throw new Error("Valor inválido");
      if (!f.fornecedor.trim()) throw new Error("Informe o fornecedor");
      if (!f.rubrica_codigo) throw new Error("Escolha a rubrica");
      if (!f.data_vencimento) throw new Error("Informe o vencimento");
      const mes_ref = f.data_vencimento.slice(0, 7);
      const dia = Number(f.data_vencimento.slice(8, 10));
      const data_pagamento = f.status === "pago" ? (orig.data_pagamento ?? hoje) : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: rows, error: err } = await sb
        .from("fin_pagamentos")
        .update({
          departamento: f.departamento.trim() || null,
          fornecedor: f.fornecedor.trim(),
          servico: f.servico.trim() || null,
          descricao: f.descricao.trim() || null,
          valor_centavos: cents,
          data_vencimento: f.data_vencimento,
          data_pagamento,
          dia_vencimento: dia,
          tipo: f.tipo,
          status: f.status,
          rubrica_codigo: f.rubrica_codigo,
          mes_ref,
        })
        .eq("id", orig.id)
        .select("id");
      if (err) throw err;
      if (!rows || rows.length === 0)
        throw new Error(
          "Nada alterado — verifique se a policy de UPDATE foi aplicada no Supabase.",
        );
    },
    onSuccess: () => {
      invalidar();
      toast.success("Pagamento atualizado");
      setNovoOpen(false);
      setEditando(null);
    },
    onError: (e) => toast.error("Não foi possível salvar", { description: (e as Error).message }),
  });

  const duplicarSel = useMutation({
    mutationFn: async (itens: Pagamento[]) => {
      const novos = itens.map((p) => {
        const dia = p.dia_vencimento ?? Number(p.data_vencimento.slice(8, 10));
        const mes_ref = proxMesRef(p.mes_ref);
        return {
          departamento: p.departamento,
          fornecedor: p.fornecedor,
          servico: p.servico,
          descricao: p.descricao,
          valor_centavos: p.valor_centavos,
          data_vencimento: vencimentoNoMes(mes_ref, dia),
          data_pagamento: null,
          dia_vencimento: dia,
          tipo: p.tipo,
          periodicidade: p.periodicidade,
          status: "a_pagar" as const,
          rubrica_codigo: p.rubrica_codigo,
          conta_contabil: p.conta_contabil,
          mes_ref,
          origem: "duplicado",
        };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: rows, error: err } = await sb.from("fin_pagamentos").insert(novos).select("id");
      if (err) throw err;
      if (!rows || rows.length === 0)
        throw new Error(
          "Nada duplicado — verifique se a policy de INSERT foi aplicada no Supabase.",
        );
      return rows.length as number;
    },
    onSuccess: (n) => {
      invalidar();
      toast.success(`${n} lançamento(s) duplicado(s) para o próximo mês`);
      setSelectedIds(new Set());
    },
    onError: (e) => toast.error("Não foi possível duplicar", { description: (e as Error).message }),
  });

  const excluirSel = useMutation({
    mutationFn: async (ids: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: rows, error: err } = await sb
        .from("fin_pagamentos")
        .delete()
        .in("id", ids)
        .select("id");
      if (err) throw err;
      if (!rows || rows.length === 0)
        throw new Error(
          "Nada excluído — verifique se a policy de DELETE foi aplicada no Supabase.",
        );
      return rows.length as number;
    },
    onSuccess: (n) => {
      invalidar();
      toast.success(`${n} pagamento(s) excluído(s)`);
      setSelectedIds(new Set());
      setConfirmDelOpen(false);
    },
    onError: (e) => toast.error("Não foi possível excluir", { description: (e as Error).message }),
  });

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

  // se o mês filtrado deixou de existir (ex.: excluiu o último do mês), volta p/ "Todos"
  useEffect(() => {
    if (mesRef !== "todos" && mesesRef.length > 0 && !mesesRef.includes(mesRef)) {
      setMesRef("todos");
    }
  }, [mesRef, mesesRef]);

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
          return (
            (STATUS_ORDER[statusEfetivo(a, hoje)] - STATUS_ORDER[statusEfetivo(b, hoje)]) * dir
          );
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
  }, [pagamentos, depto, rubricaFiltro, mesRef, buscaPag, rubricaNome, sortKey, sortDir, hoje]);

  // seleção (sobre os filtrados)
  const idsFiltrados = pagFiltrados.map((p) => p.id);
  const nSel = selectedIds.size;
  const todosSel = idsFiltrados.length > 0 && idsFiltrados.every((id) => selectedIds.has(id));
  const algunsSel = idsFiltrados.some((id) => selectedIds.has(id));
  const selPagamentos = pagamentos.filter((p) => selectedIds.has(p.id));

  function toggleTodos() {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (todosSel) idsFiltrados.forEach((id) => n.delete(id));
      else idsFiltrados.forEach((id) => n.add(id));
      return n;
    });
  }
  function toggleUm(id: string) {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

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
  const totalImposto = pagFiltrados
    .filter((p) => p.tipo === "imposto")
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <KpiCard
                titulo="Impostos"
                valor={totalImposto}
                sub={`${pagFiltrados.filter((p) => p.tipo === "imposto").length} lançamentos`}
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
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditando(null);
                        setNovoOpen(true);
                      }}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Novo pagamento
                    </Button>
                  </div>
                </div>

                {/* barra de ações de seleção */}
                {nSel > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                    <span className="text-sm font-medium">{nSel} selecionado(s)</span>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={duplicarSel.isPending}
                        onClick={() => duplicarSel.mutate(selPagamentos)}
                      >
                        <CopyPlus className="mr-1 h-4 w-4" /> Duplicar p/ próximo mês
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={excluirSel.isPending}
                        onClick={() => setConfirmDelOpen(true)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" /> Excluir selecionados
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                        Limpar seleção
                      </Button>
                    </div>
                  </div>
                )}
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
                          <TableHead className="w-8">
                            <Checkbox
                              aria-label="Selecionar todos"
                              checked={todosSel ? true : algunsSel ? "indeterminate" : false}
                              onCheckedChange={toggleTodos}
                            />
                          </TableHead>
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
                          return (
                            <TableRow
                              key={p.id}
                              data-state={selectedIds.has(p.id) ? "selected" : undefined}
                              className="cursor-pointer"
                              onClick={() => {
                                setEditando(p);
                                setNovoOpen(true);
                              }}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  aria-label={`Selecionar ${p.fornecedor}`}
                                  checked={selectedIds.has(p.id)}
                                  onCheckedChange={() => toggleUm(p.id)}
                                />
                              </TableCell>
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
                                  {TIPO_LABEL[p.tipo]}
                                </Badge>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {fmtDate(p.data_vencimento)}
                              </TableCell>
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <StatusCell
                                  pagamento={p}
                                  efetivo={statusEfetivo(p, hoje)}
                                  hoje={hoje}
                                  saving={
                                    updateStatus.isPending && updateStatus.variables?.id === p.id
                                  }
                                  onChange={(status, data_pagamento) =>
                                    updateStatus.mutate({ id: p.id, status, data_pagamento })
                                  }
                                />
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

      <NovoPagamentoDialog
        open={novoOpen}
        onOpenChange={(o) => {
          setNovoOpen(o);
          if (!o) setEditando(null);
        }}
        editando={editando}
        rubricas={rubricas}
        deptos={deptos}
        hoje={hoje}
        saving={insertPagamento.isPending || updatePagamento.isPending}
        onSubmit={(f) =>
          editando ? updatePagamento.mutate({ orig: editando, f }) : insertPagamento.mutate(f)
        }
      />

      <AlertDialog open={confirmDelOpen} onOpenChange={setConfirmDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {nSel} pagamento(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove os lançamentos selecionados permanentemente. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                excluirSel.mutate(Array.from(selectedIds));
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatusCell({
  pagamento,
  efetivo,
  hoje,
  saving,
  onChange,
}: {
  pagamento: Pagamento;
  efetivo: Pagamento["status"];
  hoje: string;
  saving: boolean;
  onChange: (status: Pagamento["status"], data_pagamento: string | null) => void;
}) {
  const [dlgOpen, setDlgOpen] = useState(false);
  const [dataPag, setDataPag] = useState<string>(pagamento.data_pagamento ?? hoje);

  const st = STATUS_STYLE[efetivo];

  function handleSelect(v: string) {
    const novo = v as Pagamento["status"];
    if (novo === efetivo) return;
    if (novo === "pago") {
      setDataPag(pagamento.data_pagamento ?? hoje); // data atual, mas editável
      setDlgOpen(true);
      return;
    }
    onChange(novo, null); // A pagar / Vencido limpam a data de pagamento
  }

  function confirmarPago() {
    onChange("pago", dataPag);
    setDlgOpen(false);
  }

  return (
    <>
      <Select value={efetivo} onValueChange={handleSelect} disabled={saving}>
        <SelectTrigger
          className={`h-7 w-[128px] rounded-full border px-2.5 py-0 text-[11px] font-medium ${st.cls}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPCOES.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {efetivo === "pago" && pagamento.data_pagamento && (
        <span className="mt-0.5 block text-[10px] text-muted-foreground">
          pago em {fmtDate(pagamento.data_pagamento)}
        </span>
      )}

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Marcar como pago</DialogTitle>
            <DialogDescription>
              {pagamento.fornecedor} · {formatCents(pagamento.valor_centavos)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="data-pagamento">Data de pagamento</Label>
            <Input
              id="data-pagamento"
              type="date"
              value={dataPag}
              onChange={(e) => setDataPag(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarPago} disabled={!dataPag}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
        <div className="mt-1 flex items-baseline gap-1 whitespace-nowrap font-mono font-bold">
          <span className="text-xs font-normal text-muted-foreground">R$</span>
          <span className="text-xl">{formatReais(valor)}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

// ---------- combobox de rubrica (222 opções, com busca) ----------
function RubricaCombobox({
  rubricas,
  value,
  onChange,
}: {
  rubricas: Rubrica[];
  value: string;
  onChange: (codigo: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selecionada = rubricas.find((r) => r.codigo === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{selecionada ? selecionada.nome : "Escolha a rubrica…"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar rubrica ou código…" />
          <CommandList>
            <CommandEmpty>Nenhuma rubrica.</CommandEmpty>
            <CommandGroup>
              {rubricas.map((r) => (
                <CommandItem
                  key={r.codigo}
                  value={`${r.nome} ${r.codigo} ${r.nivel1_nome}`}
                  onSelect={() => {
                    onChange(r.codigo);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${r.codigo === value ? "opacity-100" : "opacity-0"}`}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm">{r.nome}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {r.codigo} · {r.nivel1_nome}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------- dialog de novo / editar pagamento ----------
function NovoPagamentoDialog({
  open,
  onOpenChange,
  editando,
  rubricas,
  deptos,
  hoje,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editando: Pagamento | null;
  rubricas: Rubrica[];
  deptos: string[];
  hoje: string;
  saving: boolean;
  onSubmit: (f: FormPag) => void;
}) {
  const [f, setF] = useState<FormPag>(() => formVazio(hoje));
  useEffect(() => {
    if (open) setF(editando ? formDePagamento(editando) : formVazio(hoje));
  }, [open, hoje, editando]);

  const set = <K extends keyof FormPag>(k: K, v: FormPag[K]) => setF((s) => ({ ...s, [k]: v }));
  const cents = parseBRLToCents(f.valorStr);
  const valido = f.fornecedor.trim() && cents != null && f.rubrica_codigo && f.data_vencimento;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar pagamento" : "Novo pagamento"}</DialogTitle>
          <DialogDescription>A competência é definida pelo mês do vencimento.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Fornecedor *</Label>
            <Input
              value={f.fornecedor}
              onChange={(e) => set("fornecedor", e.target.value)}
              placeholder="Ex.: CELESC"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Serviço</Label>
              <Input
                value={f.servico}
                onChange={(e) => set("servico", e.target.value)}
                placeholder="Ex.: Energia"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Departamento</Label>
              <Input
                value={f.departamento}
                onChange={(e) => set("departamento", e.target.value)}
                placeholder="Ex.: ADM"
                list="deptos-list"
              />
              <datalist id="deptos-list">
                {deptos.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Rubrica *</Label>
            <RubricaCombobox
              rubricas={rubricas}
              value={f.rubrica_codigo}
              onChange={(c) => set("rubrica_codigo", c)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Valor *</Label>
              <Input
                value={f.valorStr}
                onChange={(e) => set("valorStr", e.target.value)}
                onBlur={() => {
                  const c = parseBRLToCents(f.valorStr);
                  if (c != null) set("valorStr", valorBR(c));
                }}
                placeholder="R$ 0,00"
                inputMode="decimal"
                className={f.valorStr && cents == null ? "border-destructive" : ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento *</Label>
              <Input
                type="date"
                value={f.data_vencimento}
                onChange={(e) => set("data_vencimento", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={f.tipo} onValueChange={(v) => set("tipo", v as FormPag["tipo"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixo">Fixo</SelectItem>
                  <SelectItem value="variavel">Variável</SelectItem>
                  <SelectItem value="imposto">Imposto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={f.status}
                onValueChange={(v) => set("status", v as Pagamento["status"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPCOES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={f.descricao}
              onChange={(e) => set("descricao", e.target.value)}
              placeholder="Observações (opcional)"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!valido || saving} onClick={() => onSubmit(f)}>
            {editando ? "Salvar" : "Cadastrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
