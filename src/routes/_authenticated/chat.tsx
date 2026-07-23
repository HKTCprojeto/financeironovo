import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CFO_QUICK_ACTIONS } from "@/lib/cfo-quick-actions";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({ meta: [{ title: "Conversar com Marcos — Agente CFO" }] }),
  component: ChatPage,
});

type ChatRow = {
  id: number | string;
  role: "user" | "marcos" | "system";
  content: string;
  status: "pending" | "sent" | "delivered" | "error" | "streaming" | null;
  metadata: Record<string, unknown> | null;
  channel: string | null;
  created_at: string;
};

const HISTORY_LIMIT = 50;

function renderMarkdown(content: string) {
  const normalized = content.replace(/\\n/g, "\n");
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ ...props }) => <p className="mb-2 last:mb-0" {...props} />,
        ul: ({ ...props }) => <ul className="list-disc pl-4 mb-2 last:mb-0" {...props} />,
        ol: ({ ...props }) => <ol className="list-decimal pl-4 mb-2 last:mb-0" {...props} />,
        li: ({ ...props }) => <li className="mb-0.5" {...props} />,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        code: ({ inline, children, ...props }: any) =>
          inline ? (
            <code className="bg-background/40 px-1 py-0.5 rounded text-xs font-mono" {...props}>
              {children}
            </code>
          ) : (
            <pre className="bg-background/40 p-2 rounded text-xs font-mono overflow-x-auto my-2">
              <code {...props}>{children}</code>
            </pre>
          ),
        strong: ({ ...props }) => <strong className="font-semibold" {...props} />,
        a: ({ ...props }) => (
          <a className="underline text-primary" target="_blank" rel="noreferrer" {...props} />
        ),
        table: ({ ...props }) => (
          <div className="overflow-x-auto my-2">
            <table className="text-xs border-collapse" {...props} />
          </div>
        ),
        th: ({ ...props }) => <th className="border px-2 py-1 bg-background/40" {...props} />,
        td: ({ ...props }) => <td className="border px-2 py-1" {...props} />,
      }}
    >
      {normalized}
    </ReactMarkdown>
  );
}

function ChatPage() {
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef<Set<string | number>>(new Set());

  const threadId = userId ? `panel:${userId}` : null;

  const trackId = (id: string | number) => {
    knownIdsRef.current.add(id);
  };

  // Boot
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !mounted) return;
      setUserId(u.user.id);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Load history + realtime
  useEffect(() => {
    if (!threadId) return;
    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    setLoading(true);
    knownIdsRef.current.clear();
    setMessages([]);

    (async () => {
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT);
      if (!mounted) return;
      const ordered = ((msgs ?? []) as ChatRow[]).slice().reverse();
      ordered.forEach((m) => trackId(m.id));
      setMessages(ordered);
      setLoading(false);

      channel = supabase
        .channel(`chat-${threadId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chat_messages",
            filter: `thread_id=eq.${threadId}`,
          },
          (p) => {
            const row = p.new as ChatRow;
            if (p.eventType === "INSERT") {
              if (knownIdsRef.current.has(row.id)) return;
              trackId(row.id);
              setMessages((prev) => [...prev, row]);
            } else if (p.eventType === "UPDATE") {
              setMessages((prev) =>
                prev.map((m) => (m.id === row.id ? { ...m, ...row } : m)),
              );
            }
          },
        )
        .subscribe();
    })();
    return () => {
      mounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [threadId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!threadId || sending) return;
      setSending(true);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          toast.error("Sessão expirada — faça login de novo");
          return;
        }
        const { error } = await supabase.functions.invoke("chat-send-message", {
          body: { content },
          headers: { Authorization: `Bearer ${token}` },
        });
        if (error) {
          toast.error(`Falha: ${error.message ?? String(error)}`);
        }
      } finally {
        setSending(false);
      }
    },
    [threadId, sending],
  );

  const send = async () => {
    const content = input.trim();
    if (!content) return;
    setInput("");
    await sendMessage(content);
  };

  const onQuickAction = async (prompt: string) => {
    if (sending) return;
    await sendMessage(prompt);
  };

  const clearHistory = async () => {
    if (!threadId) return;
    if (!confirm("Apagar todo o histórico do chat?")) return;
    const { error } = await supabase.from("chat_messages").delete().eq("thread_id", threadId);
    if (error) {
      toast.error("Não foi possível limpar");
      return;
    }
    knownIdsRef.current.clear();
    setMessages([]);
    toast.success("Histórico limpo");
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const showQuickActions = !loading && messages.length === 0;

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)] max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold leading-tight">Marcos — seu CFO virtual</div>
            <div className="text-xs text-muted-foreground">
              Mesmo pipeline do WhatsApp · confirma writes antes de executar
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={clearHistory} disabled={messages.length === 0}>
          <Trash2 className="h-4 w-4 mr-1" />
          Limpar
        </Button>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1 my-3">
        <div className="space-y-3 pr-3">
          {loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
          ) : messages.length === 0 ? (
            <Card className="p-6 text-sm text-muted-foreground bg-muted/30 border-dashed">
              Olá. Sou o <strong className="text-foreground">Marcos</strong>, seu CFO. Pergunte
              sobre saldo, contas a pagar, pipeline. Pode pedir pra eu fazer ações também
              <span className="opacity-70"> (sempre confirmo antes)</span>.
            </Card>
          ) : (
            messages.map((m) => {
              const isUser = m.role === "user";
              const isPending = !isUser && m.status === "pending";
              return (
                <div
                  key={m.id}
                  className={`flex animate-in fade-in slide-in-from-bottom-1 duration-200 ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`${isUser ? "max-w-[80%]" : "max-w-[90%]"} rounded-2xl px-4 py-2 text-sm break-words ${
                      isUser
                        ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                        : "bg-muted text-foreground"
                    } ${m.status === "error" ? "border border-destructive/50" : ""}`}
                  >
                    {isUser ? (
                      <div>{m.content}</div>
                    ) : m.content ? (
                      <div className="leading-relaxed">{renderMarkdown(m.content)}</div>
                    ) : isPending ? (
                      <div className="flex items-center gap-1 py-1 text-muted-foreground">
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" />
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                        <span className="ml-2 text-xs">Marcos pensando…</span>
                      </div>
                    ) : null}
                    {m.status === "error" && !m.content && (
                      <div className="text-xs text-destructive">Falha ao receber resposta</div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Quick actions */}
      {showQuickActions && (
        <div className="flex flex-wrap gap-2 pb-3">
          {CFO_QUICK_ACTIONS.map((a) => (
            <Button
              key={a.label}
              variant="outline"
              size="sm"
              onClick={() => onQuickAction(a.prompt)}
              disabled={sending}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex gap-2 pt-2 border-t">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Pergunte algo ao Marcos..."
          disabled={sending}
          className="flex-1"
        />
        <Button onClick={send} disabled={sending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
