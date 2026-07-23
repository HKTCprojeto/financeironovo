import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Lock,
  AlertTriangle,
  Settings2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import {
  avaliarTravas,
  despesasMes,
  estadoLimite,
  escopoLabel,
  formatCents,
  gastoEscopo,
  mesAtual,
  mesLabel,
  parseBRLToCents,
  shiftMes,
  type Categoria,
  type Despesa,
  type Escopo,
  type Limite,
  type ModoTrava,
  type Natureza,
} from "@/lib/financeiro";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({ meta: [{ title: "Financeiro — HKTC" }] }),
  component: FinanceiroPage,
});

// ---------- data layer ----------
async function fetchFinanceiro() {
  const [cat, desp, lim] = await Promise.all([
    supabase.from("fin_categorias").select("*").order("nome"),
    supabase.from("fin_despesas").select("*").eq("excluido", false).order("data", { ascending: false }),
    supabase.from("fin_limites").select("*"),
  ]);
  if (cat.error) throw cat.error;
  if (desp.error) throw desp.error;
  if (lim.error) throw lim.error;
  return {
    categorias: (cat.data ?? []) as Categoria[],
    despesas: (desp.data ?? []) as Despesa[],
    limites: ((lim.data ?? []) as unknown[]).map((l) => {
      const row = l as Limite & { alertas_pct: unknown };
      return { ...row, alertas_pct: Array.isArray(row.alertas_pct) ? (row.alertas_pct as number[]) : [80] } as Limite;
    }),
  };
}

const CORES = [
  "#2f6fb0", "#3b4e8c", "#4b8ca6", "#5a6b8c", "#c77d2e",
  "#b5563f", "#7a54a3", "#567d46", "#a64c8a", "#2e8b8b",
];

function estadoColor(estado: "ok" | "warn" | "danger"): string {
  return estado === "danger" ? "text-destructive" : estado === "warn" ? "text-amber-500" : "text-emerald-500";
}

