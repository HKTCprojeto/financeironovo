import { useEffect, useState } from "react";
import { createFileRoute, redirect, useNavigate, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { Toaster } from "@/components/ui/sonner";
import { hasActiveChatStream } from "@/lib/chat-activity";

/**
 * Para onde mandar quem não pode ver a área logada — ou null se pode entrar.
 *
 * A sessão do supabase vive no localStorage, então isto só tem resposta no
 * browser. Roda no beforeLoad (navegação client-side) e de novo no componente
 * depois da hidratação, que é o caminho do SSR.
 */
async function destinoSeNaoAutorizado(): Promise<"/login" | "/reset-password" | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    // Não expulsar no meio de um stream — o token pode só estar renovando.
    // A camada de chat mostra um toast explícito de "sessão expirada".
    if (hasActiveChatStream()) return null;
    return "/login";
  }
  // getSession() só valida o JWT localmente (assinatura + validade) e NÃO
  // detecta conta deletada/token revogado — o JWT é stateless e continua
  // válido até expirar. getUser() pergunta ao servidor: se a conta não
  // existe mais, expulsa na hora (fecha o furo de "acesso após exclusão").
  const { data: u, error } = await supabase.auth.getUser();
  if (error || !u?.user) {
    if (hasActiveChatStream()) return null;
    await supabase.auth.signOut();
    return "/login";
  }
  // Acesso por convite: a pessoa é logada ao clicar no link, mas NÃO pode
  // ver o painel antes de definir a própria senha. A flag senha_definida
  // vira true em /reset-password. Sem ela (convidado novo), força o reset.
  if (u.user.user_metadata?.senha_definida !== true) return "/reset-password";
  return null;
}

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    // No servidor não há localStorage: a checagem fica para o cliente, feita
    // pelo componente logo após a hidratação.
    if (typeof window === "undefined") return;
    const destino = await destinoSeNaoAutorizado();
    if (destino) throw redirect({ to: destino });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  // No SSR o beforeLoad não roda, e depois da hidratação o TanStack não o
  // reexecuta para a rota inicial — sem isto, uma visita direta a /pagamentos
  // entrega a casca logada para quem não tem sessão, e as queries voltam
  // vazias por RLS (o painel aparece montado e sem dado nenhum).
  const [liberado, setLiberado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const destino = await destinoSeNaoAutorizado();
      if (cancelado) return;
      if (destino) navigate({ to: destino, replace: true });
      else setLiberado(true);
    })();
    return () => {
      cancelado = true;
    };
  }, [navigate]);

  if (!liberado) return null;

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
