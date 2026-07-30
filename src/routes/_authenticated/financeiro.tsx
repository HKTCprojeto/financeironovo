import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ListTree,
  Building2,
  Layers,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCents, mesAtual, mesLabel, shiftMes } from "@/lib/financeiro";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — HKTC" }] }),
  component: FinanceiroPage,
});

// ---------- tipos ----------
type Rubrica = {
  codigo: string;
  nome: string;
  nivel1_nome: string;
  nivel2_nome: string;
};

type Pagamento = {
  id: string;
  departamento: string | null;
  fornecedor: string;
  valor_centavos: number;
  data_vencimento: string;
  tipo: "fixo" | "variavel";
  status: "previsto" | "a_pagar" | "pago" | "atrasado";
  rubrica_codigo: string;
  mes_ref: string;
};

async function fetchFinanceiro() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [rub, pag] = await Promise.all([
    sb.from("fin_rubricas").select("codigo,nome,nivel1_nome,nivel2_nome"),
    sb.from("fin_pagamentos").select("*"),
  ]);
  if (rub.error) throw rub.error;
  if (pag.error) throw pag.error;
  return {
    rubricas: (rub.data ?? []) as Rubrica[],
    pagamentos: (pag.data ?? []) as Pagamento[],
  };
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function statusEfetivo(p: Pagamento, hoje: string): "a_pagar" | "pago" | "atrasado" {
  if (p.status === "pago") return "pago";
  if (p.status === "atrasado") return "atrasado";
  if (p.data_vencimento < hoje) return "atrasado";
  return "a_pagar";
}

type Linha = { nome: string; sub?: string; count: number; cents: number };

