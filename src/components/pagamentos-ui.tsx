/**
 * Cartões e tooltip usados pelo Painel e pelos Relatórios.
 *
 * Vieram do index.tsx quando as telas foram separadas — mantê-los num só lugar
 * evita que os gráficos das duas passem a ter aparências diferentes.
 */
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCents, formatReais, mesCurto, mesLabel, shiftMes } from "@/lib/financeiro";
import { brl } from "@/lib/pagamentos-dados";

export function Kpi({
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
        <div
          className={`mt-1 flex items-baseline gap-1 whitespace-nowrap font-mono font-bold ${toneCls}`}
        >
          <span className="text-xs font-normal text-muted-foreground">R$</span>
          <span className="text-xl">{formatReais(cents)}</span>
        </div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
        {children}
      </CardContent>
    </Card>
  );
}

export function Bucket({
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

export function ChartCard({
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

export function Vazio({ texto = "Sem dados" }: { texto?: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {texto}
    </div>
  );
}

export function MoneyTooltip({
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

/**
 * Filtro de meses com seleção múltipla.
 *
 * Substitui a navegação de um mês por vez: dá para comparar Jul+Ago num
 * gráfico só. Lista vazia significa "todos os meses" — assim a tela nunca
 * fica sem dado por acidente de desmarcar tudo.
 */
export function FiltroMeses({
  meses,
  selecionados,
  onMudar,
}: {
  meses: string[];
  selecionados: string[];
  onMudar: (novos: string[]) => void;
}) {
  const rotulo =
    selecionados.length === 0
      ? "Todos os meses"
      : selecionados.length === 1
        ? mesCurto(selecionados[0])
        : `${selecionados.length} meses`;

  const alternar = (m: string) =>
    onMudar(
      selecionados.includes(m) ? selecionados.filter((x) => x !== m) : [...selecionados, m],
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 font-normal">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          {rotulo}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">Meses</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onMudar([])}
            disabled={selecionados.length === 0}
          >
            Todos
          </Button>
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {meses.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">Sem meses na base</p>
          ) : (
            meses.map((m) => (
              <label
                key={m}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <Checkbox checked={selecionados.includes(m)} onCheckedChange={() => alternar(m)} />
                <span>{mesCurto(m)}</span>
              </label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Navegação de mês usada no cabeçalho do Painel e dos Relatórios. */
export function NavegadorMes({ mes, onMudar }: { mes: string; onMudar: (novo: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onMudar(shiftMes(mes, -1))}
        aria-label="Mês anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[150px] text-center font-semibold capitalize">{mesLabel(mes)}</span>
      <Button
        variant="outline"
        size="icon"
        onClick={() => onMudar(shiftMes(mes, 1))}
        aria-label="Próximo mês"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
