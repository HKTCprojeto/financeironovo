import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Search, Undo2 } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { formatRelative } from "@/lib/format";
import { formatCents } from "@/lib/financeiro";
import { ehAdmin } from "@/lib/admin";
import { PageSkeleton, EmptyState } from "@/components/states";
import { PayloadDialog } from "./events";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [{ title: "Auditoria — Agente CFO" }] }),
  component: AuditPage,
});

type Row = {
  id: number;
  action: string;
  actor_user_id: string | null;
  payload: unknown;
  created_at: string;
};

// Campos cujo valor é em centavos — mostrar como moeda, não como número cru.
const CAMPOS_MOEDA = new Set(["valor_centavos", "teto_padrao_centavos"]);

// Ruído de banco: muda em toda escrita e não diz nada a quem audita.
const CAMPOS_OCULTOS = new Set(["updated_at", "created_at"]);

function valorLegivel(campo: string, v: unknown): string {
  if (v === null || v === undefined) return "vazio";
  if (CAMPOS_MOEDA.has(campo) && typeof v === "number") return formatCents(v);
  return String(v);
}

/** Grupo da ação: pagamento_alterado -> "pagamento". Usado no filtro por tipo. */
function grupoDaAcao(action: string): string {
  const p = action.split("_")[0];
  return ["pagamento", "rubrica", "usuario"].includes(p) ? p : "sistema";
}

// Campos que nunca entram num desfazer: identidade e carimbo de escrita.
const CAMPOS_NAO_RESTAURAVEIS = new Set(["id", "created_at", "updated_at"]);

/**
 * Qual lançamento este registro afeta. Usado para achar a alteração mais nova
 * do mesmo pagamento — só a última pode ser desfeita.
 */
function alvoDoRegistro(r: Row): string | null {
  const p = r.payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return null;
  if (typeof p.id === "string") return p.id;
  const reg = p.registro as Record<string, unknown> | undefined;
  return typeof reg?.id === "string" ? reg.id : null;
}

/**
 * Só pagamentos são reversíveis.
 *
 * - rubricas: a RLS só deixa service_role escrever, o desfazer falharia calado;
 * - usuários: conta apagada no Auth não volta, senha não fica guardada;
 * - VPS/tokens: não são operações de dado.
 */
function acaoReversivel(action: string): boolean {
  return ["pagamento_criado", "pagamento_alterado", "pagamento_excluido"].includes(action);
}

/** Resumo de uma linha em texto — alimenta a coluna e a busca. */
function resumo(r: Row): string {
  const p = r.payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return "";

  const mudancas = p.mudancas as Record<string, { de: unknown; para: unknown }> | undefined;
  if (mudancas) {
    const partes = Object.entries(mudancas)
      .filter(([campo]) => !CAMPOS_OCULTOS.has(campo))
      .map(([campo, v]) => `${campo}: ${valorLegivel(campo, v.de)} → ${valorLegivel(campo, v.para)}`);
    const ref = p.ref ? `${p.ref} · ` : "";
    return partes.length ? ref + partes.join(" · ") : ref + "sem mudança relevante";
  }

  const reg = p.registro as Record<string, unknown> | undefined;
  if (reg) {
    const nome = reg.fornecedor ?? reg.nome ?? reg.id;
    const valor = typeof reg.valor_centavos === "number" ? ` · ${formatCents(reg.valor_centavos)}` : "";
    return `${nome}${valor}`;
  }

  if (p.email) return String(p.email);
  if (p.usuario_id) return String(p.usuario_id);
  return "";
}

