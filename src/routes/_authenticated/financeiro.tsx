import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wallet,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  ShieldAlert,
  Bell,
  ArrowRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatCents, mesAtual, mesCurto, parseBRLToCents } from "@/lib/financeiro";
import { ehAdmin } from "@/lib/admin";
import { fetchPagamentos, hojeISO, statusEfetivo } from "@/lib/pagamentos-dados";
import { FiltroMeses, Kpi } from "@/components/pagamentos-ui";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — HKTC" }] }),
  component: FinanceiroPage,
});

type Escopo = "total" | "departamento" | "grupo" | "rubrica";

type Orcamento = {
  id: string;
  escopo: Escopo;
  alvo: string | null;
  limite_centavos: number;
  modo: "aviso" | "bloqueio";
  alerta_pct: number;
  mes_ref: string | null;
  ativo: boolean;
  observacao: string | null;
};

const ESCOPO_LABEL: Record<Escopo, string> = {
  total: "Total da empresa",
  departamento: "Departamento",
  grupo: "Grupo de rubrica",
  rubrica: "Rubrica",
};

async function fetchOrcamentos(): Promise<Orcamento[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data, error } = await sb.from("fin_orcamentos").select("*").order("escopo");
  if (error) throw error;
  return (data ?? []) as Orcamento[];
}

