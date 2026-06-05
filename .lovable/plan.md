# Plano: Aba "Vendas" paginada

## 1. Server function `listSales`
Novo arquivo `src/lib/celetus/sales.functions.ts`, protegido por `requireSupabaseAuth`.
- Inputs: `company_slug`, `product_id?`, `status?`, `kind?`, `search?`, `date_from?`, `date_to?`, `sort_by` (sale_date | commission_value | net_value | gross_value), `sort_dir`, `page`, `page_size` (default 20, máx 100).
- Query em `celetus_sales` com `count: "exact"`, filtros por `user_id` da company + filtros opcionais, `range(from, to)`.
- Retorna `{ rows, total, page, page_size }` com: sale_date, transaction_code, line_item_code, product_name, offer_name, kind, status, recipient, quantity, commission_value, net_value, gross_value, buyer_name, buyer_email, src, payment_method.

## 2. Página `/$companySlug/sales`
Novo arquivo `src/routes/_authenticated/$companySlug/sales.tsx`.
- Filtros no topo: produto (select carregando lista existente), status, kind, intervalo de datas, busca textual, botão Limpar.
- Tabela: Data, Transação, Produto, Oferta, Tipo (badge), Status (badge), Qtd, Comissão, Líquido, Bruto, Comprador.
- Cabeçalhos clicáveis para ordenar por Data e por Comissão/Líquido/Bruto.
- Rodapé: "Mostrando X–Y de Z" + Anterior/Próxima, 20 por página.
- Botão Atualizar (invalida a query).
- Estados de loading (skeleton) e vazio.

## 3. Navegação
Adicionar item "Vendas" (ícone `Receipt`) no menu lateral em `src/routes/_authenticated/route.tsx`, entre Dashboard e Produtos.

## Fora de escopo
- Realtime/notificações de novas vendas.
- Exportação CSV.
