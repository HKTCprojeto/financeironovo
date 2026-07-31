import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCents, mesAtual, mesLabel, shiftMes } from "@/lib/financeiro";
import { formatCurrencyBRL } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Painel — HKTC" }] }),
  component: PainelPagamentos,
});

// ---------- tipos (fin_* ainda não estão nos types gerados) ----------
type Rubrica = {
  codigo: string;
  nome: string;
  nivel1_codigo: string;
  nivel1_nome: string;
};

type Pagamento = {
  id: string;
  departamento: string | null;
  fornecedor: string;
  servico: string | null;
  valor_centavos: number;
  data_vencimento: string;
  data_pagamento: string | null;
  tipo: "fixo" | "variavel" | "imposto";
  status: "previsto" | "a_pagar" | "pago" | "atrasado";
  rubrica_codigo: string;
  mes_ref: string;
};

async function fetchPainel() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const [rub, pag] = await Promise.all([
    sb.from("fin_rubricas").select("codigo,nome,nivel1_codigo,nivel1_nome"),
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

// mesmo critério da tela Pagamentos: "Vencido" é automático quando está
// a_pagar e passou do vencimento.
function statusEfetivo(p: Pagamento, hoje: string): "a_pagar" | "pago" | "atrasado" {
  if (p.status === "pago") return "pago";
  if (p.status === "atrasado") return "atrasado";
  if (p.data_vencimento < hoje) return "atrasado";
  return "a_pagar";
}

const STATUS_META = {
  a_pagar: { label: "A pagar", color: "#d97706" }, // amber-600
  pago: { label: "Pago", color: "#059669" }, // emerald-600
  atrasado: { label: "Vencido", color: "#dc2626" }, // red-600
} as const;

const GRUPO_CORES = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

const brl = (reais: number) => formatCurrencyBRL(reais);
const kBRL = (reais: number) => `R$${(reais / 1000).toFixed(0)}k`;

function PainelPagamentos() {
  const hoje = hojeISO();
  const [mes, setMes] = useState<string>(mesAtual());
  const { data, isLoading, error } = useQuery({
    queryKey: ["painel-pagamentos"],
    queryFn: fetchPainel,
  });

  const rubricas = data?.rubricas ?? [];
  const pagamentos = data?.pagamentos ?? [];

  const grupoDaRubrica = useMemo(() => {
    const m = new Map<string, string>();
    rubricas.forEach((r) => m.set(r.codigo, r.nivel1_nome || "Sem grupo"));
    return m;
  }, [rubricas]);

  const nomeDaRubrica = useMemo(() => {
    const m = new Map<string, string>();
    rubricas.forEach((r) => m.set(r.codigo, r.nome || r.codigo));
    return m;
  }, [rubricas]);

  // recorrência: em quantos meses distintos cada fornecedor aparece (toda a base)
  const recorrenciaFornecedor = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of pagamentos) {
      if (!m.has(p.fornecedor)) m.set(p.fornecedor, new Set());
      m.get(p.fornecedor)!.add(p.mes_ref);
    }
    return m;
  }, [pagamentos]);

  // comparativo mês a mês (toda a base): pago x pendente por mês
  const porMes = useMemo(() => {
    const m = new Map<string, { pago: number; pendente: number }>();
    for (const p of pagamentos) {
      const ef = statusEfetivo(p, hoje);
      const cur = m.get(p.mes_ref) ?? { pago: 0, pendente: 0 };
      if (ef === "pago") cur.pago += p.valor_centavos;
      else cur.pendente += p.valor_centavos;
      m.set(p.mes_ref, cur);
    }
    return Array.from(m, ([mesRef, v]) => {
      const [ano, mm] = mesRef.split("-");
      return {
        mesRef,
        label: `${mm}/${ano.slice(2)}`,
        pago: v.pago / 100,
        pendente: v.pendente / 100,
      };
    }).sort((a, b) => a.mesRef.localeCompare(b.mesRef));
  }, [pagamentos, hoje]);

  const mesesComDados = useMemo(
    () =>
      Array.from(new Set(pagamentos.map((p) => p.mes_ref)))
        .filter(Boolean)
        .sort()
        .reverse(),
    [pagamentos],
  );

  const doMes = useMemo(() => pagamentos.filter((p) => p.mes_ref === mes), [pagamentos, mes]);

  // ---- agregações ----
  const ag = useMemo(() => {
    const total = doMes.reduce((s, p) => s + p.valor_centavos, 0);
    let pago = 0,
      aPagar = 0,
      vencido = 0,
      fixo = 0,
      variavel = 0,
      imposto = 0;
    const porGrupo = new Map<string, number>();
    const porDepto = new Map<string, number>();
    const porDia = new Map<number, number>(); // vencimentos pendentes por dia
    const porForn = new Map<string, { cents: number; count: number }>();
    const porRubrica = new Map<string, { cents: number; count: number }>();
    let projVencido = 0,
      projAte7 = 0,
      projAte30 = 0,
      projDepois = 0;
    const hojeMs = new Date(hoje).getTime();

    for (const p of doMes) {
      const ef = statusEfetivo(p, hoje);
      if (ef === "pago") pago += p.valor_centavos;
      else if (ef === "atrasado") vencido += p.valor_centavos;
      else aPagar += p.valor_centavos;

      if (p.tipo === "imposto") imposto += p.valor_centavos;
      else if (p.tipo === "fixo") fixo += p.valor_centavos;
      else variavel += p.valor_centavos;

      const g = grupoDaRubrica.get(p.rubrica_codigo) ?? "Sem grupo";
      porGrupo.set(g, (porGrupo.get(g) ?? 0) + p.valor_centavos);

      const d = p.departamento || "—";
      porDepto.set(d, (porDepto.get(d) ?? 0) + p.valor_centavos);

      const f = porForn.get(p.fornecedor) ?? { cents: 0, count: 0 };
      porForn.set(p.fornecedor, { cents: f.cents + p.valor_centavos, count: f.count + 1 });

      const rn = nomeDaRubrica.get(p.rubrica_codigo) ?? p.rubrica_codigo;
      const rr = porRubrica.get(rn) ?? { cents: 0, count: 0 };
      porRubrica.set(rn, { cents: rr.cents + p.valor_centavos, count: rr.count + 1 });

      if (ef !== "pago") {
        const dia = Number(p.data_vencimento.slice(8, 10));
        porDia.set(dia, (porDia.get(dia) ?? 0) + p.valor_centavos);

        const dias = Math.round((new Date(p.data_vencimento).getTime() - hojeMs) / 86400000);
        if (dias < 0) projVencido += p.valor_centavos;
        else if (dias <= 7) projAte7 += p.valor_centavos;
        else if (dias <= 30) projAte30 += p.valor_centavos;
        else projDepois += p.valor_centavos;
      }
    }

    const toArr = (m: Map<string, number>) =>
      Array.from(m, ([nome, cents]) => ({ nome, valor: cents / 100, cents })).sort(
        (a, b) => b.cents - a.cents,
      );

    const cronograma = Array.from(porDia, ([dia, cents]) => ({ dia, valor: cents / 100 })).sort(
      (a, b) => a.dia - b.dia,
    );

    const topFornecedores = Array.from(porForn, ([nome, v]) => ({
      nome,
      cents: v.cents,
      count: v.count,
    }))
      .sort((a, b) => b.cents - a.cents)
      .slice(0, 8);

    const ticketRubrica = Array.from(porRubrica, ([nome, v]) => ({
      nome,
      ticket: v.cents / v.count / 100,
      count: v.count,
    }))
      .sort((a, b) => b.ticket - a.ticket)
      .slice(0, 8);

    // contas a vencer: pendentes ainda no prazo, mais próximas primeiro
    const aVencer = doMes
      .filter((p) => statusEfetivo(p, hoje) === "a_pagar")
      .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento))
      .slice(0, 8);
    const vencidos = doMes
      .filter((p) => statusEfetivo(p, hoje) === "atrasado")
      .sort((a, b) => b.valor_centavos - a.valor_centavos);

    return {
      total,
      pago,
      aPagar,
      vencido,
      pendente: aPagar + vencido,
      fixo,
      variavel,
      imposto,
      porGrupo: toArr(porGrupo).slice(0, 8),
      porDepto: toArr(porDepto),
      cronograma,
      topFornecedores,
      ticketRubrica,
      aVencer,
      vencidos,
      projecao: { vencido: projVencido, ate7: projAte7, ate30: projAte30, depois: projDepois },
      pctPago: total > 0 ? Math.round((pago / total) * 100) : 0,
    };
  }, [doMes, grupoDaRubrica, nomeDaRubrica, hoje]);

  const statusData = [
    { key: "a_pagar", ...STATUS_META.a_pagar, valor: ag.aPagar / 100 },
    { key: "atrasado", ...STATUS_META.atrasado, valor: ag.vencido / 100 },
    { key: "pago", ...STATUS_META.pago, valor: ag.pago / 100 },
  ].filter((d) => d.valor > 0);

  const tipoData = [
    { nome: "Fixos", valor: ag.fixo / 100 },
    { nome: "Variáveis", valor: ag.variavel / 100 },
    { nome: "Impostos", valor: ag.imposto / 100 },
  ].filter((d) => d.valor > 0);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Erro ao carregar o Painel
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
          <LayoutDashboard className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Painel</h1>
          <span className="text-sm text-muted-foreground">· pagamentos</span>
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
            <Kpi titulo="Total do mês" cents={ag.total} sub={`${doMes.length} lançamentos`}>
              <div className="mt-3">
                <Progress value={ag.pctPago} className="h-1.5" />
                <div className="mt-1 text-xs text-muted-foreground">{ag.pctPago}% pago</div>
              </div>
            </Kpi>
            <Kpi titulo="Pago" cents={ag.pago} tone="emerald" />
            <Kpi titulo="A pagar (no prazo)" cents={ag.aPagar} tone="amber" />
            <Kpi
              titulo="Vencido"
              cents={ag.vencido}
              tone="red"
              sub={`${ag.vencidos.length} conta(s)`}
            />
          </div>

          {/* Comparativo mês a mês */}
          <ChartCard titulo="Comparativo mês a mês (pago x pendente)">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porMes} margin={{ left: 8, right: 8 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                />
                <YAxis
                  tickFormatter={kBRL}
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                />
                <RTooltip content={<MoneyTooltip stacked />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="pago" name="Pago" stackId="m" fill={STATUS_META.pago.color} />
                <Bar
                  dataKey="pendente"
                  name="Pendente"
                  stackId="m"
                  fill={STATUS_META.a_pagar.color}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Status + Fixo x Variável */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard titulo="Por status">
              {statusData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="valor"
                      nameKey="label"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {statusData.map((d) => (
                        <Cell key={d.key} fill={d.color} />
                      ))}
                    </Pie>
                    <RTooltip content={<MoneyTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Vazio />
              )}
            </ChartCard>

            <ChartCard titulo="Fixos · Variáveis · Impostos">
              {tipoData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tipoData}
                      dataKey="valor"
                      nameKey="nome"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {tipoData.map((_, i) => (
                        <Cell key={i} fill={GRUPO_CORES[i % GRUPO_CORES.length]} />
                      ))}
                    </Pie>
                    <RTooltip content={<MoneyTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Vazio />
              )}
            </ChartCard>
          </div>

          {/* Por grupo (rubrica nível 1) + Por departamento */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard titulo="Por grupo de rubrica (nível 1)">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ag.porGrupo} layout="vertical" margin={{ left: 12, right: 16 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tickFormatter={kBRL}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={150}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  />
                  <RTooltip content={<MoneyTooltip />} />
                  <Bar dataKey="valor" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard titulo="Por departamento">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ag.porDepto} layout="vertical" margin={{ left: 12, right: 16 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    tickFormatter={kBRL}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={110}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  />
                  <RTooltip content={<MoneyTooltip />} />
                  <Bar dataKey="valor" fill="var(--color-chart-2)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Cronograma de vencimentos (pendentes) */}
          <ChartCard titulo="Cronograma de vencimentos (em aberto) — por dia" tall>
            {ag.cronograma.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ag.cronograma} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="dia"
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  />
                  <YAxis
                    tickFormatter={kBRL}
                    tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  />
                  <RTooltip content={<MoneyTooltip labelPrefix="Dia " />} />
                  <Bar dataKey="valor" fill="var(--color-chart-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Vazio texto="Nada em aberto neste mês 🎉" />
            )}
          </ChartCard>

          {/* Projeção de vencimentos + Ticket médio por rubrica */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Projeção de vencimentos (em aberto)</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Bucket titulo="Vencido" cents={ag.projecao.vencido} tone="red" />
                <Bucket titulo="Vence em até 7 dias" cents={ag.projecao.ate7} tone="amber" />
                <Bucket titulo="8 a 30 dias" cents={ag.projecao.ate30} />
                <Bucket titulo="Depois de 30 dias" cents={ag.projecao.depois} />
              </CardContent>
            </Card>

            <ChartCard titulo="Ticket médio por rubrica (top 8)">
              {ag.ticketRubrica.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={ag.ticketRubrica}
                    layout="vertical"
                    margin={{ left: 12, right: 16 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tickFormatter={kBRL}
                      tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="nome"
                      width={150}
                      tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
                    />
                    <RTooltip content={<MoneyTooltip />} />
                    <Bar dataKey="ticket" fill="var(--color-chart-3)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Vazio />
              )}
            </ChartCard>
          </div>

          {/* Contas a vencer + Vencidos */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-amber-600" /> Contas a vencer
                </CardTitle>
                <Link
                  to="/pagamentos"
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  Ver todos <ArrowRight className="h-3 w-3" />
                </Link>
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {ag.aVencer.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nada a vencer neste mês 🎉
                  </p>
                ) : (
                  ag.aVencer.map((p) => {
                    const dias = Math.round(
                      (new Date(p.data_vencimento).getTime() - new Date(hoje).getTime()) / 86400000,
                    );
                    const quando =
                      dias <= 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : `vence em ${dias}d`;
                    const ddmm = `${p.data_vencimento.slice(8, 10)}/${p.data_vencimento.slice(5, 7)}`;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.fornecedor}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {p.servico ?? "—"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-semibold tabular-nums">
                            {formatCents(p.valor_centavos)}
                          </p>
                          <span className="text-[11px] text-muted-foreground">
                            {quando} · {ddmm}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card className={ag.vencidos.length ? "border-red-500/40" : ""}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4 text-red-600" /> Contas vencidas
                </CardTitle>
                {ag.vencido > 0 && (
                  <span className="font-mono text-sm font-semibold text-red-600">
                    {formatCents(ag.vencido)}
                  </span>
                )}
              </CardHeader>
              <CardContent className="divide-y divide-border">
                {ag.vencidos.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma conta vencida 🎉
                  </p>
                ) : (
                  ag.vencidos.slice(0, 8).map((p) => {
                    const diasAtraso = Math.max(
                      0,
                      Math.round(
                        (new Date(hoje).getTime() - new Date(p.data_vencimento).getTime()) /
                          86400000,
                      ),
                    );
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.fornecedor}</p>
                          <p className="text-xs text-red-600/80">{diasAtraso}d em atraso</p>
                        </div>
                        <p className="font-mono text-sm font-semibold tabular-nums">
                          {formatCents(p.valor_centavos)}
                        </p>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top fornecedores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top fornecedores do mês</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {ag.topFornecedores.map((f) => {
                const meses = recorrenciaFornecedor.get(f.nome)?.size ?? 1;
                return (
                  <div
                    key={f.nome}
                    className="flex items-center justify-between gap-3 border-b border-border py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{f.nome}</p>
                      <p className="text-xs text-muted-foreground">
                        {f.count} lançamento{f.count > 1 ? "s" : ""}
                        {meses > 1 && ` · recorrente em ${meses} meses`}
                      </p>
                    </div>
                    <p className="font-mono text-sm font-semibold tabular-nums">
                      {formatCents(f.cents)}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Bucket({
  titulo,
  cents,
  tone,
}: {
  titulo: string;
  cents: number;
  tone?: "red" | "amber";
}) {
  const toneCls = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className={`mt-1 font-mono text-lg font-semibold ${toneCls}`}>{formatCents(cents)}</div>
    </div>
  );
}

// ---------- componentes auxiliares ----------
function Kpi({
  titulo,
  cents,
  sub,
  tone,
  children,
}: {
  titulo: string;
  cents: number;
  sub?: string;
  tone?: "emerald" | "amber" | "red";
  children?: React.ReactNode;
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "amber"
        ? "text-amber-600"
        : tone === "red"
          ? "text-red-600"
          : "";
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-sm text-muted-foreground">{titulo}</div>
        <div className={`mt-1 whitespace-nowrap font-mono text-xl font-bold ${toneCls}`}>
          {formatCents(cents)}
        </div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        {children}
      </CardContent>
    </Card>
  );
}

function ChartCard({
  titulo,
  tall,
  children,
}: {
  titulo: string;
  tall?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className={tall ? "h-80" : "h-72"}>{children}</CardContent>
    </Card>
  );
}

function Vazio({ texto = "Sem dados" }: { texto?: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {texto}
    </div>
  );
}

function MoneyTooltip({
  active,
  payload,
  label,
  labelPrefix = "",
  stacked = false,
}: {
  active?: boolean;
  payload?: Array<{
    value: number;
    name?: string;
    color?: string;
    payload?: Record<string, unknown>;
  }>;
  label?: string | number;
  labelPrefix?: string;
  stacked?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const nome = p.name ?? (p.payload as { nome?: string })?.nome ?? "";
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs font-mono shadow-lg">
      {(label !== undefined || nome) && (
        <div className="mb-0.5 text-muted-foreground">
          {label !== undefined ? `${labelPrefix}${label}` : nome}
        </div>
      )}
      {stacked ? (
        payload.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: row.color }} />
            <span className="text-muted-foreground">{row.name}</span>
            <span className="ml-auto font-semibold tabular-nums">{brl(Number(row.value))}</span>
          </div>
        ))
      ) : (
        <div className="font-semibold tabular-nums">{brl(Number(p.value))}</div>
      )}
    </div>
  );
}
