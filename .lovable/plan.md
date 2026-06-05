## Visão geral

Vou criar um dashboard web que substitui a planilha. O webhook da Celetus alimenta as vendas automaticamente, o sistema identifica o produto pelo SRC, e cada produto tem suas abas mensais com os mesmos cálculos da planilha (faturamento Principal+Pago+Produtor, order bump, lucro, ROI, CPA, ticket médio, OB%, CPM, conversões). Os campos manuais (investimento, cliques, checkouts, impressões, observações) continuam sendo preenchidos por dia, direto na interface.

## Funcionalidades

1. **Login** (Lovable Cloud Auth — email/senha + Google). Cada usuário vê apenas seus produtos e dados.
2. **Cadastro de produtos**: nome + SRC (UUID da Celetus). Botão "+ Novo produto" para adicionar facilmente. Possível editar/remover.
3. **Webhook público** `/api/public/celetus-webhook` protegido por secret compartilhado:
   - Recebe payload da Celetus
   - Identifica produto pelo `src` (com fallback opcional para nome)
   - Identifica usuário-dono via produto cadastrado
   - Persiste a venda (status, tipo Principal/Orderbump, valor, comissão, data, etc.)
   - Idempotente por transação (evita duplicar em retentativas)
4. **Dashboard por produto / mês** com seletor de Produto e Mês:
   - **Cards de topo**: Vendas, Faturamento, Investimento, Lucro, ROI, CPA (mesmas cores da planilha: vermelho/laranja/amarelo/verde claro/verde forte)
   - **Cards secundários**: Ticket Médio, OB Qtd/%, OB R$, CPM Médio, Conv. Clique, Conv. Checkout
   - **Tabela diária** (1..N dias do mês) com: Data, Vendas, Faturamento, Invest. Manual (editável), Invest. Final (= manual × (1+taxa)), Lucro, ROI, CPA, Ticket, OB%, Observações (editável)
   - **Tabela de tráfego** (editável): Investimento, Cliques, Checkouts, Impressões → calcula CPM, Conv. Clique, Conv. Checkout
5. **Configurações por usuário**: Ano, Taxa sobre investimento (default 12,15%).
6. **Lista de vendas** (espelho do COLE_CELETUS) para auditoria, filtrável por produto/mês.

## Regras de cálculo (idênticas à planilha)

- Faturamento dia = soma de `commission_value` onde `kind = Principal` AND `status = Pago/Aprovado` AND `recipient = Produtor` AND `quantity = 1`.
- Vendas dia = mesma regra (contagem).
- OB Qtd dia = mesma regra com `kind = Orderbump`.
- OB R$ = soma comissão Orderbump+Produtor+Pago do dia/mês.
- Invest. Final = Invest. Manual × (1 + taxa).
- Lucro = Faturamento − Invest. Final. ROI = Lucro / Invest. Final. CPA = Invest. Final / Vendas.
- Ticket Médio = Faturamento / Vendas. OB% = OB Qtd / Vendas.
- CPM = Invest. Final / Impressões × 1000. Conv. Clique = Vendas / Cliques. Conv. Checkout = Vendas / Checkouts.

## Modelo de dados (Lovable Cloud / Supabase)

- `products` (id, user_id, name, src uuid, created_at) — único por (user_id, src).
- `celetus_sales` (id, user_id, product_id, transaction_code, buyer_name, buyer_email, src, product_name, offer_name, kind ['Principal','Orderbump'], status, payment_method, commission_value, sale_date, gross_value, net_value, recipient, recipient_type, src_tag, utm_source, …) — único por (user_id, transaction_code, src, kind).
- `daily_manual_inputs` (id, user_id, product_id, date, invest_manual, clicks, checkouts, impressions, notes) — único por (user_id, product_id, date).
- `monthly_settings` (id, user_id, year, tax_rate) — default 2026 / 0,1215.
- `webhook_config` (user_id, webhook_secret) para autenticar o endpoint público.
- RLS em todas as tabelas: usuário só lê/escreve as próprias linhas. `service_role` (admin) usado no webhook após validar o secret e mapear pelo `src` → `product` → `user_id`.

## Webhook

- Endpoint: `POST /api/public/celetus-webhook`
- Header: `X-Webhook-Secret: <secret do usuário>` (ou query param `?secret=`).
- Payload aceito: JSON com campos da Celetus (transactionCode, src, productName, offerName, kind, status, paymentMethod, commissionValue, saleDate, …). Vou validar com Zod.
- Comportamento: localiza produto pelo `src` do dono daquele secret, faz upsert idempotente, retorna 200.
- Tela "Integração" mostra a URL do webhook e o secret (com botão de copiar e rotacionar).

## Pilha técnica

- TanStack Start + Lovable Cloud (Supabase) + Auth (email/senha + Google via broker Lovable).
- Server functions (`createServerFn`) para CRUD de produtos, leitura agregada do dashboard e edição dos inputs manuais.
- Server route público para o webhook (com verificação de secret + `supabaseAdmin`).
- Agregações feitas via SQL (views ou RPC) para performance — ou em server fn com SUM/COUNT no Supabase.
- shadcn/ui para tabelas, cards, dialogs. Cores semânticas no `styles.css` (vermelho/laranja/amarelo/verde claro/verde forte) seguindo a regra da planilha.

## O que NÃO está no escopo

- Exportar Excel (você confirmou que não precisa).
- Importar a aba COLE_CELETUS antiga (entra direto via webhook daqui pra frente). Se quiser migrar o histórico colando o relatório, posso adicionar depois.

Quer que eu siga com esse plano?
