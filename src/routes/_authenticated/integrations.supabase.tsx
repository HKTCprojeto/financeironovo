import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Eye, EyeOff, AlertTriangle, Pencil, Trash2, Loader2 } from "lucide-react";
import type { SupabaseProject } from "@/types/supabase-projects";

export const Route = createFileRoute("/_authenticated/integrations/supabase")({
  head: () => ({ meta: [{ title: "Conexões Supabase — Agente CFO" }] }),
  component: SupabaseIntegrationsPage,
});

const URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;

type FormState = {
  id?: string;
  name: string;
  project_url: string;
  service_role_key: string;
  description: string;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  project_url: "",
  service_role_key: "",
  description: "",
  active: true,
};

function statusBadge(p: SupabaseProject) {
  if (!p.active) return <Badge variant="secondary">Inativa</Badge>;
  switch (p.last_test_status) {
    case "ok":
      return <Badge className="bg-green-600 hover:bg-green-700">Conectado</Badge>;
    case "invalid_key":
      return <Badge variant="destructive">Key inválida</Badge>;
    case "unreachable":
      return <Badge variant="destructive">Inacessível</Badge>;
    default:
      return <Badge variant="secondary">Não testado</Badge>;
  }
}

function statusDot(p: SupabaseProject) {
  if (!p.active) return "⚫";
  switch (p.last_test_status) {
    case "ok":
      return "🟢";
    case "invalid_key":
    case "unreachable":
      return "🔴";
    default:
      return "🟡";
  }
}

