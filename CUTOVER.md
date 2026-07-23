# Cutover para produção — Financeiro HKTC (Cloudflare Workers)

O sistema migrou de site estático (Vercel) para app SSR (TanStack Start) que roda em **Cloudflare Workers**.
Este guia cobre o deploy via **integração Git (auto-deploy)** e a troca do domínio, **sem derrubar** o site atual até tudo estar validado.

> Produção atual: `financeiro.hktcdobrasil.com.br` (Vercel, site estático — segue no ar).
> Branch da migração: `migracao-react-cfo`. **Não dar merge na `main` antes de concluir os passos 1–4.**

## Visão geral
- Build: `npm run build` → gera um Worker em `.output/` + `.wrangler/deploy/config.json` (o `wrangler deploy` detecta sozinho).
- O Worker do front **não precisa de secrets em runtime**: as variáveis `VITE_*` (Supabase) são embutidas no build e são chaves públicas (a `service_role` NÃO fica aqui).
- Worker name: `financeiro-hktc` (em `wrangler.jsonc`).

## Passo 1 — Conectar o repositório à Cloudflare (Workers Builds)
No painel Cloudflare → **Workers & Pages** → **Create** → **Workers** → **Connect to Git**:
- Repositório: este repo.
- **Branch de produção: `migracao-react-cfo`** por enquanto (troca para `main` no passo 4, após validar).
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`  *(padrão do Workers Builds; usa o `.wrangler/deploy/config.json` gerado)*
- Root directory: raiz do repo.

## Passo 2 — Variáveis de build (opcional)
O `.env` já está commitado com as chaves públicas, então o build funciona sem configurar nada.
Se preferir não depender do `.env`, defina no Cloudflare (Settings → Variables → **Build**):
- `VITE_SUPABASE_URL = https://utowspmmukczjinwgfdv.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY = <anon key do time>`
- `VITE_SUPABASE_PROJECT_ID = utowspmmukczjinwgfdv`
- `VITE_LLM_BUDGET_BRL = 50`

## Passo 3 — Validar no domínio temporário
Após o primeiro build, a Cloudflare dá uma URL `*.workers.dev`. Teste:
- login com uma conta do time;
- aba **Financeiro**: criar categoria, lançar despesa, ver trava bloquear;
- conferir que os dados persistem (Supabase do time).

## Passo 4 — Cutover do domínio
Quando o `*.workers.dev` estiver ok:
1. Faça o **merge de `migracao-react-cfo` → `main`** (ou aponte a branch de produção do Worker para `main`).
2. No Worker → **Settings → Domains & Routes** → **Add Custom Domain** → `financeiro.hktcdobrasil.com.br`.
3. Ajuste o **DNS**: o registro de `financeiro` deixa de apontar para o Vercel e passa a apontar para o Worker (a Cloudflare cria o registro automaticamente se o domínio estiver na Cloudflare; se o DNS estiver em outro provedor, criar o CNAME indicado pela Cloudflare).
4. Confirme o site novo no domínio e desative o projeto antigo no Vercel.

## Rollback
Se algo der errado no passo 4, reverter o DNS para o Vercel restaura o site estático (que continua intacto em `legacy/` e no projeto Vercel atual).

## Observações
- As telas próprias do CFO (Marcos/chat, Integrações, Automações, Alertas, Instâncias) dependem das ~70 edge functions + credenciais externas — ver Fase 4. O Financeiro **não** depende delas.
- Assets de marca (logo/bg) estão em `assets/` e podem ser reaproveitados no tema do app novo.
