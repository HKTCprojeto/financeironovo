import { createFileRoute } from "@tanstack/react-router";
import {
  Briefcase,
  MessageSquare,
  BarChart3,
  Bot,
  Database,
  DollarSign,
  TrendingUp,
  Server,
  KeyRound,
  Smartphone,
  Rocket,
  Github,
  BookOpen,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/install")({
  head: () => ({
    meta: [
      { title: "Agente CFO — Seu CFO virtual 24/7 no WhatsApp" },
      {
        name: "description",
        content:
          "Agente CFO: alertas no WhatsApp, projeção de caixa, cobrança ativa e conversa natural. Template gratuito — rode na sua VPS em 5 minutos.",
      },
      { property: "og:title", content: "Agente CFO — Seu CFO virtual 24/7" },
      {
        property: "og:description",
        content:
          "CFO virtual rodando na sua infra. WhatsApp, ERP, projeção de caixa. Template gratuito.",
      },
    ],
  }),
  component: InstallPage,
});

const REMIX_URL =
  "https://lovable.dev/projects/ddcd382f-f68a-478d-a2a5-811a860ba83c?fork=true";
const GITHUB_URL = "https://github.com/MindOpsTeam/agente-cfo";
const DOCS_URL = "https://github.com/MindOpsTeam/agente-cfo/blob/main/docs/INSTALACAO.md";

const features = [
  {
    icon: Database,
    emoji: "📊",
    title: "Lê seu ERP",
    desc: "Omie, Bling, Tiny, ContaAzul, Granatum, VHSYS, Nibo.",
  },
  {
    icon: MessageSquare,
    emoji: "💬",
    title: "Conversa no WhatsApp",
    desc: "Marcos responde quando você pergunta e te alerta quando algo importa.",
  },
  {
    icon: DollarSign,
    emoji: "💰",
    title: "Cobra inadimplentes",
    desc: "Com sua confirmação — nunca age sozinho.",
  },
  {
    icon: TrendingUp,
    emoji: "📈",
    title: "Projeta seu caixa",
    desc: "30 e 90 dias à frente — você sabe quando vai apertar.",
  },
];

const steps = [
  {
    n: 1,
    title: "Clique em Começar",
    desc: "Cria seu painel próprio no Lovable em segundos.",
  },
  {
    n: 2,
    title: "Faça login e siga o onboarding",
    desc: "8 etapas guiadas, ~5 minutos. Sem terminal.",
  },
  {
    n: 3,
    title: "Rode 1 comando na sua VPS",
    desc: "Um curl | bash e o agente está no ar.",
  },
];

const prereqs = [
  { icon: Server, label: "VPS Linux Ubuntu 22.04+", hint: "~R$ 30/mês — Hostinger, DigitalOcean, etc" },
  { icon: KeyRound, label: "Conta Anthropic", hint: "~R$ 50/mês de uso comum" },
  { icon: Database, label: "1 ERP da lista", hint: "Omie é o mais usado" },
  { icon: Smartphone, label: "WhatsApp ativo no celular", hint: "Para receber alertas e conversar" },
];

const faqs = [
  {
    q: "Quanto custa?",
    a: "Zero pelo template. Você paga apenas VPS + Anthropic conforme uso.",
  },
  {
    q: "Tem suporte?",
    a: "Não. Produto entregue como template open source. Comunidade no GitHub.",
  },
  {
    q: "Meus dados ficam onde?",
    a: "100% na sua infra (sua VPS, seu Supabase). Nada volta pra Viver de IA.",
  },
  {
    q: "Posso parar quando quiser?",
    a: "Sim. É template — você controla 100%. Apague a VPS e pronto.",
  },
  {
    q: "Que ERPs/CRMs suporta?",
    a: "11 hoje: Omie, Bling, Tiny, Granatum, VHSYS, Nibo, ContaAzul (ERP), HubSpot, RD Station, PipeRun, Pipedrive (CRM), Asaas, Iugu (cobrança), Mercado Livre, Nuvemshop (e-commerce).",
  },
];

function InstallPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="relative mx-auto max-w-5xl px-6 py-16 md:py-24 text-center">
          <Badge variant="secondary" className="mb-6">
            Template gratuito · Open source
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-4">
            <span className="inline-block mr-2">💼</span>Agente CFO
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Seu CFO virtual rodando 24/7 — alertas no WhatsApp, projeção de caixa,
            cobrança ativa, conversa natural.
          </p>

          <div className="flex justify-center gap-6 mb-10 text-muted-foreground">
            <Briefcase className="h-10 w-10 md:h-12 md:w-12" />
            <MessageSquare className="h-10 w-10 md:h-12 md:w-12" />
            <BarChart3 className="h-10 w-10 md:h-12 md:w-12" />
            <Bot className="h-10 w-10 md:h-12 md:w-12" />
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="text-base">
              <a href={REMIX_URL} target="_blank" rel="noopener noreferrer">
                <Rocket className="mr-1" />
                Começar agora — Remix no Lovable
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                <Github className="mr-1" />
                Ver no GitHub
              </a>
            </Button>
          </div>
        </div>
      </section>

      {/* O que ele faz */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-10">O que ele faz</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((f) => (
            <Card key={f.title} className="transition hover:shadow-md">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-xl">
                    {f.emoji}
                  </div>
                  <CardTitle>{f.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Como instalar */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-3xl font-bold text-center mb-10">Como instalar</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {steps.map((s) => (
              <Card key={s.n}>
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold mb-2">
                    {s.n}
                  </div>
                  <CardTitle className="text-lg">{s.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pré-requisitos */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-10">Pré-requisitos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {prereqs.map((p) => (
            <div
              key={p.label}
              className="flex items-start gap-3 rounded-lg border bg-card p-4"
            >
              <p.icon className="h-5 w-5 mt-0.5 text-primary shrink-0" />
              <div>
                <p className="font-medium">{p.label}</p>
                <p className="text-sm text-muted-foreground">{p.hint}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-y bg-primary/5">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h2 className="text-3xl font-bold mb-4">Pronto pra começar?</h2>
          <p className="text-muted-foreground mb-8">
            Em ~5 minutos seu Marcos está rodando na sua VPS, conectado ao seu ERP.
          </p>
          <Button asChild size="lg" className="text-base">
            <a href={REMIX_URL} target="_blank" rel="noopener noreferrer">
              <Rocket className="mr-1" />
              🚀 Começar agora — Remix no Lovable
            </a>
          </Button>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-10">Perguntas comuns</h2>
        <div className="space-y-4">
          {faqs.map((f) => (
            <Card key={f.q}>
              <CardHeader>
                <CardTitle className="text-base flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  {f.q}
                </CardTitle>
                <CardDescription className="pl-7 pt-1 text-sm">{f.a}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>Feito por Viver de IA · Distribuído como template gratuito · v1.0</p>
          <div className="flex gap-4">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground transition"
            >
              <BookOpen className="h-4 w-4" />
              Documentação
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
