# Inserir todas as APIs/secrets necessárias

As edge functions referenciam estas variáveis de ambiente. As do bloco "já OK" estão configuradas automaticamente pelo backend. As do bloco "faltando" precisam ser inseridas.

## Já configurados (não precisam ação)
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`.

## A inserir

### Gerados automaticamente (valor aleatório, sem digitar nada)
| Secret | Uso | Formato |
|--------|-----|---------|
| `CFO_VAULT_ENC_KEY` | Chave AES-256-GCM do vault (`_shared/vault.ts`) — criptografa service_role keys dos projetos Supabase | **64 chars hex obrigatório** (32 bytes) — gerado |
| `PANEL_TOKEN` | Token compartilhado painel↔VPS. Já tem fallback no DB (`panel_config`), mas defini-lo fixa o valor | gerado (hex) |

### Fornecidos por você (form seguro)
| Secret | Uso | Onde obter |
|--------|-----|-----------|
| `GITHUB_REPORT_ISSUE_TOKEN` | `report-issue` abre issue no GitHub | Personal Access Token do GitHub com escopo `repo` (ou `issues`) no repo de destino |
| `HOOKS_URL` | `whatsapp-pair-start` chama webhook da VPS (tem fallback via `instances`) | URL do webhook da sua VPS |
| `HOOKS_TOKEN` | Token do webhook da VPS (tem fallback via `instances`) | Token configurado na VPS |

## Passos (após aprovar)
1. `generate_secret` para `CFO_VAULT_ENC_KEY` (length 64) e `PANEL_TOKEN` (length 64) — valores aleatórios, nenhuma ação sua.
2. `add_secret` para `GITHUB_REPORT_ISSUE_TOKEN`, `HOOKS_URL`, `HOOKS_TOKEN` — abre o form seguro pra você colar os valores.
3. Após inserir, redeployar as edge functions que usam esses secrets (`report-issue`, `whatsapp-pair-start`, e as que tocam o vault) pra garantir que peguem os novos valores.

## Observações
- `CFO_VAULT_ENC_KEY` **tem que** ter 64 chars hex — a função lança erro se não tiver; por isso uso `generate_secret`.
- `HOOKS_URL`/`HOOKS_TOKEN` são opcionais (há fallback no banco), mas defini-los evita depender de uma linha em `instances`. Se você não tiver uma VPS ainda, podemos pular esses dois.
- OAuth (Bling, HubSpot, ContaAzul, Mercado Livre, Nuvemshop) **não** usa secrets de ambiente — `client_id`/`client_secret` vêm no corpo da requisição pelo painel, então nada a inserir aqui.