## Contexto

Confirmei no banco que existem 7 linhas hoje (3 Principais + 4 Orderbumps) para o produto **A mulher forte ta cansada** (`product_id` correto, `recipient='Produtor'`, `status='Pago'`, `sale_date` dentro do range BRT). Sem filtro de produto a página Hoje mostra os totais; **somente** quando você seleciona "Mulher Forte" no filtro e "Hoje" no período, fica tudo zerado.

A função `getDailySummary` em `src/lib/celetus/dashboard.functions.ts` usa um ramo especial quando há `product_id` (linhas 669-677):

```ts
salesQuery = salesQuery.or(
  `product_id.eq.${data.product_id},and(kind.eq.Orderbump,src.eq.${productSrc})`,
)
```

Como o `productSrc` do produto é `mulher-forte` (com hífen) e o `or()` do PostgREST tem uma sintaxe sensível a vírgulas/parênteses, suspeito que essa query esteja silenciosamente retornando 0 linhas em alguns cenários. O `getDashboard` (mensal) também usa essa mesma construção, então o mistério é por que mensal funciona e diário não — preciso ver a resposta real.

## Plano

1. **Diagnosticar** — adicionar `console.log` temporário em `getDailySummary` no ramo `if (data.product_id)` registrando: `productSrc`, número de linhas retornadas pela query de vendas, e o conteúdo agregado por `(produto, dia)`. Você reabre a página com filtro Mulher Forte + Hoje, eu leio os logs do servidor e identifico se:
   - a query trouxe 0 linhas (problema no PostgREST `.or()`),
   - trouxe as 7 linhas mas o agregador descartou (problema na lógica),
   - ou `productSrc` veio como algo inesperado.

2. **Corrigir** — provavelmente uma das duas correções:
   - **Caso a query retorne 0 linhas**: trocar o `.or()` por dois caminhos: primeiro busca direto por `product_id`, depois uma segunda busca de orderbumps `src=productSrc AND product_id != X`, e funde os resultados (mais simples e robusto a edge cases do PostgREST).
   - **Caso a query traga as 7 linhas mas o agg zere**: ajustar a condição no loop (provavelmente algo relacionado a `if (!s.product_id) continue` quando o filtro de produto está ativo).

3. **Validar** — reproduzir Hoje + Mulher Forte (e também Ontem, Este mês com filtro) e conferir os números contra o banco. Remover os `console.log` antes de finalizar.

## Detalhes técnicos

- Arquivo afetado: `src/lib/celetus/dashboard.functions.ts` (apenas o handler `getDailySummary`, linhas 616-810).
- Nenhuma mudança de schema, nenhuma migração, nenhum impacto em webhook.
- O fix final deve preservar o comportamento de "atribuir orderbumps de outro produto comprados no checkout deste produto" (regra do Celetus que você já validou).
