## Diagnóstico

Na Gotannus, o "Peso da Cama Feita" recebe Orderbumps ("A outra era eu" e "Fugas Emocionais") em cada venda. Confirmei no banco 6 orderbumps recentes (transações HP0280037845, HP3349917026, HP4242994199) com `parent_purchase_transaction` apontando corretamente para o C1 (Peso da Cama), mas gravados com o `src` e `product_id` do próprio sub-produto — por isso não aparecem juntos com o Principal no dashboard/produto.

Duas causas na ingestão Hotmart:

1. **`findProductBySrc` ignora a ordem dos candidatos.** Em `celetus-webhook.ts` a busca é `products.find(p => normalized.has(norm(p.src)))` — itera sobre a lista de produtos, não sobre os candidatos. Mesmo quando `hotmart-webhook.ts` faz `c.productCandidates = [parentRow.src, ...]`, o produto do próprio orderbump (que já existe) pode ser retornado primeiro.
2. **Race condition entre C1/C2/C3.** Hotmart dispara os webhooks quase em paralelo. Se o C2/C3 chega antes do C1 persistir, o lookup do parent retorna `null` e o Orderbump cai no produto próprio, sem qualquer reconciliação posterior.

## Correções

### 1. `src/routes/api/public/celetus-webhook.ts` — respeitar ordem dos candidatos
`findProductBySrc` passa a iterar `candidates` em ordem e retornar o primeiro `product` cujo `src` bater. Assim, quando `hotmart-webhook.ts` prepende o `parentRow.src`, o produto Principal ganha prioridade sobre o produto do sub-item.

### 2. `src/routes/api/public/hotmart-webhook.ts` — reconciliação nos dois sentidos

- **Quando chega um Orderbump** e o parent ainda não existe, além do lookup atual, também procurar produto direto por `products.src = 'hotmart-<parent_product_id>'` (se disponível no payload) — hoje o payload do orderbump não traz o produto do parent, então mantemos o fallback pelo `transaction_code`.
- **Quando chega o Principal (C1)**, após persistir, procurar orderbumps já gravados nessa mesma compra (irmãos com `raw->'data'->'purchase'->'order_bump'->>'parent_purchase_transaction' = C1.transaction_code`) e atualizar `src` + `product_id` para os do Principal recém-persistido. Isso fecha a race: se o C2/C3 chegou primeiro, o C1 corrige quando chega.

Reconciliação limitada aos orderbumps do mesmo `user_id` e à mesma "família" de transação (`HP...C%` prefixo do transaction do Principal), com no máximo ~10 linhas.

### 3. Backfill dos 6 registros existentes
Migration idempotente que faz o mesmo UPDATE para os orderbumps já gravados, ligando-os ao Principal via `parent_purchase_transaction`. Executa uma vez e não afeta linhas já corretas.

```sql
UPDATE celetus_sales ob
SET src = p.src, product_id = p.product_id
FROM celetus_sales p
WHERE ob.kind = 'Orderbump'
  AND p.kind = 'Principal'
  AND p.user_id = ob.user_id
  AND p.transaction_code = ob.raw->'data'->'purchase'->'order_bump'->>'parent_purchase_transaction'
  AND (ob.src <> p.src OR ob.product_id <> p.product_id);
```

## Arquivos alterados

- `src/routes/api/public/celetus-webhook.ts` — corrigir `findProductBySrc` para respeitar a ordem dos candidatos.
- `src/routes/api/public/hotmart-webhook.ts` — após persistir Principal, reconciliar orderbumps irmãos já gravados.
- `supabase/migrations/<timestamp>_backfill_hotmart_orderbumps.sql` — corrigir os 6 registros atuais.

## Fora de escopo

- Nenhuma mudança de UI/dashboard.
- Nenhuma alteração nos payloads da Celetus (fluxo daquele webhook já vem com Principal + Orderbumps num único POST).
- Não vou mexer no comportamento de auto-criação de produtos.
