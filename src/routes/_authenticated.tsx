import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { Toaster } from "@/components/ui/sonner";
import { hasActiveChatStream } from "@/lib/chat-activity";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    // Skip on SSR — supabase session lives in localStorage (browser-only).
    // Running getSession() on the server always returns null and would kick
    // an authenticated user back to /login on every hot reload / SSR pass.
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      // Don't kick the user mid-stream — token may just be refreshing.
      // The chat layer surfaces an explicit "session expired" toast instead.
      if (hasActiveChatStream()) return;
      throw redirect({ to: "/login" });
    }
    // getSession() só valida o JWT localmente (assinatura + validade) e NÃO
    // detecta conta deletada/token revogado — o JWT é stateless e continua
    // válido até expirar. getUser() pergunta ao servidor: se a conta não
    // existe mais, expulsa na hora (fecha o furo de "acesso após exclusão").
    const { data: u, error } = await supabase.auth.getUser();
    if (error || !u?.user) {
      if (hasActiveChatStream()) return;
      await supabase.auth.signOut();
      throw redirect({ to: "/login" });
    }
    // Acesso por convite: a pessoa é logada ao clicar no link, mas NÃO pode
    // ver o painel antes de definir a própria senha. A flag senha_definida
    // vira true em /reset-password. Sem ela (convidado novo), força o reset.
    if (u.user.user_metadata?.senha_definida !== true) {
      throw redirect({ to: "/reset-password" });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader />
          <main className="flex-1 p-4 sm:p-6 bg-muted/20">
            <Outlet />
          </main>
        </div>
        <Toaster />
      </div>
    </SidebarProvider>
  );
}