function FinanceiroPage() {
  const hoje = hojeISO();
  const qc = useQueryClient();
  const [meses, setMeses] = useState<string[]>([mesAtual()]);
  const [editando, setEditando] = useState<Orcamento | null>(null);
  const [criando, setCriando] = useState(false);

  const pagQ = useQuery({ queryKey: ["painel-pagamentos"], queryFn: fetchPagamentos });
  const orcQ = useQuery({ queryKey: ["fin-orcamentos"], queryFn: fetchOrcamentos });

  // Só esconde os botões — quem barra de verdade é a RLS (policy fin_orcamentos_admin).
  const [souAdmin, setSouAdmin] = useState(false);
  useEffect(() => {
    let vivo = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (vivo) setSouAdmin(ehAdmin(data.user?.email));
    });
    return () => {
      vivo = false;
    };
  }, []);

  const rubricas = useMemo(() => pagQ.data?.rubricas ?? [], [pagQ.data]);
  const pagamentos = useMemo(() => pagQ.data?.pagamentos ?? [], [pagQ.data]);
  const orcamentos = useMemo(() => orcQ.data ?? [], [orcQ.data]);

  const grupoDaRubrica = useMemo(() => {
    const m = new Map<string, string>();
    rubricas.forEach((r) => m.set(r.codigo, r.nivel1_nome || "Sem grupo"));
    return m;
  }, [rubricas]);

  const mesesDisponiveis = useMemo(
    () => Array.from(new Set(pagamentos.map((p) => p.mes_ref))).filter(Boolean).sort().reverse(),
    [pagamentos],
  );

  // Meses efetivamente em análise. Filtro vazio = todos os que existem na base.
  const mesesAtivos = useMemo(
    () => (meses.length === 0 ? mesesDisponiveis : meses),
    [meses, mesesDisponiveis],
  );

  const doPeriodo = useMemo(
    () => pagamentos.filter((p) => mesesAtivos.includes(p.mes_ref)),
    [pagamentos, mesesAtivos],
  );

  /**
   * Quanto cada teto já consumiu, e de quanto ele é no período.
   *
   * O teto é MENSAL. Com vários meses selecionados, somar o realizado dos três
   * contra um teto de um mês daria estouro falso — então o teto de cada mês é
   * resolvido individualmente (o do mês específico ganha do recorrente) e só
   * depois somado.
   */
  const linhas = useMemo(() => {
    const casa = (o: Orcamento, p: (typeof doPeriodo)[number]) => {
      if (o.escopo === "total") return true;
      if (o.escopo === "departamento") return (p.departamento || null) === o.alvo;
      if (o.escopo === "grupo") return grupoDaRubrica.get(p.rubrica_codigo) === o.alvo;
      return p.rubrica_codigo === o.alvo;
    };

    // por escopo+alvo, guarda o recorrente e os específicos por mês
    const porChave = new Map<string, { recorrente?: Orcamento; porMes: Map<string, Orcamento> }>();
    for (const o of orcamentos) {
      if (!o.ativo) continue;
      const k = `${o.escopo}|${o.alvo ?? ""}`;
      const e = porChave.get(k) ?? { porMes: new Map<string, Orcamento>() };
      if (o.mes_ref) e.porMes.set(o.mes_ref, o);
      else e.recorrente = o;
      porChave.set(k, e);
    }

    const saida: Array<{
      chave: string;
      referencia: Orcamento;
      tetoPeriodo: number;
      gasto: number;
      pct: number;
      mesesComTeto: number;
    }> = [];

    for (const [chave, e] of porChave) {
      let tetoPeriodo = 0;
      let mesesComTeto = 0;
      let referencia: Orcamento | undefined;
      for (const m of mesesAtivos) {
        const o = e.porMes.get(m) ?? e.recorrente;
        if (!o) continue;
        tetoPeriodo += o.limite_centavos;
        mesesComTeto += 1;
        referencia = referencia ?? o;
      }
      if (!referencia) continue;
      const gasto = doPeriodo.filter((p) => casa(referencia, p))
        .reduce((s, p) => s + p.valor_centavos, 0);
      saida.push({
        chave,
        referencia,
        tetoPeriodo,
        gasto,
        pct: tetoPeriodo > 0 ? Math.round((gasto / tetoPeriodo) * 100) : 0,
        mesesComTeto,
      });
    }

    // pior situação primeiro: é o que precisa de decisão
    return saida.sort((a, b) => b.pct - a.pct);
  }, [orcamentos, doPeriodo, grupoDaRubrica, mesesAtivos]);

  const estourados = linhas.filter((l) => l.gasto > l.tetoPeriodo);
  const emAlerta = linhas.filter(
    (l) => l.gasto <= l.tetoPeriodo && l.pct >= l.referencia.alerta_pct,
  );

  // Departamentos com gasto e sem teto — o que ainda não está sob controle.
  const semTeto = useMemo(() => {
    const comTeto = new Set(
      orcamentos.filter((o) => o.escopo === "departamento" && o.ativo).map((o) => o.alvo),
    );
    const m = new Map<string, number>();
    for (const p of doPeriodo) {
      const d = p.departamento || "—";
      if (comTeto.has(d)) continue;
      m.set(d, (m.get(d) ?? 0) + p.valor_centavos);
    }
    return Array.from(m, ([nome, cents]) => ({ nome, cents })).sort((a, b) => b.cents - a.cents);
  }, [orcamentos, doPeriodo]);

  const totalPeriodo = doPeriodo.reduce((s, p) => s + p.valor_centavos, 0);
  const pendente = doPeriodo
    .filter((p) => statusEfetivo(p, hoje) !== "pago")
    .reduce((s, p) => s + p.valor_centavos, 0);

  const alvosPossiveis = useMemo(
    () => ({
      departamento: Array.from(new Set(pagamentos.map((p) => p.departamento || "—"))).sort(),
      grupo: Array.from(new Set(rubricas.map((r) => r.nivel1_nome || "Sem grupo"))).sort(),
      rubrica: rubricas.map((r) => ({ codigo: r.codigo, nome: r.nome })).sort((a, b) =>
        a.nome.localeCompare(b.nome, "pt-BR"),
      ),
    }),
    [pagamentos, rubricas],
  );

  const recarregar = () => qc.invalidateQueries({ queryKey: ["fin-orcamentos"] });

  if (pagQ.error || orcQ.error) {
    const e = (pagQ.error ?? orcQ.error) as Error;
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Erro ao carregar o Financeiro
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{e.message}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <span className="text-sm text-muted-foreground">· orçamento e travas</span>
        </div>
        <div className="flex items-center gap-2">
          <FiltroMeses meses={mesesDisponiveis} selecionados={meses} onMudar={setMeses} />
          {souAdmin && (
            <Button onClick={() => setCriando(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Novo teto
            </Button>
          )}
        </div>
      </div>

      {pagQ.isLoading || orcQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi titulo="Realizado no período" cents={totalPeriodo} sub={`${doPeriodo.length} lançamentos`} />
            <Kpi titulo="Ainda em aberto" cents={pendente} tone="amber" />
            <Kpi
              titulo="Tetos definidos"
              cents={linhas.reduce((s, l) => s + l.tetoPeriodo, 0)}
              sub={`${linhas.length} orçamento(s)`}
            />
            <Kpi
              titulo="Estouros"
              cents={estourados.reduce((s, l) => s + (l.gasto - l.tetoPeriodo), 0)}
              tone={estourados.length ? "red" : undefined}
              sub={`${estourados.length} acima do teto`}
            />
          </div>

          {linhas.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="font-medium">Nenhum teto definido ainda</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Sem orçamento, o sistema mostra quanto foi gasto mas não diz se está dentro do
                  combinado. Defina um teto por departamento ou para o total da empresa.
                </p>
                {souAdmin ? (
                  <Button className="mt-4 gap-1.5" onClick={() => setCriando(true)}>
                    <Plus className="h-4 w-4" /> Criar o primeiro
                  </Button>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Só o administrador define tetos.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {linhas.map((l) => (
                <LinhaOrcamento
                  key={l.chave}
                  linha={l}
                  souAdmin={souAdmin}
                  qtdMeses={mesesAtivos.length}
                  onEditar={() => setEditando(l.referencia)}
                  onExcluido={recarregar}
                />
              ))}
            </div>
          )}

          {(estourados.length > 0 || emAlerta.length > 0) && (
            <Card className={estourados.length ? "border-red-500/40" : "border-amber-500/40"}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bell className="h-4 w-4" /> Precisa de atenção
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                {estourados.map((l) => (
                  <p key={l.chave}>
                    <strong>{l.referencia.alvo ?? "Total da empresa"}</strong> estourou em{" "}
                    <strong className="text-red-600">
                      {formatCents(l.gasto - l.tetoPeriodo)}
                    </strong>
                    {l.referencia.modo === "bloqueio" && " — novos lançamentos estão bloqueados"}
                  </p>
                ))}
                {emAlerta.map((l) => (
                  <p key={l.chave} className="text-muted-foreground">
                    {l.referencia.alvo ?? "Total da empresa"} já consumiu {l.pct}% do teto
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {semTeto.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Departamentos sem teto</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {semTeto.map((d) => (
                  <div key={d.nome} className="flex items-center justify-between border-b py-1.5">
                    <span>{d.nome}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {formatCents(d.cents)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 pb-2 text-sm text-muted-foreground">
            <span>Detalhamento por rubrica e fornecedor está em</span>
            <Link to="/reports" className="font-medium text-primary hover:underline">
              Relatórios <ArrowRight className="inline h-3 w-3" />
            </Link>
          </div>
        </>
      )}

      {(criando || editando) && (
        <FormOrcamento
          orcamento={editando}
          alvos={alvosPossiveis}
          mesesDisponiveis={mesesDisponiveis}
          onFechar={() => {
            setCriando(false);
            setEditando(null);
          }}
          onSalvo={() => {
            setCriando(false);
            setEditando(null);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

function LinhaOrcamento({
  linha,
  souAdmin,
  qtdMeses,
  onEditar,
  onExcluido,
}: {
  linha: {
    chave: string;
    referencia: Orcamento;
    tetoPeriodo: number;
    gasto: number;
    pct: number;
    mesesComTeto: number;
  };
  souAdmin: boolean;
  qtdMeses: number;
  onEditar: () => void;
  onExcluido: () => void;
}) {
  const { referencia: o, tetoPeriodo, gasto, pct } = linha;
  const estourou = gasto > tetoPeriodo;
  const alertando = !estourou && pct >= o.alerta_pct;
  const cor = estourou ? "text-red-600" : alertando ? "text-amber-600" : "text-emerald-600";

  const excluir = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data, error } = await sb.from("fin_orcamentos").delete().eq("id", o.id).select("id");
    if (error) {
      toast.error("Não foi possível excluir", { description: error.message });
      return;
    }
    if (!(data ?? []).length) {
      toast.error("Nada foi excluído", { description: "Só o administrador pode remover tetos." });
      return;
    }
    toast.success("Teto removido");
    onExcluido();
  };

  return (
    <Card className={estourou ? "border-red-500/40" : ""}>
      <CardContent className="pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{o.alvo ?? "Total da empresa"}</span>
              <Badge variant="outline" className="font-normal">{ESCOPO_LABEL[o.escopo]}</Badge>
              {o.modo === "bloqueio" ? (
                <Badge variant="destructive" className="gap-1 font-normal">
                  <ShieldAlert className="h-3 w-3" /> Bloqueia
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 font-normal">
                  <Bell className="h-3 w-3" /> Avisa
                </Badge>
              )}
              {o.mes_ref && (
                <Badge variant="outline" className="font-normal">só {mesCurto(o.mes_ref)}</Badge>
              )}
            </div>
            {o.observacao && (
              <p className="mt-1 text-xs text-muted-foreground">{o.observacao}</p>
            )}
          </div>
          {souAdmin && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={onEditar} title="Editar">
                <Pencil className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" title="Remover">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover este teto?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {o.alvo ?? "O total da empresa"} deixa de ter limite
                      {o.modo === "bloqueio" && " e os lançamentos param de ser bloqueados"}.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={excluir}>Remover</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>

        <div className="mt-3">
          <Progress value={Math.min(100, pct)} className="h-2" />
          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className={`font-mono font-semibold ${cor}`}>
              {formatCents(gasto)} <span className="font-normal text-muted-foreground">de</span>{" "}
              {formatCents(tetoPeriodo)}
            </span>
            <span className={`text-xs ${cor}`}>
              {pct}%
              {estourou && ` · estourou em ${formatCents(gasto - tetoPeriodo)}`}
              {alertando && ` · alerta a partir de ${o.alerta_pct}%`}
            </span>
          </div>
          {qtdMeses > 1 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Teto mensal somado em {linha.mesesComTeto} mês(es) do período.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function FormOrcamento({
  orcamento,
  alvos,
  mesesDisponiveis,
  onFechar,
  onSalvo,
}: {
  orcamento: Orcamento | null;
  alvos: {
    departamento: string[];
    grupo: string[];
    rubrica: Array<{ codigo: string; nome: string }>;
  };
  mesesDisponiveis: string[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [escopo, setEscopo] = useState<Escopo>(orcamento?.escopo ?? "departamento");
  const [alvo, setAlvo] = useState<string>(orcamento?.alvo ?? "");
  const [limite, setLimite] = useState(
    orcamento ? (orcamento.limite_centavos / 100).toFixed(2).replace(".", ",") : "",
  );
  const [modo, setModo] = useState<"aviso" | "bloqueio">(orcamento?.modo ?? "aviso");
  const [alertaPct, setAlertaPct] = useState(String(orcamento?.alerta_pct ?? 80));
  const [mesRef, setMesRef] = useState<string>(orcamento?.mes_ref ?? "recorrente");
  const [observacao, setObservacao] = useState(orcamento?.observacao ?? "");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const cents = parseBRLToCents(limite);
    if (!cents || cents <= 0) {
      toast.error("Informe um valor de teto");
      return;
    }
    if (escopo !== "total" && !alvo) {
      toast.error("Escolha o alvo do teto");
      return;
    }
    const pct = Number(alertaPct);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
      toast.error("O alerta deve ficar entre 1% e 100%");
      return;
    }

    setSalvando(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const registro = {
      escopo,
      alvo: escopo === "total" ? null : alvo,
      limite_centavos: cents,
      modo,
      alerta_pct: pct,
      mes_ref: mesRef === "recorrente" ? null : mesRef,
      observacao: observacao.trim() || null,
      ativo: true,
    };
    const q = orcamento
      ? sb.from("fin_orcamentos").update(registro).eq("id", orcamento.id).select("id")
      : sb.from("fin_orcamentos").insert(registro).select("id");
    const { data, error } = await q;
    setSalvando(false);

    if (error) {
      const dup = /duplicate|unique/i.test(error.message);
      toast.error(dup ? "Já existe um teto para esse alvo e mês" : "Não foi possível salvar", {
        description: dup ? undefined : error.message,
      });
      return;
    }
    if (!(data ?? []).length) {
      toast.error("Nada foi salvo", { description: "Só o administrador define tetos." });
      return;
    }
    toast.success(orcamento ? "Teto atualizado" : "Teto criado");
    onSalvo();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{orcamento ? "Editar teto" : "Novo teto"}</DialogTitle>
          <DialogDescription>
            O teto vale por mês. Em modo bloqueio, lançamentos que ultrapassem o limite são
            recusados na hora de salvar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Aplicar em</Label>
              <Select
                value={escopo}
                onValueChange={(v) => {
                  setEscopo(v as Escopo);
                  setAlvo("");
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total da empresa</SelectItem>
                  <SelectItem value="departamento">Departamento</SelectItem>
                  <SelectItem value="grupo">Grupo de rubrica</SelectItem>
                  <SelectItem value="rubrica">Rubrica</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {escopo !== "total" && (
              <div className="space-y-1.5">
                <Label>Qual</Label>
                <Select value={alvo} onValueChange={setAlvo}>
                  <SelectTrigger><SelectValue placeholder="Escolher…" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {escopo === "departamento" &&
                      alvos.departamento.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    {escopo === "grupo" &&
                      alvos.grupo.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    {escopo === "rubrica" &&
                      alvos.rubrica.map((r) => (
                        <SelectItem key={r.codigo} value={r.codigo}>{r.nome}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Teto mensal (R$)</Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={limite}
                onChange={(e) => setLimite(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vale para</Label>
              <Select value={mesRef} onValueChange={setMesRef}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recorrente">Todo mês</SelectItem>
                  {mesesDisponiveis.map((m) => (
                    <SelectItem key={m} value={m}>só {mesCurto(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4" /> Bloquear ao ultrapassar
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {modo === "bloqueio"
                    ? "Lançamentos que estourem o teto serão recusados ao salvar."
                    : "Só avisa na tela; nada é impedido."}
                </p>
              </div>
              <Switch
                checked={modo === "bloqueio"}
                onCheckedChange={(v) => setModo(v ? "bloqueio" : "aviso")}
              />
            </div>
            {modo === "bloqueio" && (
              <p className="mt-2 rounded bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-500">
                Dar baixa em conta já paga continua liberado — o bloqueio só vale para valor e
                classificação, para não impedir de registrar o que já aconteceu.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Avisar a partir de (% do teto)</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={alertaPct}
              onChange={(e) => setAlertaPct(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <Input
              placeholder="Ex.: teto aprovado na reunião de julho"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
