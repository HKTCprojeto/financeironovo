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
import { LayoutDashboard, AlertTriangle, TableProperties } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { mesAtual, mesCurto } from "@/lib/financeiro";
import {
  fetchPagamentos,
  GRUPO_CORES,
  hojeISO,
  kBRL,
  statusEfetivo,
  STATUS_META,
} from "@/lib/pagamentos-dados";
import {
  Bucket,
  ChartCard,
  FiltroMeses,
  Kpi,
  MoneyTooltip,
  Vazio,
} from "@/components/pagamentos-ui";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Painel — HKTC" }] }),
  component: PainelPagamentos,
});

/**
 * Painel = a leitura visual. Só gráficos e indicadores; nada em formato de
 * lista/tabela — isso é trabalho de /reports.
 *
 * O filtro aceita vários meses ao mesmo tempo, então todos os gráficos abaixo
 * passam a somar o período escolhido. Lista vazia = base inteira.
 */
function PainelPagamentos() {
  const hoje = hojeISO();
  // Abre no mês corrente; o filtro permite marcar mais meses ou limpar (= tudo).
  const [meses, setMeses] = useState<string[]>([mesAtual()]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["painel-pagamentos"],
    queryFn: fetchPagamentos,
  });

  const rubricas = useMemo(() => data?.rubricas ?? [], [data]);
  const pagamentos = useMemo(() => data?.pagamentos ?? [], [data]);

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

  const mesesDisponiveis = useMemo(
    () =>
      Array.from(new Set(pagamentos.map((p) => p.mes_ref)))
        .filter(Boolean)
        .sort()
        .reverse(),
    [pagamentos],
  );

  // Nenhum mês marcado = base inteira.
  const doPeriodo = useMemo(
    () => (meses.length === 0 ? pagamentos : pagamentos.filter((p) => meses.includes(p.mes_ref))),
    [pagamentos, meses],
  );

  // Comparativo entre meses: sempre a base inteira, senão o gráfico ficaria
  // com uma barra só quando o filtro tivesse um mês — que é o caso comum.
  const porMes = useMemo(() => {
    const m = new Map<string, { pago: number; pendente: number }>();
    for (const p of pagamentos) {
      const ef = statusEfetivo(p, hoje);
      const cur = m.get(p.mes_ref) ?? { pago: 0, pendente: 0 };
      if (ef === "pago") cur.pago += p.valor_centavos;
      else cur.pendente += p.valor_centavos;
      m.set(p.mes_ref, cur);
    }
    return Array.from(m, ([mesRef, v]) => ({
      mesRef,
      label: mesCurto(mesRef),
      pago: v.pago / 100,
      pendente: v.pendente / 100,
      destacado: meses.length === 0 || meses.includes(mesRef),
    })).sort((a, b) => a.mesRef.localeCompare(b.mesRef));
  }, [pagamentos, hoje, meses]);

  const ag = useMemo(() => {
    const total = doPeriodo.reduce((s, p) => s + p.valor_centavos, 0);
    let pago = 0, aPagar = 0, vencido = 0, fixo = 0, variavel = 0, imposto = 0;
    const porGrupo = new Map<string, number>();
    const porDepto = new Map<string, number>();
    const porDia = new Map<number, number>();
    const porRubrica = new Map<string, { cents: number; count: number }>();
    let projVencido = 0, projAte7 = 0, projAte30 = 0, projDepois = 0;
    let qtdVencidas = 0;
    const hojeMs = new Date(hoje).getTime();

    for (const p of doPeriodo) {
      const ef = statusEfetivo(p, hoje);
      if (ef === "pago") pago += p.valor_centavos;
      else if (ef === "atrasado") { vencido += p.valor_centavos; qtdVencidas++; }
      else aPagar += p.valor_centavos;

      if (p.tipo === "imposto") imposto += p.valor_centavos;
      else if (p.tipo === "fixo") fixo += p.valor_centavos;
      else variavel += p.valor_centavos;

      const g = grupoDaRubrica.get(p.rubrica_codigo) ?? "Sem grupo";
      porGrupo.set(g, (porGrupo.get(g) ?? 0) + p.valor_centavos);

      const d = p.departamento || "—";
      porDepto.set(d, (porDepto.get(d) ?? 0) + p.valor_centavos);

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

    return {
      total, pago, aPagar, vencido, fixo, variavel, imposto, qtdVencidas,
      porGrupo: toArr(porGrupo).slice(0, 8),
      porDepto: toArr(porDepto),
      cronograma: Array.from(porDia, ([dia, cents]) => ({ dia, valor: cents / 100 })).sort(
        (a, b) => a.dia - b.dia,
      ),
      ticketRubrica: Array.from(porRubrica, ([nome, v]) => ({
        nome, ticket: v.cents / v.count / 100, count: v.count,
      }))
        .sort((a, b) => b.ticket - a.ticket)
        .slice(0, 8),
      projecao: { vencido: projVencido, ate7: projAte7, ate30: projAte30, depois: projDepois },
      pctPago: total > 0 ? Math.round((pago / total) * 100) : 0,
    };
  }, [doPeriodo, grupoDaRubrica, nomeDaRubrica, hoje]);

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

  const periodoLabel =
    meses.length === 0
      ? "toda a base"
      : meses.length === 1
        ? mesCurto(meses[0])
        : `${meses.length} meses`;

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Painel</h1>
          <span className="text-sm text-muted-foreground">· {periodoLabel}</span>
        </div>
        <FiltroMeses meses={mesesDisponiveis} selecionados={meses} onMudar={setMeses} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : doPeriodo.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <p>Nenhum pagamento nos meses selecionados.</p>
            {meses.length > 0 && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setMeses([])}>
                Ver todos os meses
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi titulo="Total do período" cents={ag.total} sub={`${doPeriodo.length} lançamentos`}>
              <div className="mt-3">
                <Progress value={ag.pctPago} className="h-1.5" />
                <div className="mt-1 text-xs text-muted-foreground">{ag.pctPago}% pago</div>
              </div>
            </Kpi>
            <Kpi titulo="Pago" cents={ag.pago} tone="emerald" />
            <Kpi titulo="A pagar (no prazo)" cents={ag.aPagar} tone="amber" />
            <Kpi titulo="Vencido" cents={ag.vencido} tone="red" sub={`${ag.qtdVencidas} conta(s)`} />
          </div>

          {/* Comparativo mês a mês */}
          <ChartCard titulo="Comparativo mês a mês (pago x pendente)">
            {porMes.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={porMes} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <YAxis tickFormatter={kBRL} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <RTooltip content={<MoneyTooltip stacked />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {/* meses fora do filtro ficam esmaecidos, para dar contexto sem confundir */}
                  <Bar dataKey="pago" name="Pago" stackId="m" fill={STATUS_META.pago.color}>
                    {porMes.map((d) => (
                      <Cell key={d.mesRef} fillOpacity={d.destacado ? 1 : 0.25} />
                    ))}
                  </Bar>
                  <Bar dataKey="pendente" name="Pendente" stackId="m" fill={STATUS_META.a_pagar.color} radius={[4, 4, 0, 0]}>
                    {porMes.map((d) => (
                      <Cell key={d.mesRef} fillOpacity={d.destacado ? 1 : 0.25} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Vazio />
            )}
          </ChartCard>

          {/* Status + tipo */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard titulo="Por status">
              {statusData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="valor" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {statusData.map((d) => <Cell key={d.key} fill={d.color} />)}
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
                    <Pie data={tipoData} dataKey="valor" nameKey="nome" innerRadius={55} outerRadius={90} paddingAngle={2}>
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

          {/* Por grupo + por departamento */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard titulo="Por grupo de rubrica (nível 1)">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ag.porGrupo} layout="vertical" margin={{ left: 12, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" tickFormatter={kBRL} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <RTooltip content={<MoneyTooltip />} />
                  <Bar dataKey="valor" fill="var(--color-chart-1)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard titulo="Por departamento">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ag.porDepto} layout="vertical" margin={{ left: 12, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" tickFormatter={kBRL} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <RTooltip content={<MoneyTooltip />} />
                  <Bar dataKey="valor" fill="var(--color-chart-2)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Cronograma */}
          <ChartCard titulo="Cronograma de vencimentos (em aberto) — por dia do mês" tall>
            {ag.cronograma.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ag.cronograma} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <YAxis tickFormatter={kBRL} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                  <RTooltip content={<MoneyTooltip labelPrefix="Dia " />} />
                  <Bar dataKey="valor" fill="var(--color-chart-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Vazio texto="Nada em aberto no período 🎉" />
            )}
          </ChartCard>

          {/* Projeção + ticket médio */}
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
                  <BarChart data={ag.ticketRubrica} layout="vertical" margin={{ left: 12, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                    <XAxis type="number" tickFormatter={kBRL} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
                    <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                    <RTooltip content={<MoneyTooltip />} />
                    <Bar dataKey="ticket" fill="var(--color-chart-3)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Vazio />
              )}
            </ChartCard>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pb-2 text-sm text-muted-foreground">
            <TableProperties className="h-4 w-4" />
            <span>Listas e tabelas (a vencer, vencidos, fornecedores) estão em</span>
            <Link to="/reports" className="font-medium text-primary hover:underline">
              Relatórios
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