function FinanceiroPage() {
  const hoje = hojeISO();
  const [mes, setMes] = useState<string>(mesAtual());
  const [buscaRub, setBuscaRub] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["financeiro-pag"],
    queryFn: fetchFinanceiro,
  });

  const rubricas = data?.rubricas ?? [];
  const pagamentos = data?.pagamentos ?? [];

  const rubIndex = useMemo(() => {
    const m = new Map<string, Rubrica>();
    rubricas.forEach((r) => m.set(r.codigo, r));
    return m;
  }, [rubricas]);

  const mesesComDados = useMemo(
    () =>
      Array.from(new Set(pagamentos.map((p) => p.mes_ref)))
        .filter(Boolean)
        .sort()
        .reverse(),
    [pagamentos],
  );

  const doMes = useMemo(() => pagamentos.filter((p) => p.mes_ref === mes), [pagamentos, mes]);

  const ag = useMemo(() => {
    let total = 0,
      fixo = 0,
      variavel = 0,
      pago = 0,
      pendente = 0;
    const grupo = new Map<string, Linha>();
    const rubrica = new Map<string, Linha>();
    const depto = new Map<string, Linha>();

    const bump = (m: Map<string, Linha>, key: string, cents: number, sub?: string) => {
      const cur = m.get(key) ?? { nome: key, sub, count: 0, cents: 0 };
      cur.count += 1;
      cur.cents += cents;
      m.set(key, cur);
    };

    for (const p of doMes) {
      total += p.valor_centavos;
      if (p.tipo === "fixo") fixo += p.valor_centavos;
      else variavel += p.valor_centavos;
      const ef = statusEfetivo(p, hoje);
      if (ef === "pago") pago += p.valor_centavos;
      else pendente += p.valor_centavos;

      const r = rubIndex.get(p.rubrica_codigo);
      bump(grupo, r?.nivel1_nome || "Sem grupo", p.valor_centavos);
      bump(
        rubrica,
        r?.nome || p.rubrica_codigo,
        p.valor_centavos,
        r?.nivel1_nome || p.rubrica_codigo,
      );
      bump(depto, p.departamento || "—", p.valor_centavos);
    }

    const arr = (m: Map<string, Linha>) => Array.from(m.values()).sort((a, b) => b.cents - a.cents);
    return {
      total,
      fixo,
      variavel,
      pago,
      pendente,
      porGrupo: arr(grupo),
      porRubrica: arr(rubrica),
      porDepto: arr(depto),
    };
  }, [doMes, rubIndex, hoje]);

  const rubFiltradas = useMemo(() => {
    const q = buscaRub.trim().toLowerCase();
    if (!q) return ag.porRubrica;
    return ag.porRubrica.filter(
      (l) => l.nome.toLowerCase().includes(q) || (l.sub ?? "").toLowerCase().includes(q),
    );
  }, [ag.porRubrica, buscaRub]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Erro ao carregar o Financeiro
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
      {/* cabeçalho + navegação de mês */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <span className="text-sm text-muted-foreground">· para onde vai o dinheiro</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMes(shiftMes(mes, -1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[150px] text-center font-semibold capitalize">
            {mesLabel(mes)}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMes(shiftMes(mes, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : doMes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <p>Nenhum pagamento em {mesLabel(mes)}.</p>
            {mesesComDados.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setMes(mesesComDados[0])}
              >
                Ir para {mesLabel(mesesComDados[0])}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi titulo="Total do mês" cents={ag.total} sub={`${doMes.length} lançamentos`} />
            <Kpi titulo="Fixos" cents={ag.fixo} sub={pct(ag.fixo, ag.total)} />
            <Kpi titulo="Variáveis" cents={ag.variavel} sub={pct(ag.variavel, ag.total)} />
            <Kpi
              titulo="Pendente"
              cents={ag.pendente}
              sub={`${pct(ag.pendente, ag.total)} em aberto`}
              tone="amber"
            />
          </div>

          <Tabs defaultValue="grupo">
            <TabsList>
              <TabsTrigger value="grupo">
                <Layers className="mr-1 h-3.5 w-3.5" /> Por grupo
              </TabsTrigger>
              <TabsTrigger value="rubrica">
                <ListTree className="mr-1 h-3.5 w-3.5" /> Por rubrica
              </TabsTrigger>
              <TabsTrigger value="depto">
                <Building2 className="mr-1 h-3.5 w-3.5" /> Por departamento
              </TabsTrigger>
            </TabsList>

            {/* Por grupo (rubrica nível 1) */}
            <TabsContent value="grupo">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Por grupo de rubrica (nível 1)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Breakdown linhas={ag.porGrupo} total={ag.total} colNome="Grupo" />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Por rubrica (detalhado) */}
            <TabsContent value="rubrica">
              <Card>
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-base">Por rubrica</CardTitle>
                    <Input
                      value={buscaRub}
                      onChange={(e) => setBuscaRub(e.target.value)}
                      placeholder="Buscar rubrica ou grupo…"
                      className="w-[240px]"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <Breakdown linhas={rubFiltradas} total={ag.total} colNome="Rubrica" showSub />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Por departamento */}
            <TabsContent value="depto">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Por departamento</CardTitle>
                </CardHeader>
                <CardContent>
                  <Breakdown linhas={ag.porDepto} total={ag.total} colNome="Departamento" />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground">
            Dados do plano de pagamentos.{" "}
            <Link
              to="/pagamentos"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Ver / editar lançamentos em Pagamentos <ArrowRight className="h-3 w-3" />
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

// ---------- auxiliares ----------
function pct(parte: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((parte / total) * 100)}%`;
}

function Kpi({
  titulo,
  cents,
  sub,
  tone,
}: {
  titulo: string;
  cents: number;
  sub?: string;
  tone?: "amber";
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-sm text-muted-foreground">{titulo}</div>
        <div
          className={`mt-1 font-mono text-2xl font-bold ${tone === "amber" ? "text-amber-600" : ""}`}
        >
          {formatCents(cents)}
        </div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Breakdown({
  linhas,
  total,
  colNome,
  showSub = false,
}: {
  linhas: Linha[];
  total: number;
  colNome: string;
  showSub?: boolean;
}) {
  if (linhas.length === 0) {
    return <p className="text-sm text-muted-foreground">Nada encontrado.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{colNome}</TableHead>
            <TableHead className="text-right">Lançs.</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="w-[200px]">% do mês</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => {
            const p = total > 0 ? (l.cents / total) * 100 : 0;
            return (
              <TableRow key={l.nome}>
                <TableCell className="font-medium">
                  {l.nome}
                  {showSub && l.sub && (
                    <span className="block text-[11px] text-muted-foreground">{l.sub}</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {l.count}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-mono">
                  {formatCents(l.cents)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${p}%` }} />
                    </div>
                    <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                      {p.toFixed(0)}%
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
