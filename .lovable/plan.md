## Diagnóstico (Tannus Labs)

Ao analisar a base, encontrei três problemas encadeados:

### 1. Orderbumps do Sussurros caindo em produto "fantasma"
Quando saíram vendas de **Palavras de Tentação** (src=`palavras`) com o Orderbump "Sussurros Proibidos – O que dizer…", o webhook não achou produto pelo `src` do bump e criou um produto novo com o **código da transação como nome/src** (ex.: `L9IK2M`). O Principal caiu no produto certo (Palavras), mas o bump foi para o fantasma. Linhas afetadas:

| transaction | Principal (correto) | Orderbump caiu em |
|---|---|---|
| DQMKTE0L | Palavras (`a116ec1c`) | `L9IK2M` |
| 6HYC6HKW | Palavras (`a116ec1c`) | `L9IK2M` |
| KLEYU0BYW8 | Gatilhos (`e59ab4d9` phantom, src=`C4QLTP`) | `L9IK2M` + `ZNWADX` |

Efeito visível: no relatório aparece "L9IK2M" e "ZNWADX" como se fossem produtos, e o Sussurros não soma esses bumps porque eles nem estavam no Sussurros — pertencem ao pai da transação (Palavras / Gatilhos).

### 2. Produtos duplicados / fantasmas para consolidar
- `L9IK2M` (`7e59d99a`), `ZNWADX` (`3a2dc0f1`) — só têm bumps mal roteados; some após reatribuição.
- `Gatilhos Sexuais Proibidos` src=`C4QLTP` (`e59ab4d9`) — 1 venda fantasma; funde no Gatilhos principal `gatilhos-marcos` (`84bbe7d8`).
- **375 produtos `sem-src-*`** — todos com 1 única venda `Abandonado / Outro` (checkout abandonado sem src). Não entram em faturamento, mas poluem a lista.

### 3. Duplicados de nomes iguais (precisa sua decisão)
Estes têm faturamento real dos dois lados, então **não** vou mexer sem confirmação:
- **O Peso da Cama Feita**: `bm05conta02-peso-cp01` (R$5.922) × `peso-17` (R$119) — unificar?
- **Palavras de Tentação**: `palavras-tentacao` (R$408) × `palavras` (R$47) — unificar?
- **Gatilhos Sexuais Proibidos**: `gatilhos-marcos` (R$7.613) × `gatilhos2` (R$282) — você pediu antes para manter separado (SRC2). Confirma que mantém?

Vou perguntar isso em seguida.

## Plano de correção

### A. Corrigir vendas já gravadas (Tannus Labs)
1. Reatribuir `product_id` dos 3 bumps hoje em `L9IK2M`:
   - DQMKTE0L e 6HYC6HKW → `a116ec1c` (Palavras / src=`palavras`).
   - KLEYU0BYW8 → Gatilhos principal (após a fusão do C4QLTP).
2. Reatribuir o bump `ZNWADX` (KLEYU0BYW8) → Gatilhos principal.
3. Fundir vendas do Gatilhos fantasma `e59ab4d9` (src=`C4QLTP`) em `84bbe7d8` (src=`gatilhos-marcos`).
4. Apagar produtos vazios: `L9IK2M`, `ZNWADX`, `C4QLTP`.

### B. Limpar checkouts abandonados
5. Apagar as 375 linhas `celetus_sales` `Abandonado/Outro` vinculadas a produtos `sem-src-*` e depois apagar os 375 produtos `sem-src-*`. Nada disso soma em faturamento hoje.

### C. Blindar o webhook (`src/routes/api/public/celetus-webhook.ts`)
Antes de criar um produto novo para um candidato **Orderbump**:
- Consultar `celetus_sales` por `transaction_code` no mesmo tenant.
- Se já existe uma linha (Principal ou outro bump) para essa transação, reutilizar o `product_id` / `src` dela em vez de criar produto com `src = transactionCode`.
- Se não existir nada ainda (bump chegou antes do Principal em webhooks separados), manter a lógica atual de "promoção" (o Principal renomeia depois), mas usar como `src` placeholder algo determinístico tipo `pending-<transactionCode>` para ser fácil de identificar e reprocessar.

Isso resolve o padrão que produziu `L9IK2M`, `ZNWADX`, `C4QLTP`, `J3P36V`, etc.

### D. Fora do escopo agora
- Fusões dos duplicados "reais" da seção 3 acima — aguardo sua resposta às perguntas.
- Não altero nada em Cecilia Labs / Gotannus nesta rodada.

## Detalhes técnicos
- Correções de dados via `supabase--insert` (UPDATE/DELETE) em uma migração de dados única, com filtros por `user_id='80a2d30a-…'` (Tannus Labs) para não afetar outras empresas.
- Alteração de código restrita a `src/routes/api/public/celetus-webhook.ts` (função `persistSaleCandidates` / criação de produto para bumps). Sem tocar em Hotmart parser (ele já resolve o pai pelo `parent_purchase_transaction`).
- Nenhuma mudança de schema.
