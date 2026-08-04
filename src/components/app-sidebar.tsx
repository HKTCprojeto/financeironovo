import { useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  BarChart3,
  BarChart2,
  Target,
  Zap,
  Plug,
  Settings,
  Server,
  Activity,
  Bell,
  Wallet,
  ScrollText,
  Cpu,
  ShieldCheck,
  ChevronDown,
  ExternalLink,
  MessageCircle,
  Bot,
  Send,
  Receipt,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mensagemErroEdge } from "@/lib/edge-error";

const mainItems = [
  { title: "Painel", url: "/", icon: LayoutDashboard, exact: true },
  { title: "Financeiro", url: "/financeiro", icon: Wallet },
  { title: "Pagamentos", url: "/pagamentos", icon: Receipt },
  { title: "Relatórios", url: "/reports", icon: BarChart3 },
  { title: "Metas", url: "/goals", icon: Target },
  { title: "Automações", url: "/automations", icon: Zap },
  { title: "Alertas", url: "/alerts", icon: Bell },
  { title: "Integrações", url: "/integrations", icon: Plug },
];

// Canais = por onde se fala com a Lívia. O chat vem primeiro por ser o canal
// que já funciona; WhatsApp e Telegram são as telas de configuração dos outros.
// Ícone diferente do WhatsApp de propósito: dois balões iguais lado a lado
// confundiriam quem bate o olho no menu.
const channelItems = [
  { title: "Conversar com Lívia", url: "/chat", icon: Bot },
  { title: "WhatsApp", url: "/settings/whatsapp", icon: MessageCircle },
  // A rota /settings/telegram ainda não existe — o item levava a um 404.
  // Fica visível (é roadmap) mas desabilitado até a tela ser construída.
  { title: "Telegram", url: "/settings/telegram", icon: Send, emBreve: true },
];

const adminItems = [
  { title: "Usuários", url: "/usuarios", icon: Users },
  { title: "Instâncias", url: "/instances", icon: Server },
  { title: "Observabilidade", url: "/observability", icon: Activity },
  { title: "Eventos", url: "/events", icon: ScrollText },
  { title: "Custo LLM", url: "/llm-usage", icon: Cpu },
  { title: "Auditoria", url: "/audit", icon: ShieldCheck },
];

const ADMIN_OPEN_KEY = "cfo:sidebar-admin-open";

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [adminOpen, setAdminOpen] = useState(false);
  const [loadingMC, setLoadingMC] = useState(false);

  const openMissionControl = async () => {
    setLoadingMC(true);
    try {
      const { data, error } = await supabase.functions.invoke("openclaw-dashboard-url");
      if (error) throw new Error(await mensagemErroEdge(error));
      if (data?.url) window.open(data.url, "_blank");
      else toast.error("URL do OpenClaw indisponível");
    } catch (err) {
      toast.error(`Falha ao abrir Mission Control: ${String((err as Error).message ?? err)}`);
    } finally {
      setLoadingMC(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = localStorage.getItem(ADMIN_OPEN_KEY);
    if (v === "1") setAdminOpen(true);
  }, []);

  const toggleAdmin = (open: boolean) => {
    setAdminOpen(open);
    if (typeof window !== "undefined") {
      localStorage.setItem(ADMIN_OPEN_KEY, open ? "1" : "0");
    }
  };

  const isActive = (url: string, exact?: boolean) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  return (
    <div className="dark">
      <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <BarChart2 className="h-5 w-5 text-primary shrink-0" />
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-semibold tracking-tight leading-tight">Agente CFO</span>
            <span className="text-xs text-muted-foreground leading-tight">CFO Digital</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url, item.exact)} tooltip={item.title}>
                    <Link to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Canais</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {channelItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  {item.emBreve ? (
                    <SidebarMenuButton disabled tooltip={`${item.title} — em breve`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                        em breve
                      </span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Collapsible open={adminOpen} onOpenChange={toggleAdmin}>

          <SidebarGroup>
            <CollapsibleTrigger asChild>
              <SidebarGroupLabel className="cursor-pointer flex items-center justify-between hover:text-foreground transition-colors">
                <span>Administração</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${adminOpen ? "rotate-0" : "-rotate-90"}`}
                />
              </SidebarGroupLabel>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {adminItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                        <Link to={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Mission Control" onClick={openMissionControl} disabled={loadingMC}>
              {loadingMC
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                : <ExternalLink className="h-4 w-4" />}
              <span>Mission Control</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/settings", true)} tooltip="Configurações">
              <Link to="/settings">
                <Settings className="h-4 w-4" />
                <span>Configurações</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
    </div>
  );
}