function FinanceiroPage() {
  const qc = useQueryClient();
  const [mes, setMes] = useState<string>(mesAtual());
  const { data, isLoading, error } = useQuery({ queryKey: ["financeiro"], queryFn: fetchFinanceiro });

  const categorias = data?.categorias ?? [];
  const despesas = data?.despesas ?? [];
  const limites = data?.limites ?? [];
  const catAtivas = useMemo(() => categorias.filter((c) => !c.arquivada), [categorias]);
  const catById = (id: string) => categorias.find((c) => c.id === id);

  const reload = () => qc.invalidateQueries({ queryKey: ["financeiro"] });

  // KPIs do mês
  const totFixo = gastoEscopo(despesas, "totalFixas", null, mes);
  const totVar = gastoEscopo(despesas, "totalVariaveis", null, mes);
  const totGeral = totFixo + totVar;
  const limFixo = limites.find((l) => l.escopo === "totalFixas");
  const limVar = limites.find((l) => l.escopo === "totalVariaveis");
  const limGeral = limites.find((l) => l.escopo === "totalGeral");

  const doMes = despesasMes(despesas, mes);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Erro ao carregar o Financeiro
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{(error as Error).message}</p>
            <p>
              Se a mensagem menciona uma tabela inexistente, é preciso aplicar a migration{" "}
              <code>supabase/migrations/20260723000000_financeiro_module.sql</code> no projeto Supabase.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Cabeçalho + navegação de mês */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setMes(shiftMes(mes, -1))} aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[160px] text-center font-semibold capitalize">{mesLabel(mes)}</span>
          <Button variant="outline" size="icon" onClick={() => setMes(shiftMes(mes, 1))} aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {mes !== mesAtual() && (
            <Button variant="ghost" size="sm" onClick={() => setMes(mesAtual())}>
              Hoje
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <Tabs defaultValue="painel">
          <TabsList>
            <TabsTrigger value="painel">Painel</TabsTrigger>
            <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
            <TabsTrigger value="config">
              <Settings2 className="mr-1 h-3.5 w-3.5" /> Configurar
            </TabsTrigger>
          </TabsList>

          {/* ---------------- PAINEL ---------------- */}
          <TabsContent value="painel" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard titulo="Gastos fixos" valor={totFixo} lim={limFixo} despesas={despesas} mes={mes} />
              <KpiCard titulo="Gastos variáveis" valor={totVar} lim={limVar} despesas={despesas} mes={mes} />
              <KpiCard titulo="Total do mês" valor={totGeral} lim={limGeral} despesas={despesas} mes={mes} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por categoria</CardTitle>
              </CardHeader>
              <CardContent>
                {catAtivas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma categoria ainda. Crie categorias na aba <b>Configurar</b>.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {catAtivas.map((c) => {
                      const gasto = gastoEscopo(despesas, "categoria", c.id, mes);
                      const lim = limites.find((l) => l.escopo === "categoria" && l.alvo === c.id);
                      const est = lim ? estadoLimite(lim, despesas, mes) : null;
                      const pct = est && est.teto > 0 ? Math.min(100, est.pct) : 0;
                      return (
                        <div key={c.id} className="rounded-lg border p-3">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.cor }} />
                            <span className="text-sm font-medium">{c.nome}</span>
                            <Badge variant="outline" className="ml-auto text-[10px]">
                              {c.natureza === "fixa" ? "Fixa" : "Variável"}
                            </Badge>
                          </div>
                          <div className="font-mono text-lg font-semibold">{formatCents(gasto)}</div>
                          {lim && est ? (
                            <>
                              <Progress value={pct} className="mt-2 h-1.5" />
                              <div className={`mt-1 text-xs ${estadoColor(est.estado)}`}>
                                {est.estado === "danger"
                                  ? `Estourou o teto de ${formatCents(est.teto)}`
                                  : `${formatCents(est.resta)} de ${formatCents(est.teto)} restante`}
                              </div>
                            </>
                          ) : (
                            <div className="mt-2 text-xs text-muted-foreground">sem teto definido</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- LANÇAMENTOS ---------------- */}
          <TabsContent value="lancamentos" className="space-y-6">
            <LancarDespesa
              categorias={catAtivas}
              despesas={despesas}
              limites={limites}
              mes={mes}
              onSaved={reload}
            />
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Despesas de {mesLabel(mes)}</CardTitle>
              </CardHeader>
              <CardContent>
                {doMes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma despesa lançada neste mês.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {doMes.map((d) => {
                        const c = d.categoria_id ? catById(d.categoria_id) : undefined;
                        return (
                          <TableRow key={d.id}>
                            <TableCell className="font-medium">
                              {d.descricao || <span className="text-muted-foreground">(sem descrição)</span>}
                              {d.justificativa && (
                                <span className="ml-2 text-xs text-amber-500" title={d.justificativa}>
                                  • furou trava
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {c ? (
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full" style={{ background: c.cor }} />
                                  {c.nome}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>{d.data.split("-").reverse().join("/")}</TableCell>
                            <TableCell className="text-right font-mono">{formatCents(d.amount_cents)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={async () => {
                                  const { error: e } = await supabase
                                    .from("fin_despesas")
                                    .update({ excluido: true })
                                    .eq("id", d.id);
                                  if (e) toast.error("Erro ao excluir: " + e.message);
                                  else {
                                    toast.success("Despesa removida");
                                    reload();
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- CONFIGURAR ---------------- */}
          <TabsContent value="config" className="space-y-6">
            <ConfigCategorias categorias={categorias} onSaved={reload} />
            <ConfigLimites categorias={categorias} limites={limites} onSaved={reload} catById={catById} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ---------- KPI card com barra de limite ----------
function KpiCard({
  titulo,
  valor,
  lim,
  despesas,
  mes,
}: {
  titulo: string;
  valor: number;
  lim: Limite | undefined;
  despesas: Despesa[];
  mes: string;
}) {
  const est = lim ? estadoLimite(lim, despesas, mes) : null;
  const pct = est && est.teto > 0 ? Math.min(100, est.pct) : 0;
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-sm text-muted-foreground">{titulo}</div>
        <div className="mt-1 font-mono text-2xl font-bold">{formatCents(valor)}</div>
        {lim && est ? (
          <>
            <Progress value={pct} className="mt-3 h-2" />
            <div className={`mt-1.5 text-xs ${estadoColor(est.estado)}`}>
              {est.estado === "danger"
                ? `Acima do limite de ${formatCents(est.teto)}`
                : `Limite ${formatCents(est.teto)} · resta ${formatCents(est.resta)}`}
            </div>
          </>
        ) : (
          <div className="mt-3 text-xs text-muted-foreground">sem limite definido</div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------- Lançar despesa (com motor de travas) ----------
function LancarDespesa({
  categorias,
  despesas,
  limites,
  mes,
  onSaved,
}: {
  categorias: Categoria[];
  despesas: Despesa[];
  limites: Limite[];
  mes: string;
  onSaved: () => void;
}) {
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [salvando, setSalvando] = useState(false);
  const [confirm, setConfirm] = useState<null | {
    cents: number;
    avisos: ReturnType<typeof avaliarTravas>["avisos"];
  }>(null);
  const [justificativa, setJustificativa] = useState("");

  const cents = parseBRLToCents(valor);
  const cat = categorias.find((c) => c.id === categoriaId);

  const inserir = async (payload: {
    cents: number;
    natureza: Natureza;
    justificativa?: string | null;
  }) => {
    setSalvando(true);
    const { data: sess } = await supabase.auth.getUser();
    const { error } = await supabase.from("fin_despesas").insert({
      user_id: sess.user?.id,
      descricao: descricao.trim(),
      amount_cents: payload.cents,
      tipo: payload.natureza,
      categoria_id: categoriaId || null,
      mes_ref: mes,
      justificativa: payload.justificativa ?? null,
    });
    setSalvando(false);
    if (error) {
      toast.error("Erro ao lançar: " + error.message);
      return;
    }
    toast.success("Despesa lançada");
    setDescricao("");
    setValor("");
    setJustificativa("");
    setConfirm(null);
    onSaved();
  };

  const onSubmit = async () => {
    if (cents == null) {
      toast.error("Valor inválido");
      return;
    }
    if (!cat) {
      toast.error("Escolha uma categoria");
      return;
    }
    const res = avaliarTravas(limites, despesas, {
      categoriaId,
      natureza: cat.natureza,
      ym: mes,
      valorNovo: cents,
    });
    if (res.bloqueia) {
      const b = res.bloqueios[0];
      toast.error(
        `Bloqueado por trava rígida${b.escalado ? " (limiar flexível)" : ""}. ` +
          `Cabe no máximo ${formatCents(res.maxCabe ?? 0)} neste escopo.`,
      );
      return;
    }
    if (res.avisos.length > 0) {
      setConfirm({ cents, avisos: res.avisos });
      return;
    }
    await inserir({ cents, natureza: cat.natureza });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Lançar despesa</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-[1fr_140px_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Conta de luz" />
          </div>
          <div className="space-y-1.5">
            <Label>Valor</Label>
            <Input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="R$ 0,00"
              inputMode="decimal"
              className={valor && cents == null ? "border-destructive" : ""}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha…" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} · {c.natureza === "fixa" ? "fixa" : "variável"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onSubmit} disabled={salvando || cents == null || !categoriaId}>
            <Plus className="mr-1 h-4 w-4" /> Lançar
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Todo gasto é fixo ou variável (pela categoria) e passa pelas travas antes de ser lançado.
        </p>
      </CardContent>

      {/* Confirmação de trava flexível */}
      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" /> Trava flexível: acima do teto
            </DialogTitle>
            <DialogDescription>
              Este lançamento ultrapassa {confirm?.avisos.length === 1 ? "um limite flexível" : "alguns limites flexíveis"}.
              Você pode lançar mesmo assim, registrando uma justificativa.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {confirm?.avisos.map((a) => (
              <li key={a.lim.id} className="text-muted-foreground">
                • Excede em <b className="text-foreground">{formatCents(a.excedente)}</b> (teto{" "}
                {formatCents(a.lim.limite_centavos)})
              </li>
            ))}
          </ul>
          <div className="space-y-1.5">
            <Label>Justificativa</Label>
            <Input
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              placeholder="Por que esse gasto é necessário?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              disabled={salvando || !justificativa.trim()}
              onClick={() =>
                cat && confirm && inserir({ cents: confirm.cents, natureza: cat.natureza, justificativa })
              }
            >
              Lançar assim mesmo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- Config: categorias ----------
function ConfigCategorias({ categorias, onSaved }: { categorias: Categoria[]; onSaved: () => void }) {
  const [edit, setEdit] = useState<null | Partial<Categoria>>(null);

  const salvar = async () => {
    if (!edit || !edit.nome?.trim()) {
      toast.error("Informe o nome");
      return;
    }
    const { data: sess } = await supabase.auth.getUser();
    const row = {
      nome: edit.nome.trim(),
      natureza: (edit.natureza ?? "variavel") as Natureza,
      cor: edit.cor ?? CORES[0],
    };
    let error;
    if (edit.id) {
      ({ error } = await supabase.from("fin_categorias").update(row).eq("id", edit.id));
    } else {
      ({ error } = await supabase.from("fin_categorias").insert({ ...row, user_id: sess.user?.id }));
    }
    if (error) toast.error(error.message);
    else {
      toast.success("Categoria salva");
      setEdit(null);
      onSaved();
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Categorias</CardTitle>
        <Button size="sm" onClick={() => setEdit({ natureza: "variavel", cor: CORES[0] })}>
          <Plus className="mr-1 h-4 w-4" /> Nova
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {categorias.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma categoria.</p>}
        {categorias.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-md border p-2">
            <span className="h-3 w-3 rounded-full" style={{ background: c.cor }} />
            <span className="font-medium">{c.nome}</span>
            <Badge variant="outline" className="text-[10px]">
              {c.natureza === "fixa" ? "Fixa" : "Variável"}
            </Badge>
            {c.arquivada && <Badge variant="secondary">arquivada</Badge>}
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => setEdit(c)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  const { error } = await supabase
                    .from("fin_categorias")
                    .update({ arquivada: !c.arquivada })
                    .eq("id", c.id);
                  if (error) toast.error(error.message);
                  else onSaved();
                }}
                title={c.arquivada ? "Reativar" : "Arquivar"}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={edit?.nome ?? ""} onChange={(e) => setEdit((s) => ({ ...s, nome: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Natureza</Label>
              <Select
                value={edit?.natureza ?? "variavel"}
                onValueChange={(v) => setEdit((s) => ({ ...s, natureza: v as Natureza }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixa">Fixa</SelectItem>
                  <SelectItem value="variavel">Variável</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {CORES.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    onClick={() => setEdit((s) => ({ ...s, cor }))}
                    className={`h-7 w-7 rounded-full border-2 ${edit?.cor === cor ? "border-foreground" : "border-transparent"}`}
                    style={{ background: cor }}
                    aria-label={cor}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button onClick={salvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ---------- Config: limites / travas ----------
const ESCOPOS: { value: Escopo; label: string }[] = [
  { value: "categoria", label: "Uma categoria" },
  { value: "totalFixas", label: "Total de gastos fixos" },
  { value: "totalVariaveis", label: "Total de gastos variáveis" },
  { value: "totalGeral", label: "Total geral do mês" },
];

function ConfigLimites({
  categorias,
  limites,
  onSaved,
  catById,
}: {
  categorias: Categoria[];
  limites: Limite[];
  onSaved: () => void;
  catById: (id: string) => Categoria | undefined;
}) {
  const [edit, setEdit] = useState<null | {
    id?: string;
    escopo: Escopo;
    alvo: string | null;
    valorStr: string;
    modo: ModoTrava;
    limiarStr: string;
  }>(null);

  const abrirNovo = () =>
    setEdit({ escopo: "totalGeral", alvo: null, valorStr: "", modo: "soft", limiarStr: "110" });

  const salvar = async () => {
    if (!edit) return;
    const cents = parseBRLToCents(edit.valorStr);
    if (cents == null) {
      toast.error("Valor do teto inválido");
      return;
    }
    if (edit.escopo === "categoria" && !edit.alvo) {
      toast.error("Escolha a categoria alvo");
      return;
    }
    const limiar = edit.modo === "soft" && edit.limiarStr ? Number(edit.limiarStr) : null;
    const { data: sess } = await supabase.auth.getUser();
    const row = {
      escopo: edit.escopo,
      alvo: edit.escopo === "categoria" ? edit.alvo : null,
      limite_centavos: cents,
      modo: edit.modo,
      limiar_hard_pct: limiar,
    };
    let error;
    if (edit.id) {
      ({ error } = await supabase.from("fin_limites").update(row).eq("id", edit.id));
    } else {
      ({ error } = await supabase.from("fin_limites").insert({ ...row, user_id: sess.user?.id }));
    }
    if (error) toast.error(error.message);
    else {
      toast.success("Trava salva");
      setEdit(null);
      onSaved();
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4" /> Limites e travas
        </CardTitle>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="mr-1 h-4 w-4" /> Nova trava
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {limites.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma trava. Trava <b>rígida</b> bloqueia o lançamento; <b>flexível</b> avisa e permite lançar com
            justificativa — e vira rígida acima do % informado.
          </p>
        )}
        {limites.map((l) => (
          <div key={l.id} className="flex items-center gap-3 rounded-md border p-2">
            {l.modo === "hard" ? (
              <Lock className="h-4 w-4 text-destructive" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            <span className="font-medium">{escopoLabel(l, catById)}</span>
            <Badge variant="outline">{l.modo === "hard" ? "Rígida" : "Flexível"}</Badge>
            <span className="font-mono text-sm">{formatCents(l.limite_centavos)}</span>
            {l.modo === "soft" && l.limiar_hard_pct != null && (
              <span className="text-xs text-muted-foreground">bloqueia acima de {l.limiar_hard_pct}%</span>
            )}
            <div className="ml-auto flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  setEdit({
                    id: l.id,
                    escopo: l.escopo,
                    alvo: l.alvo,
                    valorStr: (l.limite_centavos / 100).toString().replace(".", ","),
                    modo: l.modo,
                    limiarStr: l.limiar_hard_pct != null ? String(l.limiar_hard_pct) : "",
                  })
                }
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  const { error } = await supabase.from("fin_limites").delete().eq("id", l.id);
                  if (error) toast.error(error.message);
                  else onSaved();
                }}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Editar trava" : "Nova trava"}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Aplica-se a</Label>
                <Select value={edit.escopo} onValueChange={(v) => setEdit({ ...edit, escopo: v as Escopo })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESCOPOS.map((e) => (
                      <SelectItem key={e.value} value={e.value}>
                        {e.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {edit.escopo === "categoria" && (
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Select value={edit.alvo ?? ""} onValueChange={(v) => setEdit({ ...edit, alvo: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha…" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias
                        .filter((c) => !c.arquivada)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Teto (R$)</Label>
                <Input
                  value={edit.valorStr}
                  onChange={(e) => setEdit({ ...edit, valorStr: e.target.value })}
                  placeholder="R$ 0,00"
                  inputMode="decimal"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de trava</Label>
                <Select value={edit.modo} onValueChange={(v) => setEdit({ ...edit, modo: v as ModoTrava })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soft">Flexível (avisa e permite com justificativa)</SelectItem>
                    <SelectItem value="hard">Rígida (bloqueia)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {edit.modo === "soft" && (
                <div className="space-y-1.5">
                  <Label>Bloquear acima de (% do teto)</Label>
                  <Input
                    value={edit.limiarStr}
                    onChange={(e) => setEdit({ ...edit, limiarStr: e.target.value })}
                    placeholder="Ex.: 110"
                    inputMode="numeric"
                  />
                  <p className="text-xs text-muted-foreground">
                    Deixe em branco para nunca escalar para bloqueio.
                  </p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button onClick={salvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
