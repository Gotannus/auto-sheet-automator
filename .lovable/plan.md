## Diagnóstico

**1. Peso da Cama Feita (173,29)** — Não é bug de cálculo. Celetus agrupa por **checkout** (tudo vendido na página do Peso); nosso dashboard agrupa por **produto**. Resultado hoje:
- Principal "Peso": 13 × 9,45 = 122,85
- Orderbumps comprados no checkout do Peso (mas hoje listados como produtos próprios): Me lembra 16,68 + Devocional 22,64 + Casado 11,12 = **50,44**
- Soma = 173,29 ✅ (bate com Celetus, só está distribuído)

Cada orderbump tem `src = bm05conta02-peso-cp01` apontando o checkout pai → dá pra reatribuir.

**2. Mulher Forte (faltou 1 venda das 06:17)** — Webhook não chegou no banco. Logs do servidor só cobrem a última hora, então não dá pra ver o que aconteceu agora; precisamos passar a registrar para o futuro.

---

## Passo 1 — Atribuição "como na Celetus" para orderbumps

Mudar `getDashboard` em `src/lib/celetus/dashboard.functions.ts`:

- Hoje a query filtra `product_id = X` direto. Vai passar a:
  1. Buscar o `src` do produto selecionado em `products`.
  2. Buscar vendas onde `product_id = X` **OU** (`kind = Orderbump` E `src = <src do produto>`).
- Resultado: ao filtrar "O Peso da Cama Feita", aparecem as 13 Principais (122,85) + os 9 orderbumps vendidos no checkout dele (50,44) = **173,29**, igualzinho à Celetus.

**Impacto colateral:**
- Os produtos "Me lembra", "Devocional", "Casado e Sozinho" continuam existindo na tabela `products`, mas no dashboard só vão aparecer com dados se forem **principais** em algum checkout. Como hoje são só orderbumps, vão ficar zerados quando selecionados isoladamente. Se quiser, posso esconder produtos sem vendas Principais no seletor — diga depois.
- Totais gerais (dia/mês, sem filtro de produto) **não mudam** — só muda a distribuição por produto.
- Aba de Vendas não muda (continua mostrando cada linha como veio).

---

## Passo 2 — Visibilidade de falhas de webhook (pra próxima perda)

Logs ClickHouse só guardam 1h, então perdemos a janela da venda das 06:17. Criar tabela `webhook_events`:

| campo | uso |
|---|---|
| `received_at` | quando o webhook chegou |
| `transaction_code` | da Celetus |
| `status` | `ok` / `ignored` / `error` |
| `error_message` | mensagem se falhou |
| `payload` (jsonb) | corpo cru (pra reprocessar manualmente se precisar) |

O endpoint `/api/public/celetus-webhook` passa a inserir uma linha **antes** de tentar o upsert; em caso de erro, grava o erro e ainda responde 200 (pra Celetus não ficar reenviando). Adicionar uma página simples `/(/$companySlug)/webhook-logs` listando os últimos 100, filtrando por status, com botão "Reprocessar" que repassa o `payload` ao handler.

Isso resolve diagnóstico futuro. **Para a venda perdida de hoje**: a única forma de recuperá-la agora é importar a planilha de hoje da Celetus na aba de Import (o sistema deduplica pelo transaction_code).

---

## Fora deste plano

- Mudar atribuição global (Vendas, exports) — só dashboard.
- Reescrever o webhook handler além do log.
- Esconder produtos "só-orderbump" do seletor (decisão posterior).

## Validação

Depois de aplicar:
- Dashboard com filtro "O Peso da Cama Feita" em 05/jun → revenue = **173,29**, sales = 13 (Principais), ob_qty = 9, ob_revenue = 50,44.
- Dashboard sem filtro → totais do dia inalterados.
- Próximo webhook que chegar gera linha em `webhook_events` (visível em /webhook-logs).