function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [actors, setActors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [souAdmin, setSouAdmin] = useState(false);
  const [excluindo, setExcluindo] = useState<number | null>(null);
  const [desfazendo, setDesfazendo] = useState<number | null>(null);

  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("todos");
  const [periodo, setPeriodo] = useState("30");

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from("audit_log")
      .select("id, action, actor_user_id, payload, created_at")
      .order("id", { ascending: false })
      .limit(500);
    const list = (data as Row[] | null) ?? [];
    setRows(list);

    const ids = new Set(list.map((r) => r.actor_user_id).filter(Boolean) as string[]);
    const map: Record<string, string> = {};
    const { data: me } = await supabase.auth.getUser();
    if (me.user) {
      setSouAdmin(ehAdmin(me.user.email));
      if (ids.has(me.user.id)) map[me.user.id] = me.user.email ?? me.user.id;
    }
    setActors(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /**
   * Id do registro mais recente de cada lançamento. Desfazer uma alteração
   * antiga sobrescreveria as posteriores em silêncio — num sistema financeiro
   * isso é perda de dado. Então só a última da pilha é reversível.
   */
  const ultimoPorAlvo = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const alvo = alvoDoRegistro(r);
      if (!alvo) continue;
      if (!m.has(alvo) || r.id > (m.get(alvo) as number)) m.set(alvo, r.id);
    }
    return m;
  }, [rows]);

  const motivoNaoDesfaz = (r: Row): string | null => {
    if (!acaoReversivel(r.action)) return "Este tipo de ação não pode ser desfeito.";
    const alvo = alvoDoRegistro(r);
    if (!alvo) return "Registro sem lançamento identificável.";
    if (ultimoPorAlvo.get(alvo) !== r.id) {
      return "Há uma alteração mais nova neste lançamento — desfaça ela primeiro.";
    }
    return null;
  };

  const desfazer = async (r: Row) => {
    const p = r.payload as Record<string, any>;
    setDesfazendo(r.id);
    // fin_pagamentos não está nos types gerados — mesmo cast usado nas demais telas.
    const sb = supabase as any;
    try {
      let afetadas = 0;
      if (r.action === "pagamento_alterado") {
        const patch: Record<string, unknown> = {};
        for (const [campo, v] of Object.entries(p.mudancas as Record<string, { de: unknown }>)) {
          if (CAMPOS_NAO_RESTAURAVEIS.has(campo)) continue;
          patch[campo] = v.de;
        }
        if (Object.keys(patch).length === 0) {
          toast.error("Nada a restaurar neste registro");
          return;
        }
        const { data, error } = await sb.from("fin_pagamentos").update(patch).eq("id", p.id).select("id");
        if (error) throw error;
        afetadas = (data ?? []).length;
      } else if (r.action === "pagamento_criado") {
        const { data, error } = await sb.from("fin_pagamentos").delete().eq("id", p.registro.id).select("id");
        if (error) throw error;
        afetadas = (data ?? []).length;
      } else {
        const { data, error } = await sb.from("fin_pagamentos").insert(p.registro).select("id");
        if (error) throw error;
        afetadas = (data ?? []).length;
      }
      // RLS que bloqueia UPDATE/DELETE devolve sucesso com zero linhas — sem
      // esta checagem o usuário veria "desfeito" sem nada ter mudado.
      if (afetadas === 0) {
        toast.error("Nada foi alterado", {
          description: "O lançamento não existe mais ou você não tem permissão de escrita.",
        });
        return;
      }
      toast.success("Desfeito", { description: "A reversão também ficou registrada na auditoria." });
      await carregar();
    } catch (err) {
      toast.error("Não foi possível desfazer", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setDesfazendo(null);
    }
  };

  const tiposPresentes = useMemo(
    () => Array.from(new Set(rows.map((r) => grupoDaAcao(r.action)))).sort(),
    [rows],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const limite = periodo === "todos"
      ? 0
      : Date.now() - Number(periodo) * 86400000;
    return rows.filter((r) => {
      if (limite && new Date(r.created_at).getTime() < limite) return false;
      if (tipo !== "todos" && grupoDaAcao(r.action) !== tipo) return false;
      if (!q) return true;
      const ator = r.actor_user_id ? (actors[r.actor_user_id] ?? r.actor_user_id) : "sistema";
      return `${r.action} ${ator} ${resumo(r)}`.toLowerCase().includes(q);
    });
  }, [rows, busca, tipo, periodo, actors]);

  const excluir = async (id: number) => {
    setExcluindo(id);
    const { error } = await supabase.from("audit_log").delete().eq("id", id);
    setExcluindo(null);
    if (error) {
      toast.error("Não foi possível excluir", { description: error.message });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
    toast.success("Registro excluído");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">
          Quem alterou o quê, e o valor antes de cada mudança.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Buscar por ação, campo, fornecedor ou pessoa…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {tiposPresentes.map((t) => (
              <SelectItem key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodo} onValueChange={setPeriodo}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="todos">Todo o período</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4"><PageSkeleton /></div>
          ) : rows.length === 0 ? (
            <EmptyState title="Nenhum registro de auditoria." />
          ) : filtradas.length === 0 ? (
            <EmptyState title="Nenhum registro para esses filtros." />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Ator</TableHead>
                <TableHead>O que mudou</TableHead>
                <TableHead className="text-right">Payload</TableHead>
                <TableHead className="w-10" />
                {souAdmin && <TableHead className="w-10" />}
              </TableRow></TableHeader>
              <TableBody>
                {filtradas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatRelative(r.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">{r.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.actor_user_id ? (actors[r.actor_user_id] ?? r.actor_user_id.slice(0, 8)) : "Sistema"}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm" title={resumo(r)}>
                      {resumo(r) || "—"}
                    </TableCell>
                    <TableCell className="text-right"><PayloadDialog payload={r.payload} /></TableCell>
                    <TableCell className="text-right">
                      <BotaoDesfazer
                        registro={r}
                        motivoBloqueio={motivoNaoDesfaz(r)}
                        ocupado={desfazendo === r.id}
                        aoConfirmar={() => desfazer(r)}
                      />
                    </TableCell>
                    {souAdmin && (
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={excluindo === r.id}
                              title="Excluir registro"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir este registro?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O registro <strong>{r.action}</strong> de {formatRelative(r.created_at)} some
                                em definitivo. Auditoria apagada não pode ser usada como prova depois.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => excluir(r.id)}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!loading && rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {filtradas.length} de {rows.length} registros · limite de 500 mais recentes
        </p>
      )}
    </div>
  );
}

/** O que o desfazer vai fazer, em português, para a confirmação. */
function efeitoDoDesfazer(r: Row): string {
  const p = r.payload as Record<string, any>;
  if (r.action === "pagamento_criado") {
    return `O lançamento de ${p.registro?.fornecedor ?? "—"} será excluído.`;
  }
  if (r.action === "pagamento_excluido") {
    return `O lançamento de ${p.registro?.fornecedor ?? "—"} será recriado como estava.`;
  }
  const campos = Object.keys((p.mudancas ?? {}) as Record<string, unknown>)
    .filter((c) => !CAMPOS_NAO_RESTAURAVEIS.has(c));
  return `Os campos ${campos.join(", ")} voltam ao valor anterior.`;
}

function BotaoDesfazer({
  registro, motivoBloqueio, ocupado, aoConfirmar,
}: {
  registro: Row;
  motivoBloqueio: string | null;
  ocupado: boolean;
  aoConfirmar: () => void;
}) {
  // Bloqueado: botão apagado com o motivo no tooltip, em vez de sumir sem
  // explicação — assim dá para entender por que aquela linha não reverte.
  if (motivoBloqueio) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button variant="ghost" size="sm" disabled title="">
                <Undo2 className="h-4 w-4 opacity-40" />
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">{motivoBloqueio}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" disabled={ocupado} title="Desfazer">
          <Undo2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desfazer esta alteração?</AlertDialogTitle>
          <AlertDialogDescription>
            {efeitoDoDesfazer(registro)} A reversão fica registrada na auditoria — o evento
            original continua visível.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={aoConfirmar}>Desfazer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
