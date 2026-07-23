import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const instanceMap: Record<string, string> = {
  online: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  offline: "bg-muted text-muted-foreground border-border",
  degraded: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  unknown: "bg-muted/60 text-muted-foreground border-border",
};

export function InstanceStatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "unknown";
  return (
    <Badge variant="outline" className={cn("font-medium capitalize", instanceMap[s] ?? instanceMap.unknown)}>
      {s}
    </Badge>
  );
}

const severityMap: Record<string, string> = {
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  critical: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  error: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  debug: "bg-muted text-muted-foreground border-border",
};

export function SeverityBadge({ severity }: { severity: string | null | undefined }) {
  const s = (severity ?? "info").toLowerCase();
  return (
    <Badge variant="outline" className={cn("font-medium capitalize", severityMap[s] ?? severityMap.info)}>
      {s}
    </Badge>
  );
}

const waMap: Record<string, string> = {
  connected: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  disconnected: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  qr_expired: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  unknown: "bg-muted text-muted-foreground border-border",
};

export function WhatsAppStatusBadge({ status }: { status: string | null | undefined }) {
  const s = status ?? "unknown";
  return (
    <Badge variant="outline" className={cn("font-medium capitalize", waMap[s] ?? waMap.unknown)}>
      {s.replace("_", " ")}
    </Badge>
  );
}
