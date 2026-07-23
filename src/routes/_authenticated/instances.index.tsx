import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { InstanceStatusBadge } from "@/lib/status";
import { formatRelative, truncate } from "@/lib/format";
import { PageSkeleton, EmptyState } from "@/components/states";

export const Route = createFileRoute("/_authenticated/instances/")({
  head: () => ({ meta: [{ title: "Instâncias — Agente CFO" }] }),
  component: InstancesList,
});

type Row = {
  id: string;
  hostname: string | null;
  status: string;
  last_heartbeat: string | null;
  agente_cfo_version: string | null;
  ingress_url: string | null;
};

function InstancesList() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("instances")
        .select("id, hostname, status, last_heartbeat, agente_cfo_version, ingress_url")
        .order("created_at", { ascending: false });
      setRows((data as Row[] | null) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Instâncias</h1>
        <p className="text-sm text-muted-foreground">Máquinas conectadas ao seu painel.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lista</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState
              title="Nenhuma instância ainda."
              description="Rode setup.sh na sua VPS para começar."
            />
          ) : (
            <TooltipProvider>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hostname</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Último heartbeat</TableHead>
                    <TableHead>Versão</TableHead>
                    <TableHead>Ingress URL</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.hostname ?? "—"}</TableCell>
                      <TableCell><InstanceStatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-muted-foreground">{formatRelative(r.last_heartbeat)}</TableCell>
                      <TableCell className="text-muted-foreground">{r.agente_cfo_version ?? "—"}</TableCell>
                      <TableCell>
                        {r.ingress_url ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm text-muted-foreground cursor-help">
                                {truncate(r.ingress_url, 32)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>{r.ingress_url}</TooltipContent>
                          </Tooltip>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link to="/instances/$id" params={{ id: r.id }}>Ver detalhe</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
