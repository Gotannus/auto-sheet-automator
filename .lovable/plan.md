
## Objetivo

Permitir gerenciar cada produto individualmente — inclusive lançar gasto em dias sem venda — sem poluir a tela com produtos parados. Solução: flag manual `is_active` no produto + nova página de dashboard por produto acessível pela linha da Projeção e por um item lateral "Produtos".

## 1. Marcador manual de "ativo neste mês"

**Migração** — adicionar coluna em `products`:

```
ALTER TABLE public.products
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;
```

Padrão `true` para não esconder nada que já existe hoje. RLS/GRANTs da tabela permanecem.

**`src/lib/celetus/products.functions.ts`**
- `listProducts`: passar a retornar `is_active`.
- `updateProduct`: aceitar `is_active` opcional no schema e patch.
- Novo `setProductActive({ id, is_active })` (thin wrapper) para o toggle rápido.

**`products.tsx` (página de produtos existente)**
- Adicionar `Switch` "Ativo" em cada linha, ligado a `setProductActive`.
- Filtro no topo: `Todos | Ativos | Inativos` (default `Ativos`).

## 2. Filtro na Projeção

- Em `projecao.tsx`, o `ByProductProjection` passa a considerar apenas produtos com `is_active = true` (usa a lista de produtos já carregável — buscar via `listProducts` num `queryOptions` e cruzar com `by_product` do dashboard).
- Cada linha do produto vira `Link` para o novo dashboard do produto (ícone/afordância de "abrir").

## 3. Nova rota: dashboard do produto

Arquivo: `src/routes/_authenticated/$companySlug/produto.$productId.tsx`

Loader chama `getDashboard` (já suporta `product_id`) + `listProducts` para nome/header. Conteúdo, todos filtrados no produto:

- **Header**: nome do produto + seletor de mês + botão "Ativar/Desativar".
- **KPIs do mês**: Faturamento, Investimento, Lucro, ROI (mesmos cartões da Projeção, minimalistas).
- **Curva diária de lucro**: mesmo SVG usado em `projecao.tsx`, só do produto.
- **Projeção fim do mês**: aplica `computeProjection` nos `days` do produto e mostra "Fecha provável" (fat / lucro / ROI).
- **Tabela diária editável** (uma linha por dia do mês, mesmo em dias sem venda):
  - Colunas: Data · Vendas (readonly, do webhook/override) · Faturamento (readonly) · Investimento (editável inline) · Lucro (calc) · ROI (calc).
  - Salva via `upsertDailyManualInput` já usado no dashboard atual (mesmo padrão do `sales.tsx`), com `product_id` = produto atual. Isso resolve o caso da Cecília: dá pra lançar gasto do dia 01 no Reconquista mesmo sem venda.
  - Após salvar, invalida a query do dashboard do produto.

Estilo minimalista: cards `bg-card border`, tipografia consistente com `projecao.tsx`. Sem nova lib.

## 4. Navegação

- **Menu lateral**: novo item "Produtos" (permanece a página `products.tsx` como raiz), e submenu opcional listando os produtos ativos do mês corrente (query `listProducts` filtrada por `is_active`). Clique → `/$companySlug/produto/$productId`.
- **Projeção**: cada linha de produto ativa vira `Link` para a mesma rota.

## O que NÃO muda

- `dashboard.functions.ts`, `projection.ts`, cálculo de lucro/ROI, webhook, RLS.
- `computeProjection`, KPI row e curva já existentes em `projecao.tsx` — apenas reaproveitados.
- Nenhum produto some automaticamente; visibilidade é 100% controlada pelo toggle.

## Riscos / notas

- Produtos antigos ficam todos `is_active=true` por default; usuário desliga o que não roda mais. Alternativa (não recomendada aqui): default `false` — obrigaria mexer em tudo hoje.
- A tabela diária reusa exatamente o endpoint de manual input já existente (product_id + date + invest_manual), sem novo backend.

Se aprovar, implemento na ordem: migração → server fns → página do produto → toggles na página de produtos → link na Projeção → item no menu.
