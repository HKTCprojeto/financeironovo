import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRelative } from "@/lib/format";
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

function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [actors, setActors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("id, action, actor_user_id, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      const list = (data as Row[] | null) ?? [];
      setRows(list);

      const ids = Array.from(new Set(list.map((r) => r.actor_user_id).filter(Boolean))) as string[];
      const map: Record<string, string> = {};
      const { data: me } = await supabase.auth.getUser();
      if (me.user && ids.includes(me.user.id)) map[me.user.id] = me.user.email ?? me.user.id;
      setActors(map);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground">Registro de ações do tenant.</p>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4"><PageSkeleton /></div>
          ) : rows.length === 0 ? (
            <EmptyState title="Nenhum registro de auditoria." />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Quando</TableHead><TableHead>Ação</TableHead>
                <TableHead>Ator</TableHead><TableHead className="text-right">Payload</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">{formatRelative(r.created_at)}</TableCell>
                    <TableCell className="font-medium">{r.action}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.actor_user_id ? (actors[r.actor_user_id] ?? r.actor_user_id.slice(0, 8)) : "Sistema"}
                    </TableCell>
                    <TableCell className="text-right"><PayloadDialog payload={r.payload} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
