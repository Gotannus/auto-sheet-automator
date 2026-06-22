## Problema observado em Tannus Labs (hoje)

Hoje na empresa Tannus Labs há 2 campanhas do mesmo produto principal "Gatilhos Sexuais Proibidos":

- src `gatilhos-marcos` — produto antigo (id `84bbe7d8`), nome correto.
- src `gatilhos2` — produto novo criado pelo webhook, MAS gravado com o nome `Reconquista Proibida: O Protocolo de Ataque` (que é um Orderbump), id `224c2ec1`.

Resultado no Hoje:
1. Aparece "Gatilhos Sexuais Proibidos" (gatilhos-marcos) corretamente.
2. Aparece "Reconquista Proibida" como se fosse um produto principal separado — quando na verdade é o produto `gatilhos2` mal nomeado. Os Principais e Orderbumps do checkout `gatilhos2` estão todos agrupados nesse produto, mas o usuário não reconhece porque o nome ficou o do orderbump.
3. Falta também 1 venda Principal `gatilhos2` (registrada antes do deploy da correção anterior) que ainda está pendurada no produto antigo `gatilhos-marcos`.

## Causa raiz

Em `src/routes/api/public/celetus-webhook.ts`, `createProductFromCandidate` usa `candidate.productName` para nomear o produto novo. Já existe um sort que processa Principais antes (linhas 207-212), mas isso só vale **dentro do mesmo webhook event**. Se o primeiro evento que chega com `src=gatilhos2` é um checkout cruzado contendo só Orderbump (cliente comprou só o orderbump, ou orderbump de outro funil que herda o `src`), o produto é criado com o nome do Orderbump e fica assim para sempre — mesmo quando depois chegam Principais com o mesmo `src`.

## Correção

1. **`createProductFromCandidate`** — quando o candidato é Orderbump (`kind !== Principal`), criar o produto com `name = candidate.storedSrc` (slug do src) em vez do nome do orderbump. Assim evita "marcar" o produto novo com o nome de um item secundário.

2. **`processWebhook` (loop dos candidates)** — após `findProduct`/`createProductFromCandidate`, se o candidate atual é **Principal** e o produto existente tem `display_name` vazio E o `name` atual difere do `candidate.productName`, atualizar `products.name = candidate.productName`. Isso "promove" o nome assim que chega o primeiro Principal daquele src, sem sobrescrever renomeações manuais (que vivem em `display_name`).

3. **Backfill no banco para Tannus Labs** (one-off SQL):
   - `UPDATE products SET name = 'Gatilhos Sexuais Proibidos' WHERE id = '224c2ec1-c140-409c-a0bd-76826587da2e';`
   - `UPDATE celetus_sales SET product_id = '224c2ec1-...' WHERE user_id = '80a2d30a-...' AND product_id = '84bbe7d8-...' AND src = 'gatilhos2';` (move a venda Principal solta).

## Resultado esperado

- No Hoje da Tannus Labs aparecem 2 linhas: "Gatilhos Sexuais Proibidos" (src `gatilhos-marcos`) e "Gatilhos Sexuais Proibidos" (src `gatilhos2`), cada uma com seu Principal e seus Orderbumps.
- Para diferenciar visualmente, basta o usuário definir `display_name` em Produtos (ex.: "Gatilhos SRC2").
- Próximas campanhas com SRC novo: mesmo se o primeiro evento for um Orderbump, o produto é criado neutro (nomeado pelo src) e auto-renomeado para o nome do Principal assim que a primeira venda Principal chegar.
