
## Auditoria do gap 324 vs 425,41

Cruzei a planilha (`report_2026-06-05T19_48_01_730Z.xlsx`) com o banco e isolei **dois problemas independentes** que somados produzem o gap.

### Diagnóstico

**Totais na planilha (05/06, Status=Pago):**

| Tipo | Qtde | Soma `Value` |
|---|---:|---:|
| Principal | 38 | 325,40 |
| Orderbump | 28 | 100,01 |
| **Total** | **66** | **425,41** ✅ (igual ao "faturado" da Celetus) |

**Totais no banco (mesmo intervalo):**

| Tipo | Qtde | Soma `commission_value` |
|---|---:|---:|
| Principal | 28 | 324,31 |
| Orderbump | 16 | 98,99 |
| **Total** | **44** | **423,30** |

E o dashboard mostra **324** porque o agregador (`getDashboard`) só soma Principal — Orderbump entra em outra coluna (`ob_revenue`), nunca em `revenue`.

### Causa 1 — Conceitual (responsável por ~99% do gap)

`src/lib/celetus/dashboard.functions.ts` linhas 206–214: `a.revenue` só recebe `itemCommission` quando `kind === 'principal'`. Orderbump vai para `a.obRevenue`.

A Celetus, ao mostrar "faturado no dia = 425,41", soma **todos os line items** do checkout (Principal + cada Orderbump como linha própria). Para a paridade que você validou no Mulher Forte/Peso, a métrica "Faturamento" precisa ser **Principal.commission_value + Orderbump.commission_value**, mesmo na visão geral sem filtro de produto.

Hoje, mesmo com o ajuste anterior (orderbump atribuído ao produto-pai via SRC), eu só puxo a linha pra dentro do filtro do produto, mas continuo somando ela em `ob_revenue` e não em `revenue`. Resultado: número total e por produto continuam menores que a Celetus.

### Causa 2 — Dados faltando (~2,10 do gap + 9 orderbumps "perdidos")

10 vendas Principal e ~12 Orderbumps relacionadas estão na planilha mas não no banco:

- `Sondagem Diagnóstica - Alfabetização` (4 vendas)
- `Kit para Crianças Autistas` (3 vendas)
- `Kit Estimulação Cognitiva` (3 vendas)

Conferi `products` e `celetus_sales`: esses 3 produtos **nunca foram criados** no workspace. `webhook_events` está vazio (nenhum webhook caiu desde o deploy de logging), e não temos hoje nenhum log da rota `importCeletusReport`, então não dá pra dizer se o upload da planilha agora rodou e falhou no meio, ou se ele nem chegou ao handler.

A função `importCeletusReport` (linhas 98–111) cria produtos novos sob demanda, então a explicação mais provável é que a importação **não foi executada com sucesso** (sem rastro). Precisamos de logging para essa rota.

---

## Plano

### Passo 1 — Faturamento = Principal + Orderbump no dashboard

Em `src/lib/celetus/dashboard.functions.ts`, no loop de agregação (linha 206):
- Manter `a.obQty` / `a.obRevenue` como hoje (para a coluna "OB" e cálculo do `ob_pct`).
- Adicionar `a.revenue += itemCommission` **também** para `kind === 'orderbump'`.
- Para `a.sales`, manter contando só Principal (1 venda = 1 checkout, mantém ticket médio fiel).

Validação esperada (05/06, sem filtro): `revenue = 423,30`, `sales = 28`, `ob_qty = 16`, `ob_revenue = 98,99`. Depois do Passo 2 (reimportar), `revenue` vai para **425,41**, batendo com a Celetus.

Sem mudança no `Sales` (aba Vendas) — a lista por linha continua igual.

### Passo 2 — Reprocessar a planilha e instrumentar a rota de importação

a) **Logging da importação:** estender `webhook_events` (ou criar tabela própria `import_events`) com `kind = 'import'`, `received_at`, `rows_read`, `rows_upserted`, `rows_ignored`, `products_created`, `error_message`, `file_name`. Em `importCeletusReport`, gravar uma linha por upload (sucesso ou erro), e mostrar essas linhas no `/webhook-logs` filtradas por tipo.

b) **Reimportar o arquivo agora:** depois do logging no ar, você reenvia o `report_2026-06-05T19_48_01_730Z.xlsx` pela tela **Importar**. O upsert via `(user_id, transaction_code, line_item_code)` ignora o que já existe e cria os 3 produtos novos + as ~22 linhas que faltam.

### Validação final pós-Passos 1 + 2

Dashboard de 05/jun, sem filtro de produto:
- `Faturamento` = **425,41**
- `Vendas (Principais)` = 38
- `OB qtde` = 28 / `OB receita` = 100,01

Dashboard com filtro "O Peso da Cama Feita" continua **173,29** (já validado).

### Fora de escopo

- Mudar o cálculo de `sales` para incluir orderbumps (quebraria ticket médio).
- Reprocessar webhooks antigos: o `webhook_events` só captura daqui pra frente; o histórico continua dependendo da reimportação de planilha.
- Tela de gestão dos `import_events` além de aparecer junto com webhooks em `/webhook-logs`.

### Notas técnicas

- Arquivos tocados: `src/lib/celetus/dashboard.functions.ts`, `src/lib/celetus/import.functions.ts`, `src/routes/_authenticated/$companySlug/webhook-logs.tsx`, `src/lib/celetus/webhook-events.functions.ts`.
- Migração: nova coluna `kind text` (default `'webhook'`) em `webhook_events`, ou criar `import_events` com a mesma forma; prefiro a 1ª opção pra reaproveitar UI.
