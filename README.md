# HKTC · Financeiro

Sistema de controle de **gastos fixos e variáveis** da **HKTC Do Brasil**, com **limites e travas** aplicados no momento do lançamento.

É um app de **página única** (HTML/CSS/JS puro, sem backend). Os dados ficam salvos localmente no navegador (`localStorage`). Basta abrir o `index.html`.

## Recursos

- **Toda despesa é fixa ou variável** — a natureza é herdada da categoria.
- **Limites/travas em 3 escopos**, avaliados juntos a cada lançamento:
  - por **categoria** (ex.: Materiais R$ 2.500);
  - por **natureza** (total de fixos / total de variáveis);
  - **total geral** do mês.
- **Dois tipos de trava:**
  - **Rígida (hard):** bloqueia o lançamento — nada é salvo.
  - **Flexível (soft):** avisa e permite lançar **com justificativa obrigatória**; vira rígida acima de um limiar (%).
- **Semáforo** por limite (verde / amarelo / vermelho) e barra de status do mês.
- Cálculo em **centavos inteiros** (sem erros de ponto flutuante) e parsing de moeda BRL.
- **Reset mensal automático** (o gasto de cada escopo é a soma das despesas do mês vigente).
- Edição/exclusão com **Desfazer**, filtros e busca, tema claro/escuro, **backup em JSON** e log de auditoria.

## Como usar

1. Abra o `index.html` no navegador (ou publique via GitHub Pages).
2. O sistema abre com **dados de exemplo** — clique em *Limpar dados de exemplo* para começar do zero.
3. Ajuste categorias e limites em **⚙︎ Configurações**.

## Regra da trava (resumo)

Para cada limite aplicável a uma despesa:

```
projetado = gasto_do_mês_no_escopo (excluindo a própria despesa em edição) + valor_novo
```

- `projetado <= teto` → permitido (gastar exatamente até o teto vale).
- `projetado > teto` e trava **rígida** → **bloqueia**.
- `projetado > teto` e trava **flexível** → **avisa** (exige justificativa); se `projetado > teto × limiar%` → **bloqueia**.

Se **qualquer** limite rígido estourar, o lançamento inteiro é bloqueado (*all-or-nothing*).
