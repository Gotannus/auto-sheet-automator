## Problema

Quando chega uma venda com um SRC novo (ex.: `gatilhos-marcos-2`) mas com o mesmo `productName` de um produto já cadastrado (ex.: "Gatilhos do Marcos" com src `gatilhos-marcos`), o sistema está **reaproveitando o produto antigo** em vez de criar um novo. Resultado: as vendas das duas campanhas ficam misturadas num único produto, impossibilitando separar investimento, ROI e lucro por conta de anúncio.

## Causa

Em `src/routes/api/public/celetus-webhook.ts`, a função `findProduct` (linhas 531-537) tem dois passos:

1. `findProductBySrc` — casa pelo SRC. Para `gatilhos-marcos-2` não acha (correto).
2. **Fallback por nome** — `products.find(p => norm(p.name) === norm(candidate.productName))`. Como o nome do produto enviado pela Celetus é o mesmo, ele acha o produto antigo e anexa a venda nele.

O mesmo fallback existe em `hotmart-webhook.ts` (preciso confirmar e ajustar também).

## Correção

1. Em `src/routes/api/public/celetus-webhook.ts`:
   - Restringir o fallback por nome a casos em que o SRC armazenado é **temporário** (começa com `sem-src-`). Assim, vendas sem SRC válido ainda agrupam pelo nome, mas qualquer SRC real cria/usa o produto correspondente ao SRC.
   - Quando o SRC é real e não existe produto, `createProductFromCandidate` já cria um novo registro. O nome do novo produto vai ser igual ao da Celetus ("Gatilhos do Marcos"); o usuário pode renomear via `display_name` em Produtos para diferenciar (ex.: "Gatilhos do Marcos - SRC2"), igual aos demais.

2. Em `src/routes/api/public/hotmart-webhook.ts`:
   - Aplicar a mesma regra de fallback por nome só quando o SRC for temporário, para manter consistência.

## Resultado esperado

- Vendas com `src=gatilhos-marcos-2` passam a aparecer num produto separado das vendas com `src=gatilhos-marcos`.
- Dashboard, Resumo do dia e relatórios passam a separar as duas campanhas (cada uma com seu próprio investimento, ROI, lucro, CPA).
- Vendas antigas já gravadas no produto errado **não** são movidas automaticamente — se houver vendas anteriores misturadas, posso fazer um backfill SQL opcional movendo as vendas com `src=gatilhos-marcos-2` para o novo `product_id` (me confirma se quer isso e em qual empresa).
