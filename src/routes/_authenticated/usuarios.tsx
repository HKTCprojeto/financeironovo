import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  UserPlus,
  KeyRound,
  Send,
  Trash2,
  ShieldCheck,
  Copy,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { mensagemErroEdge } from "@/lib/edge-error";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Agente CFO" }] }),
  component: UsuariosPage,
});

type AdminUser = {
  id: string;
  email: string;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  invited_at: string | null;
  is_admin: boolean;
};

// Chama a Edge Function admin-invite. O JWT do usuário vai junto
// automaticamente; a função valida se quem chama é o admin.
async function callAdmin<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-invite", { body });
  if (error) throw new Error(await mensagemErroEdge(error));
  return data as T;
}

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function UsuariosPage() {
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => callAdmin<{ users: AdminUser[] }>({ action: "list" }),
    retry: false,
  });

  const users = data?.users ?? [];

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [linkModal, setLinkModal] = useState<null | { titulo: string; email: string; link: string }>(null);
  const [resetFor, setResetFor] = useState<null | AdminUser>(null);
  const [newPass, setNewPass] = useState("");
  const [working, setWorking] = useState<string | null>(null); // id em operação

  const reload = () => refetch();

  const convidar = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Informe o e-mail do convidado");
      return;
    }
    setInviting(true);
    try {
      const r = await callAdmin<{ email: string; sent?: boolean; action_link?: string }>({
        action: "invite",
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setInviteEmail("");
      if (r.sent) {
        toast.success(`Convite enviado por e-mail para ${r.email}`, {
          description: "A pessoa recebe o link para definir a senha.",
        });
      } else if (r.action_link) {
        // E-mail não saiu (ex.: SMTP não configurado) — oferece o link manual.
        toast.warning("Não consegui enviar o e-mail — envie o link manualmente.");
        setLinkModal({ titulo: "Convite gerado (envie manualmente)", email: r.email, link: r.action_link });
      }
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const reenviar = async (u: AdminUser) => {
    setWorking(u.id);
    try {
      const r = await callAdmin<{ email: string; action_link: string }>({
        action: "resend",
        email: u.email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
      setLinkModal({ titulo: "Link de acesso gerado", email: r.email, link: r.action_link });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const redefinir = async () => {
    if (!resetFor) return;
    if (newPass.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres");
      return;
    }
    setWorking(resetFor.id);
    try {
      await callAdmin({ action: "reset_password", id: resetFor.id, password: newPass });
      toast.success(`Senha de ${resetFor.email} redefinida`);
      setResetFor(null);
      setNewPass("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const remover = async (u: AdminUser) => {
    if (!confirm(`Remover o acesso de ${u.email}? Esta ação é permanente.`)) return;
    setWorking(u.id);
    try {
      await callAdmin({ action: "delete", id: u.id });
      toast.success(`${u.email} removido`);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setWorking(null);
    }
  };

  const copiar = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  // Sem permissão (a função devolve 403 para quem não é admin)
  if (error && /permiss|admin|403/i.test((error as Error).message)) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" /> Acesso restrito
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            A gestão de usuários é exclusiva do administrador do sistema.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Usuários</h1>
      </div>

      {/* Convidar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" /> Convidar novo usuário
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Um e-mail de convite é enviado automaticamente para a pessoa (remetente
            <b> Agente CFO - Acesso</b>). Ao abrir o link, ela define a própria senha e ganha acesso.
            O convite é individual, vinculado ao e-mail.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px] flex-1 space-y-1.5">
              <Label htmlFor="inv">E-mail do convidado</Label>
              <Input
                id="inv"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="pessoa@hktc.com.br"
                onKeyDown={(e) => e.key === "Enter" && convidar()}
              />
            </div>
            <Button onClick={convidar} disabled={inviting}>
              {inviting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1 h-4 w-4" />}
              Gerar convite
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Usuários com acesso</CardTitle>
          <Button variant="ghost" size="sm" onClick={reload} disabled={isRefetching}>
            {isRefetching && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : error ? (
            <p className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> {(error as Error).message}
            </p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum usuário ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Último acesso</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const pendente = !u.email_confirmed_at;
                    const busy = working === u.id;
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.email}
                          {u.is_admin && (
                            <Badge className="ml-2 bg-primary/10 text-primary" variant="secondary">
                              admin
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {pendente ? (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
                              convite pendente
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                              ativo
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {fmt(u.last_sign_in_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Reenviar link de acesso"
                              disabled={busy}
                              onClick={() => reenviar(u)}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Redefinir senha"
                              disabled={busy}
                              onClick={() => {
                                setResetFor(u);
                                setNewPass("");
                              }}
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={u.is_admin ? "Não é possível remover o admin" : "Remover acesso"}
                              disabled={busy || u.is_admin}
                              onClick={() => remover(u)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal: link gerado (convite/reenvio) */}
      <Dialog open={!!linkModal} onOpenChange={(o) => !o && setLinkModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{linkModal?.titulo}</DialogTitle>
            <DialogDescription>
              Envie este link para <b>{linkModal?.email}</b>. Ele é individual e expira conforme a política do
              Supabase.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={linkModal?.link ?? ""} className="font-mono text-xs" />
            <Button size="icon" variant="outline" onClick={() => linkModal && copiar(linkModal.link)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setLinkModal(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: redefinir senha */}
      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para <b>{resetFor?.email}</b>. Informe a pessoa da nova senha por um canal seguro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="np">Nova senha</Label>
            <Input
              id="np"
              type="text"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetFor(null)}>
              Cancelar
            </Button>
            <Button onClick={redefinir} disabled={!!working || newPass.length < 6}>
              Salvar nova senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