function SupabaseIntegrationsPage() {
  const [projects, setProjects] = useState<SupabaseProject[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SupabaseProject | null>(null);

  async function fetchProjects() {
    const { data, error } = await supabase.functions.invoke("supabase-projects-list", {
      method: "GET",
    });
    if (error) {
      toast.error("Erro ao carregar projetos", { description: error.message });
      setProjects([]);
      return;
    }
    setProjects((data as SupabaseProject[]) ?? []);
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  function openNew() {
    setForm(EMPTY_FORM);
    setShowKey(false);
    setDialogOpen(true);
  }

  function openEdit(p: SupabaseProject) {
    setForm({
      id: p.id,
      name: p.name,
      project_url: p.project_url,
      service_role_key: "",
      description: p.description ?? "",
      active: p.active,
    });
    setShowKey(false);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Nome obrigatório");
      return;
    }
    if (!URL_RE.test(form.project_url.trim())) {
      toast.error("Project URL inválida", {
        description: "Esperado https://<sub>.supabase.co",
      });
      return;
    }
    if (!form.id && !form.service_role_key.trim()) {
      toast.error("Service role key obrigatória ao criar");
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.functions.invoke("supabase-projects-save", {
      method: "POST",
      body: {
        id: form.id,
        name: form.name.trim(),
        project_url: form.project_url.trim(),
        service_role_key: form.service_role_key.trim() || undefined,
        description: form.description.trim() || null,
        active: form.active,
      },
    });
    setSaving(false);

    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return;
    }
    toast.success(form.id ? "Projeto atualizado" : "Projeto criado");
    setDialogOpen(false);
    await fetchProjects();

    // Auto-test após salvar (se key foi enviada)
    const savedId = (data as { id?: string })?.id;
    if (savedId && form.service_role_key.trim()) {
      handleTest(savedId);
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    const { data, error } = await supabase.functions.invoke("supabase-projects-test", {
      method: "POST",
      body: { id },
    });
    setTestingId(null);

    if (error) {
      toast.error("Erro ao testar", { description: error.message });
      await fetchProjects();
      return;
    }
    const result = data as { status: string; detail?: string };
    if (result.status === "ok") {
      toast.success("Conexão OK");
    } else if (result.status === "invalid_key") {
      toast.error("Key inválida", { description: result.detail });
    } else {
      toast.error("Projeto inacessível", { description: result.detail });
    }
    await fetchProjects();
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const { error } = await supabase.functions.invoke("supabase-projects-delete", {
      method: "DELETE",
      body: undefined,
      headers: {},
      // Supabase JS client não passa query params; usamos workaround:
    } as never);
    // Fallback: chama via fetch direto pra incluir ?id=
    if (error) {
      toast.error("Erro ao deletar", { description: error.message });
    }
    // Sempre chama via URL parameter usando functions.invoke alternativa
    setConfirmDelete(null);
  }

  // Versão alternativa de delete usando fetch direto (querystring)
  async function deleteProject(p: SupabaseProject) {
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      toast.error("Sessão expirada");
      return;
    }
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/supabase-projects-delete?id=${encodeURIComponent(p.id)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });
    if (!res.ok) {
      const txt = await res.text();
      toast.error("Erro ao deletar", { description: txt });
      return;
    }
    toast.success("Projeto removido");
    setConfirmDelete(null);
    await fetchProjects();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conexões Supabase</h1>
          <p className="text-sm text-muted-foreground">
            Conecte N projetos Supabase pra dar a Marcos acesso total aos dados via MCP oficial.
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Novo projeto
        </Button>
      </div>

      {projects === null ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum projeto Supabase conectado. Clique em "Novo projeto" pra começar.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span aria-hidden>{statusDot(p)}</span>
                      <span className="truncate">{p.name}</span>
                      {statusBadge(p)}
                    </CardTitle>
                    <CardDescription className="mt-1 break-all font-mono text-xs">
                      {p.project_url}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTest(p.id)}
                      disabled={testingId === p.id}
                    >
                      {testingId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Testar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmDelete(p)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {(p.description || p.last_test_at) && (
                <CardContent className="pt-0 text-sm text-muted-foreground">
                  {p.description && <p>{p.description}</p>}
                  {p.last_test_at && (
                    <p className="mt-1 text-xs">
                      Testado em {new Date(p.last_test_at).toLocaleString("pt-BR")}
                    </p>
                  )}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Dialog novo/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar projeto" : "Novo projeto Supabase"}</DialogTitle>
            <DialogDescription>
              {form.id
                ? "Atualize os dados. Deixe a key vazia pra manter a atual."
                : "Conecte um projeto Supabase pra Marcos acessar os dados."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="sp-name">Nome</Label>
              <Input
                id="sp-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Banco Principal"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sp-url">Project URL</Label>
              <Input
                id="sp-url"
                value={form.project_url}
                onChange={(e) => setForm({ ...form, project_url: e.target.value })}
                placeholder="https://abcdefgh.supabase.co"
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="sp-key">Service Role Key</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowKey((v) => !v)}
                  className="h-7 px-2"
                >
                  {showKey ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  {showKey ? "Esconder" : "Mostrar"}
                </Button>
              </div>
              <Textarea
                id="sp-key"
                value={form.service_role_key}
                onChange={(e) => setForm({ ...form, service_role_key: e.target.value })}
                placeholder={
                  form.id ? "deixe vazio pra manter a atual" : "eyJhbGciOiJIUzI1NiI..."
                }
                rows={3}
                className="font-mono text-xs"
                style={
                  showKey || !form.service_role_key
                    ? undefined
                    : { WebkitTextSecurity: "disc" } as React.CSSProperties
                }
              />
              <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Atenção:</strong> essa chave dá acesso TOTAL ao seu banco.
                  Marcos pode executar SQL, modificar dados, deployar functions. Use apenas
                  projetos onde você quer dar essa permissão.
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sp-desc">Descrição (opcional)</Label>
              <Textarea
                id="sp-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ex: Banco principal de produção"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="sp-active">Ativa</Label>
                <p className="text-xs text-muted-foreground">
                  Quando inativa, Marcos não acessa esse projeto.
                </p>
              </div>
              <Switch
                id="sp-active"
                checked={form.active}
                onCheckedChange={(checked) => setForm({ ...form, active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.name} será desconectado. Marcos perderá acesso aos dados desse
              projeto. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteProject(confirmDelete)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
