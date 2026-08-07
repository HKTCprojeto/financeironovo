# Handoffs

Documentos de passagem: cada um descreve o estado de uma frente de trabalho para
quem vai continuar **sem ter participado** das conversas anteriores.

Um handoff não é relatório do que foi feito. Ele existe para responder três
perguntas de quem chega agora:

1. O que está funcionando — e **como isso foi provado**, não só afirmado.
2. O que ainda está quebrado, o que já foi apurado e **por onde começar**.
3. O que **não** se pode mexer, e por quê.

## Índice

| Data | Documento | Frente | Aberto |
|---|---|---|---|
| 2026-08-07 | [VPS OpenClaw, Lívia e Mission Control](2026-08-07-vps-livia-mission-control.md) | integração da Lívia + infraestrutura da VPS | porta 3978 (Teams) |

## Como escrever o próximo

Nome do arquivo: `AAAA-MM-DD-assunto-curto.md`. A data é a do encerramento do
trabalho, e ela ordena a pasta sozinha. Depois de criar, acrescente a linha no
índice acima — sem isso, o documento existe mas ninguém o encontra.

O que faz diferença, aprendido escrevendo o primeiro:

- **Evidência junto da afirmação.** "Corrigido" não ajuda ninguém; "saiu de 502
  para 200, e as outras 4 rotas não mudaram" permite conferir e permite duvidar.
- **Como desfazer cada mudança**, ao lado da mudança. Quem chega no meio de um
  problema não tem tempo de deduzir isso.
- **O que já foi descartado.** Registrar "medimos e não é por aí" evita que a
  próxima pessoa gaste um dia refazendo o mesmo caminho.
- **Nenhuma senha, token ou chave no arquivo** — só onde cada um mora.
- **A primeira pergunta de uma pendência costuma não ser técnica.** No handoff de
  07/08, o passo 1 da porta 3978 é perguntar se o time ainda recebe os cards no
  Teams: a resposta decide entre remover uma regra e ressuscitar um serviço.

## Como o time acessa

- **GitHub:** `docs/handoffs/` no repositório `HKTCprojeto/financeironovo`, branch
  `main` — abre no navegador, precisa de acesso ao repositório.
- **Claude Code:** abrir o projeto e nomear o arquivo, por exemplo
  *"Leia `docs/handoffs/2026-08-07-vps-livia-mission-control.md` e continue a
  pendência da porta 3978."*
