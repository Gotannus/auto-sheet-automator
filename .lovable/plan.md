## Problema

No dashboard individual de um produto (`/produto/$productId`), a projeção "Fim do mês" usa média diária dividida pelos **dias corridos do mês**. Produto que começou dia 17 e fez R$ 451,75 em 5 dias mostra média de R$ 21,51/dia (451,75 ÷ 21) em vez de R$ 90/dia (451,75 ÷ 5). Resultado: Lucro Proj vem R$ 666,88 quando o correto seria ~R$ 1.350.

## Causa

`src/routes/_authenticated/$companySlug/produto.$productId.tsx` (linha ~114) chama:

```ts
computeProjection(q.data.days, { monthYear: ym.year, monthMonth: ym.month })
```

sem `activeStart: true`. A opção já existe em `projection.ts` e já é usada na página `projecao.tsx` (seção "Projeção por produto") — só falta aplicá-la aqui.

## Correção

Uma linha em `src/routes/_authenticated/$companySlug/produto.$productId.tsx`:

```ts
computeProjection(q.data.days, {
  monthYear: ym.year,
  monthMonth: ym.month,
  activeStart: true,
})
```

Efeito: `daysElapsed` passa a contar a partir do primeiro dia com venda ou investimento no mês; `daysRemaining` continua sendo o resto do calendário. Média diária, Lucro Proj, Fat Proj, Inv Proj e ROI Proj recalculam sozinhos.

## Fora do escopo

- Projeção da empresa (KPIs de cima do dashboard e página Projeção) segue com base em dias corridos — comportamento intencional.
- Detectar pausas no meio do mês (produto que rodou dia 5–10 e voltou dia 20).
