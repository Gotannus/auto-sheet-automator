# Fixar produto para aparecer mesmo sem vendas

Hoje um produto só aparece no Dashboard e na Projeção quando tem venda ou gasto no período. Produto em teste (só gasto, sem venda) fica invisível e você não consegue lançar o gasto.

## Como vai funcionar

- Em **Produtos**, ao cadastrar ou editar, aparece a opção **"Fixar no mês atual"** (um alfinete). Ao marcar, o produto fica fixado no mês corrente (ex.: outubro/2026).
- Na lista de Produtos, uma coluna mostra o alfinete; clicar liga/desliga a fixação. O produto já é marcado como ativo automaticamente.
- Produto fixado **sempre aparece** naquele mês:
  - no seletor de produtos do Dashboard (sem o aviso "sem atividade"), permitindo abrir e lançar o gasto por dia;
  - na Projeção, na lista por produto (com lucro negativo se só tem gasto);
  - na página do produto, onde já dá para lançar gasto em qualquer dia.
- Em novembro ele deixa de estar fixado sozinho (se continuar sem vendas, some como hoje). Basta fixar de novo se quiser.
- Como você cadastra com o mesmo SRC da campanha, quando a primeira venda chegar o sistema já liga a venda a esse produto (o webhook já procura primeiro pelo SRC e não muda o nome que você deu).

## Detalhes técnicos

- Migração: `products.pinned_month text null` (formato `YYYY-MM`). Políticas atuais de dono cobrem leitura/edição.
- `products.functions.ts`: incluir `pinned_month` em `Product`/`listProducts`; `createProduct`/`updateProduct` aceitam `pinned` (boolean) e gravam o mês atual (fuso São Paulo) ou null; nova `setProductPinned`. Ao fixar, definir `is_active = true`.
- `products.tsx`: checkbox "Fixar no mês atual" no diálogo + botão alfinete por linha (atualização otimista).
- `dashboard.tsx` (`visibleProducts`): incluir produtos com `pinned_month` igual a algum mês dentro do período selecionado.
- `projecao.tsx`: após montar `rows`, adicionar entradas vazias (dias sem dados) para produtos ativos fixados no mês exibido que não vieram em `by_product`.
- Webhooks: sem mudança; confirmar que a busca por SRC encontra o produto manual (match exato, sem diferenciar maiúsculas).
