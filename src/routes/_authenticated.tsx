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
