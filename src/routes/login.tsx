// Login: email + password com mensagens claras + esqueci senha
import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: "/" });
    }
  },
  head: () => ({
    meta: [
      { title: "Entrar — Agente CFO" },
      { name: "description", content: "Acesse o painel administrativo do Agente CFO." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [showResetHighlight, setShowResetHighlight] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!email || !password) {
      toast.error("Preencha email e senha");
      return;
    }
    if (password.length < 6) {
      toast.error("Senha precisa de pelo menos 6 caracteres");
      return;
    }

    setLoading(true);

    const signInResult = await supabase.auth.signInWithPassword({ email, password });

    if (signInResult.data.session) {
      setLoading(false);
      toast.success("Entrou");
      navigate({ to: "/" });
      return;
    }

    const errMsg = signInResult.error?.message || "";

    if (/email not confirmed/i.test(errMsg)) {
      setLoading(false);
      toast.error("Email não confirmado", { description: "Verifique sua caixa de entrada." });
      return;
    }

    if (/invalid login credentials/i.test(errMsg)) {
      // Pode ser senha errada OU conta não existe — testa via signUp
      const signUpResult = await supabase.auth.signUp({ email, password });

      if (
        signUpResult.error?.message &&
        /already registered|user already exists/i.test(signUpResult.error.message)
      ) {
        setLoading(false);
        toast.error("Email ou senha incorretos", {
          description: "Tente novamente ou redefina sua senha.",
        });
        setShowResetHighlight(true);
        return;
      }

      if (signUpResult.data.session) {
        setLoading(false);
        toast.success("Conta criada");
        navigate({ to: "/" });
        return;
      }

      if (signUpResult.data.user) {
        setLoading(false);
        toast.success("Conta criada", { description: "Verifique seu email para confirmar." });
        return;
      }

      setLoading(false);
      toast.error(signUpResult.error?.message || "Falha ao criar conta");
      return;
    }

    setLoading(false);
    toast.error(errMsg || "Falha ao entrar");
  };

  const sendReset = async () => {
    if (!email) {
      toast.error("Informe seu email primeiro");
      return;
    }
    setResetLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Link enviado", { description: "Confira seu email para redefinir a senha." });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Toaster />
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-semibold tracking-tight">Agente CFO</CardTitle>
          <CardDescription>Painel administrativo</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="voce@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Entrar
            </Button>
            <Button
              type="button"
              variant={showResetHighlight ? "secondary" : "ghost"}
              className="w-full"
              onClick={sendReset}
              disabled={resetLoading || loading}
            >
              {resetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Esqueci minha senha
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-2">
              Primeira vez? A conta é criada automaticamente com esses dados.
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
