## Status atual (o que encontrei)

**Recebendo webhook de reembolso?** Sim, só da Hotmart. Nos últimos meses chegaram 6 eventos `PURCHASE_REFUNDED` — todos ignorados com motivo `affiliate sale` (a venda original era afiliada, então o reembolso também foi ignorado). Da Celetus, nenhum reembolso chegou ainda — precisa confirmar se a Celetus tem o evento configurado no painel deles.

**Está descontando?** Hoje, **não há uma única linha com status `Reembolso`, `Chargeback` ou `Cancelado` da Hotmart no banco** (apenas 10 `Cancelado` antigos da Celetus). Como nunca um reembolso "real" (não-afiliado) passou pelo sistema, o desconto nunca foi exercido na prática.

**Está computando corretamente quando passa?** Em teoria sim — o dashboard filtra `status IN (Pago, Aprovado, ...)`, então uma linha que muda para `Reembolso` sai do faturamento. **Mas há um risco silencioso**: o upsert é por `(user_id, transaction_code, line_item_code)`. Se o `line_item_code` reconstruído no evento de reembolso for diferente do evento de aprovação (ex.: `offerName` vazio no refund, ou `productName` levemente diferente), o sistema **insere uma linha nova** ao invés de atualizar a original → a venda aprovada permanece no faturamento e o reembolso vira uma linha órfã.

## O que vou fazer

### 1. Atualizar venda existente por `transaction_code` em eventos de reembolso/chargeback/cancelamento

Em `src/routes/api/public/hotmart-webhook.ts` e `src/lib/celetus/hotmart-parser.ts` (e equivalente para Celetus), quando o evento for `PURCHASE_REFUNDED`, `PURCHASE_CHARGEBACK`, `PURCHASE_PROTEST` ou `PURCHASE_CANCELED` (ou status normalizado `Reembolso`/`Chargeback`/`Cancelado`):

- Antes do upsert, fazer `UPDATE celetus_sales SET status = '<novo status>', refunded_at = now() WHERE user_id = ? AND transaction_code = ?` — atualizando **todas as linhas** daquela transação (Principal + Orderbumps) de uma vez, independente do `line_item_code`.
- Pular o upsert da linha do refund (já que estamos só mudando status, não criando venda nova).
- Se nenhuma linha for atualizada (refund de venda que nunca foi registrada), logar como `ignored` com motivo `refund without original sale`.

### 2. Não ignorar refund por "affiliate"

Hoje o parser Hotmart ignora qualquer payload com afiliado. Para eventos de reembolso, **só ignorar se a venda original também tiver sido ignorada** (i.e., não existir no banco). Assim, se um dia uma venda afiliada for incluída, o refund correspondente também será.

### 3. Refletir no dashboard / "Hoje" / "Visão Geral"

- O filtro `.in("status", PAID)` já exclui refunds — nada a mudar lá.
- Adicionar um pequeno indicador opcional na tela de **vendas** (`sales.tsx`) destacando linhas com status `Reembolso`/`Chargeback`/`Cancelado` em cinza/vermelho para visibilidade. (Sem mudar agregações.)

### 4. Migration leve

Adicionar coluna `refunded_at timestamptz` em `celetus_sales` para histórico (opcional, mas útil para relatórios futuros). Não afeta lógica atual.

### 5. Verificação

Após implementar, vou:
- Rodar um POST de teste no endpoint `/api/public/hotmart-webhook` simulando um `PURCHASE_APPROVED` seguido de `PURCHASE_REFUNDED` da mesma `transaction`, e conferir via `psql` que a linha original mudou para `Reembolso` e sumiu do dashboard.
- Conferir os 6 refunds Hotmart antigos: como as vendas originais eram afiliadas (ignoradas), eles continuam sem efeito — o que está correto.

## Resumo curto

- Reembolso da **Hotmart**: webhook chega, mas até hoje nenhum foi aplicado (todos os 6 eram de vendas afiliadas já ignoradas).
- Reembolso da **Celetus**: nenhum evento recebido — preciso que você confirme se a Celetus tem o evento de reembolso ativado no painel.
- Vou tornar o desconto robusto (atualização por `transaction_code` em vez de depender do `line_item_code` casar) e adicionar visibilidade na tela de vendas.
