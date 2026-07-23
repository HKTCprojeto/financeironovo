import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Database,
  Briefcase,
  Users,
  CreditCard,
  ShoppingCart,
  Megaphone,
  Plug,
  RefreshCw,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Circle,
  MessageCircle,
  ChevronRight,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  INTEGRATIONS_SPEC,
  CATEGORY_LABEL,
  type IntegrationSpec,
  type IntegrationCategory,
} from "@/lib/integrations-spec";
import type { IntegrationCredentialMeta } from "@/types/integration-credentials";
import { CredentialsDialog } from "@/components/integrations/CredentialsDialog";

export const Route = createFileRoute("/_authenticated/integrations/")({
  head: () => ({ meta: [{ title: "Integrações — Agente CFO" }] }),
  component: IntegrationsIndex,
});

const CATEGORY_ICON: Record<IntegrationCategory, typeof Briefcase> = {
  erp: Briefcase,
  crm: Users,
  cobranca: CreditCard,
  ecommerce: ShoppingCart,
  database: Database,
  marketing: Megaphone,
};

const CATEGORIES: (IntegrationCategory | "all")[] = [
  "all",
  "erp",
  "crm",
  "cobranca",
  "ecommerce",
  "database",
];

type Status = "connected" | "error" | "not_connected";

function statusFor(
  spec: IntegrationSpec,
  meta: IntegrationCredentialMeta | undefined,
  oauthConnected: boolean,
  supabaseConnected: boolean,
): Status {
  if (spec.slug === "supabase") return supabaseConnected ? "connected" : "not_connected";
  if (spec.auth_mode === "oauth") return oauthConnected ? "connected" : "not_connected";
  if (!meta) return "not_connected";
  if (!meta.active) return "not_connected";
  if (meta.last_test_status === "ok") return "connected";
  if (meta.last_test_status === "invalid" || meta.last_test_status === "unreachable") return "error";
  // Sem teste mas tem credencial salva → considera conectado
  return "connected";
}

function StatusPill({ status }: { status: Status }) {
  if (status === "connected") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1">
        <CheckCircle2 className="h-3 w-3" /> Conectado
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertCircle className="h-3 w-3" /> Erro
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Circle className="h-3 w-3" /> Não conectado
    </Badge>
  );
}

function IntegrationsIndex() {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState<IntegrationCredentialMeta[] | null>(null);
  const [oauthConnected, setOauthConnected] = useState<Record<string, boolean>>({});
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [hasInstance, setHasInstance] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | "all">("all");
  const [editing, setEditing] = useState<IntegrationSpec | null>(null);
  const [updating, setUpdating] = useState(false);

  async function loadAll() {
    // 1. credentials list
    const { data: creds } = await supabase.functions.invoke("integration-credentials-list", {
      method: "GET",
    });
    setCredentials((creds as IntegrationCredentialMeta[]) ?? []);

    // 2. instance + legacy oauth connections via instances.connected_integrations
    const { data: instance } = await supabase
      .from("instances")
      .select("id, connected_integrations")
      .limit(1)
      .maybeSingle();
    setHasInstance(!!instance);
    const ci = (instance?.connected_integrations ?? {}) as Record<string, unknown>;
    const flags: Record<string, boolean> = {};
    for (const k of Object.keys(ci)) flags[k] = true;
    setOauthConnected(flags);

    // 3. supabase projects (multi)
    const { data: spList } = await supabase
      .from("supabase_projects")
      .select("id")
      .eq("active", true)
      .limit(1);
    setSupabaseConnected((spList?.length ?? 0) > 0);
  }

  useEffect(() => {
    loadAll();
  }, []);

  const credByName = useMemo(() => {
    const m = new Map<string, IntegrationCredentialMeta>();
    for (const c of credentials ?? []) m.set(c.skill_name, c);
    return m;
  }, [credentials]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return INTEGRATIONS_SPEC.filter((s) => {
      if (activeCategory !== "all" && s.category !== activeCategory) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [search, activeCategory]);

  function handleConnect(spec: IntegrationSpec) {
    if (spec.custom_route) {
      navigate({ to: spec.custom_route });
      return;
    }
    if (spec.auth_mode === "oauth" && spec.oauth_route) {
      navigate({ to: spec.oauth_route });
      return;
    }
    setEditing(spec);
  }

  async function handleUpdateVps() {
    setUpdating(true);
    const { error } = await supabase.functions.invoke("vps-trigger-update", {
      method: "POST",
      body: {},
    });
    setUpdating(false);
    if (error) {
      toast.error("Falha ao atualizar VPS", { description: error.message });
      return;
    }
    toast.success("Comando enviado", {
      description: "Marcos vai atualizar e te avisar no chat em ~30s.",
    });
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
            <p className="text-sm text-muted-foreground">
              Conecte suas ferramentas pro Agente CFO consultar dados em tempo real.
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  onClick={handleUpdateVps}
                  disabled={updating || hasInstance === false}
                >
                  {updating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Atualizar VPS
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {hasInstance === false
                ? "VPS não conectada — rode setup.sh primeiro"
                : "Sincroniza skills novas e configurações na sua VPS — só precisa clicar quando avisarmos."}
            </TooltipContent>
          </Tooltip>
        </div>



        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <Button
                key={c}
                size="sm"
                variant={activeCategory === c ? "default" : "outline"}
                onClick={() => setActiveCategory(c)}
              >
                {c === "all" ? "Todos" : CATEGORY_LABEL[c]}
              </Button>
            ))}
          </div>
        </div>

        {credentials === null ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((spec) => {
              const meta = credByName.get(spec.slug);
              const status = statusFor(
                spec,
                meta,
                !!oauthConnected[spec.slug],
                supabaseConnected,
              );
              const Icon = CATEGORY_ICON[spec.category] ?? Plug;
              const isExisting = !!meta;
              return (
                <Card key={spec.slug} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <CardTitle className="text-base">{spec.name}</CardTitle>
                      </div>
                      <StatusPill status={status} />
                    </div>
                    <CardDescription className="mt-2">{spec.description}</CardDescription>
                    <div className="mt-1">
                      <Badge variant="outline" className="text-[10px]">
                        {CATEGORY_LABEL[spec.category]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <Button size="sm" className="w-full" onClick={() => handleConnect(spec)}>
                      {status === "connected" || isExisting ? "Editar" : "Conectar"}
                    </Button>
                    {meta?.last_test_detail && status === "error" && (
                      <p className="mt-2 text-xs text-destructive">{meta.last_test_detail}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {editing && (
          <CredentialsDialog
            open={!!editing}
            onOpenChange={(v) => !v && setEditing(null)}
            spec={editing}
            isExisting={credByName.has(editing.slug)}
            onSaved={loadAll}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
