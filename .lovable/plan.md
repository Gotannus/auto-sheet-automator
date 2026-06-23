## Objetivo

Unificar os dois produtos "O Peso da Cama Feita" da Cecilia Labs em um único produto, com SRC `peso`.

## Situação atual

- **Produto A** (`3e4f6c83…`) — SRC: `peso-cama-cecilia02` — 31 vendas (3–7/jun + 1 venda com SRC `peso-cama-cecilialivros`)
- **Produto B** (`86eec0ac…`) — SRC: `peso` — 6 vendas (22–23/jun, incluindo 2 orderbumps)
- 2 vendas com SRC `peso` foram parar no Produto A por engano (14:55 e 15:48 de 22/jun), antes do Produto B existir.

## O que vai ser feito

Apenas correção de dados (sem mudança de schema, sem mudança de código):

1. Mover as **6 vendas** do Produto B (`86eec0ac…`) para o Produto A (`3e4f6c83…`).
2. Atualizar o SRC cadastrado do Produto A: de `peso-cama-cecilia02` para `peso`.
3. Apagar o Produto B (`86eec0ac…`), que ficará sem vendas.

Resultado: um único produto "O Peso da Cama Feita" com SRC `peso`, contendo todas as 37 vendas históricas. As vendas antigas mantêm o SRC original delas (`peso-cama-cecilia02`, `peso-cama-cecilialivros`) no histórico — apenas o produto passa a casar com SRC `peso` para vendas futuras.

## Por que não precisa mexer no código

A correção anterior do webhook (`hasRealSrc` em `findProduct`) já evita que um SRC novo seja anexado a um produto existente pelo nome. Após este backfill, novas vendas com SRC `peso` vão casar diretamente com o produto unificado pelo SRC.

## Verificação após executar

- Confirmar que o Produto A tem 37 vendas e SRC `peso`.
- Confirmar que o Produto B sumiu da lista.
- Conferir a tela "Resumo do dia" do dia 22/jun mostrando apenas 1 linha de "O Peso da Cama Feita".
