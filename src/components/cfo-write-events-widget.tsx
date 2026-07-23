import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type WriteEvent = {
  id: string;
  channel: string;
  action: string;
  erp: string | null;
  erp_record_id: string | null;
  amount: number | null;
  supplier: string | null;
  status: "success" | "error" | "duplicate";
  created_at: string;
};

const LIMIT = 10;

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr}h`;
  const days = Math.floor(hr / 24);
  return `há ${days}d`;
}

function formatBRL(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function statusVariant(s: WriteEvent["status"]): "default" | "destructive" | "secondary" {
  if (s === "success") return "default";
  if (s === "error") return "destructive";
  return "secondary";
}

function statusLabel(s: WriteEvent["status"]): string {
  if (s === "success") return "ok";
  if (s === "error") return "erro";
  return "duplicado";
}

export function CfoWriteEventsWidget() {
  const [events, setEvents] = useState<WriteEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      const { data } = await supabase
        .from("cfo_write_events")
        .select("id, channel, action, erp, erp_record_id, amount, supplier, status, created_at")
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (!mounted) return;
      setEvents((data ?? []) as WriteEvent[]);
      setLoading(false);
    };

    load();

    channel = supabase
      .channel("cfo-write-events-widget")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cfo_write_events" },
        () => { load(); },
      )
      .subscribe();

    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return (
    <Card className="p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Últimas ações via chat</h3>
        <span className="text-[11px] text-muted-foreground">writes registrados por Lívia</span>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground py-4 text-center">Carregando…</div>
      ) : events.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          Nenhum lançamento registrado via chat ainda.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {events.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 text-xs py-1.5 border-b last:border-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant={statusVariant(e.status)} className="text-[10px] py-0">
                  {statusLabel(e.status)}
                </Badge>
                <span className="font-medium">{e.action}</span>
                {e.erp && <span className="text-muted-foreground">· {e.erp}</span>}
                {e.supplier && (
                  <span className="truncate text-muted-foreground">· {e.supplier}</span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                <span className="font-mono">{formatBRL(e.amount)}</span>
                <span className="text-[10px] opacity-70" title={e.created_at}>
                  {relativeTime(e.created_at)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
