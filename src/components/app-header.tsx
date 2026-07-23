import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ReportIssueModal } from "@/components/ReportIssueModal";

export function AppHeader() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      setEmail(userData.user?.email ?? "");
    })();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/login" });
  };

  return (
    <>
      <header className="h-14 flex items-center gap-3 border-b bg-background px-3">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-6" />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">Agente CFO</div>
        </div>
        <div className="hidden sm:block text-sm text-muted-foreground truncate max-w-[200px]">{email}</div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setReportOpen(true)}
              title="Reportar problema ou enviar feedback"
              className="text-muted-foreground hover:text-foreground"
            >
              <HelpCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reportar problema</TooltipContent>
        </Tooltip>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Sair</span>
        </Button>
      </header>
      <ReportIssueModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </>
  );
}
