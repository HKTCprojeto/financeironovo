"use client";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ReportIssueModal({ open, onClose }: Props) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [includeTelemetry, setIncludeTelemetry] = useState(true);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setSubject("");
    setDescription("");
    setIncludeTelemetry(true);
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !description.trim()) {
      toast.error("Preencha assunto e descrição.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("report-issue", {
        body: {
          subject: subject.trim(),
          description: description.trim(),
          include_telemetry: includeTelemetry,
        },
      });
      if (error) throw error;
      toast.success("Issue criado com sucesso!");
      if (data?.issue_url) {
        window.open(data.issue_url, "_blank", "noopener,noreferrer");
      }
      reset();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "falha ao enviar";
      toast.error(`Erro: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reportar problema ou enviar feedback</DialogTitle>
          <DialogDescription>
            Cria um issue no GitHub do projeto. Sua mensagem é pública — não
            inclua dados sensíveis.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="subject">Assunto</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Descreva o problema em poucas palavras..."
              maxLength={120}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explique o que aconteceu, o que esperava e o que viu..."
              rows={5}
              disabled={loading}
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="telemetry"
              checked={includeTelemetry}
              onCheckedChange={(c) => setIncludeTelemetry(c === true)}
              disabled={loading}
            />
            <Label
              htmlFor="telemetry"
              className="text-sm font-normal cursor-pointer"
            >
              Incluir informações técnicas (heartbeat VPS, últimos erros) —
              ajuda a diagnosticar mais rápido
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !subject.trim() || !description.trim()}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enviando...
              </>
            ) : (
              "Enviar Report"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
