import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { SeverityBadge } from "@/lib/status";
import { formatRelative } from "@/lib/format";
import { PageSkeleton, EmptyState } from "@/components/states";

export const Route = createFileRoute("/_authenticated/events")({
  head: () => ({ meta: [{ title: "Eventos — Agente CFO" }] }),
  component: EventsPage,
});

const PAGE_SIZE = 50;

type Row = {
  id: number;
  type: string;
  severity: string;
  created_at: string;
  payload: unknown;
  instance_id: string;
  instances?: { hostname: string | null } | null;
};

function EventsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [type, setType] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [types, setTypes] = useState<string[]>([]);

  useEffect(() => {
    supabase.from("events").select("type").limit(1000).then(({ data }) => {
      setTypes(Array.from(new Set((data ?? []).map((r) => r.type).filter(Boolean))).sort());
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    let q = supabase
      .from("events")
      .select("id, type, severity, created_at, payload, instance_id, instances(hostname)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (type !== "all") q = q.eq("type", type);
    if (severity !== "all") q = q.eq("severity", severity);
    if (from) q = q.gte("created_at", new Date(from).toISOString());
    if (to) q = q.lte("created_at", new Date(to).toISOString());
    q.then(({ data, count }) => {
      setRows((data as Row[] | null) ?? []);
      setCount(count ?? 0);
      setLoading(false);
    });
  }, [page, type, severity, from, to]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
        <p className="text-sm text-muted-foreground">Histórico global de eventos do tenant.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Filtros</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => { setType(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Severidade</Label>
            <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(0); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="debug">Debug</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>De</Label>
            <Input type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
          </div>
          <div className="space-y-1">
            <Label>Até</Label>
            <Input type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4"><PageSkeleton /></div>
          ) : rows.length === 0 ? (
            <EmptyState title="Nenhum evento corresponde aos filtros." />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Quando</TableHead><TableHead>Hostname</TableHead>
                <TableHead>Tipo</TableHead><TableHead>Severidade</TableHead>
                <TableHead className="text-right">Payload</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{formatRelative(r.created_at)}</TableCell>
                    <TableCell>{r.instances?.hostname ?? "—"}</TableCell>
                    <TableCell className="font-medium">{r.type}</TableCell>
                    <TableCell><SeverityBadge severity={r.severity} /></TableCell>
                    <TableCell className="text-right"><PayloadDialog payload={r.payload} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>{count} resultados</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>Página {page + 1} de {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PayloadDialog({ payload }: { payload: unknown }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm"><Eye className="h-4 w-4 mr-1" />Ver</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Payload</DialogTitle></DialogHeader>
        <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-[60vh]">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </DialogContent>
    </Dialog>
  );
}
