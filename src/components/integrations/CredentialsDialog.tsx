import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff, ExternalLink, Loader2 } from "lucide-react";
import type { IntegrationSpec } from "@/lib/integrations-spec";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  spec: IntegrationSpec;
  isExisting: boolean;
  onSaved: () => void;
};

export function CredentialsDialog({ open, onOpenChange, spec, isExisting, onSaved }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Reset on open
  function handleOpenChange(v: boolean) {
    if (v) {
      setValues({});
      setShown({});
      setActive(true);
    }
    onOpenChange(v);
  }

  function setField(k: string, v: string) {
    setValues((s) => ({ ...s, [k]: v }));
  }

  function toggleShow(k: string) {
    setShown((s) => ({ ...s, [k]: !s[k] }));
  }

  async function handleSave(): Promise<boolean> {
    if (!isExisting) {
      // Validate required fields when creating
      for (const f of spec.fields ?? []) {
        if (f.required && !(values[f.key] ?? "").trim()) {
          toast.error(`${f.label} é obrigatório`);
          return false;
        }
      }
    }
    setSaving(true);
    const { error } = await supabase.functions.invoke("integration-credentials-save", {
      method: "POST",
      body: { skill_name: spec.slug, credentials: values, active },
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return false;
    }
    toast.success("Credenciais salvas");
    onSaved();
    return true;
  }

  async function handleTest() {
    // Save first if there are unsaved values
    const hasNew = Object.values(values).some((v) => v.trim());
    if (hasNew) {
      const ok = await handleSave();
      if (!ok) return;
    }
    setTesting(true);
    const { data, error } = await supabase.functions.invoke("integration-credentials-test", {
      method: "POST",
      body: { skill_name: spec.slug },
    });
    setTesting(false);
    if (error) {
      toast.error("Erro no teste", { description: error.message });
      return;
    }
    const r = data as { status: string; detail?: string };
    if (r.status === "ok") toast.success("Conexão OK");
    else if (r.status === "invalid") toast.error("Credenciais inválidas", { description: r.detail });
    else if (r.status === "unreachable") toast.error("API inacessível", { description: r.detail });
    else toast.message("Sem teste disponível", { description: r.detail });
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isExisting ? `Editar ${spec.name}` : `Conectar ${spec.name}`}
          </DialogTitle>
          <DialogDescription>
            {isExisting
              ? "Deixe campos vazios pra manter os valores atuais."
              : spec.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {spec.doc_url && (
            <a
              href={spec.doc_url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Como pegar essas credenciais?
            </a>
          )}

          {(spec.fields ?? []).map((f) => {
            const isPwd = f.type === "password";
            const inputType = isPwd && !shown[f.key] ? "password" : "text";
            return (
              <div key={f.key} className="space-y-1.5">
                <Label htmlFor={`f-${f.key}`}>
                  {f.label}
                  {f.required && !isExisting && <span className="text-destructive"> *</span>}
                </Label>
                <div className="relative">
                  <Input
                    id={`f-${f.key}`}
                    type={inputType}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={
                      isExisting ? "deixe vazio pra manter atual" : f.placeholder ?? ""
                    }
                    className={isPwd ? "pr-9 font-mono text-xs" : ""}
                    autoComplete="off"
                  />
                  {isPwd && (
                    <button
                      type="button"
                      onClick={() => toggleShow(f.key)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={shown[f.key] ? "Esconder" : "Mostrar"}
                    >
                      {shown[f.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
                {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="ic-active">Ativa</Label>
              <p className="text-xs text-muted-foreground">
                Quando inativa, Lívia não usa essa integração.
              </p>
            </div>
            <Switch id="ic-active" checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={testing || saving || !isExisting}
            title={!isExisting ? "Salve primeiro pra testar" : "Testar conexão"}
          >
            {testing && <Loader2 className="h-4 w-4 animate-spin" />}
            Testar
          </Button>
          <Button onClick={handleSave} disabled={saving || testing}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
