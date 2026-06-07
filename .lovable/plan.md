## Diagnóstico

O produto `0c468482-1b04-4c2f-809d-4feb693d5aae` está cadastrado como **"Devocional: Descansa, Mulher Forte!"** com `src = peso-17`. Mas `peso-17` é, na verdade, o checkout do **"O Peso da Cama Feita"** (esse é o item *Principal* em todas as vendas dessa src). O "Devocional" só aparece como *Orderbump* dentro desse checkout.

Conferindo as vendas dessa src (transação `P8PWBJ7L`, 07/06):

```
Principal  | O Peso da Cama Feita                | peso-17
Orderbump  | Devocional: Descansa, Mulher Forte! | peso-17
Orderbump  | Casado e Sozinho                    | peso-17
Orderbump  | Me lembra quem eu sou               | peso-17
Orderbump  | A outra era eu                      | peso-17
```

Todas as 5 linhas estão amarradas ao mesmo `product_id` (o registro chamado "Devocional"). Por isso o dashboard "Devocional" hoje mostra **1 venda / R$ 38,46 / 4 OB / 400%** — que na verdade é o desempenho do "Peso da Cama Feita".

### Causa raiz

No webhook (`src/routes/api/public/celetus-webhook.ts`, `createProductFromCandidate`), o produto é criado a partir do **primeiro item** processado da transação. Se o Orderbump "Devocional" foi processado antes do Principal, o produto foi criado com o nome do orderbump — e os Principals seguintes apenas reaproveitam esse `product_id` via match por `src`.

## Plano

### 1. Corrigir o dado existente
- `UPDATE products SET name = 'O Peso da Cama Feita' WHERE id = '0c468482-1b04-4c2f-809d-4feb693d5aae'`.
- Não é necessário mexer em `celetus_sales` — o `product_id` já está correto, era só o nome do produto que estava errado.

### 2. Corrigir o webhook para não repetir o bug
Em `src/routes/api/public/celetus-webhook.ts`:

- Antes do loop que chama `createProductFromCandidate`, ordenar `sellableCandidates` colocando os `Principal` primeiro (kind === "Principal" antes de "Orderbump"/outros). Assim, o primeiro item a criar o produto de uma `src` nova é sempre o Principal, e os orderbumps só preenchem nele.
- Em `findProduct`: se o produto encontrado por `src` tem nome diferente do candidato **e o candidato é Principal**, atualizar `products.name` com o nome do Principal (corrige registros antigos automaticamente quando uma nova venda chegar). Implementar com um `update` simples no Supabase admin.
- O `kind` do candidato já está disponível em `candidate.row.kind`; nenhum schema novo é necessário.

### 3. Não mudar mais nada
- A lógica de agregação no dashboard (`getDashboard`) já soma orderbumps via `src = product.src`, então a correção do nome basta.
- Os produtos `sem-src-...` não fazem parte deste bug (são outro caso) — deixar como está.

### Arquivos tocados
- `src/routes/api/public/celetus-webhook.ts` (ordenação Principal-first + atualização de nome quando chega Principal).
- Migração de dados via tool de update: renomear o produto `0c468482`.
