## Problema

Em **Projeção por produto**, um produto que começou a rodar no dia 15 e fez R$ 500 de lucro em 5 dias aparece com projeção baixa porque `computeProjection` divide o realizado pelos **dias corridos do mês** (ex.: 20), não pelos dias em que o produto realmente rodou (5). Média fica R$ 25/dia em vez de R$ 100/dia.

## Causa

`src/lib/celetus/projection.ts` calcula `daysElapsed = currentDay` (dia do mês). Serve para a empresa toda (roda o mês inteiro), mas erra por produto quando a oferta começou depois do dia 1.

## Correção

### 1. `src/lib/celetus/projection.ts`
Adicionar opção `activeStart?: boolean` em `computeProjection`. Quando `true`:
- Detectar `firstActiveDay` = primeiro dia do mês (dentro de `upToToday`) com `revenue || invest_final || profit` ≠ 0.
- Se existir: `daysElapsed = currentDay - firstActiveDay + 1` (clampeado ≥ 1).
- `daysRemaining` continua sendo `daysInMonth - currentDay` (não muda — resto do mês real).
- Se nenhum dia ativo: comportamento atual (evita divisão por zero).

Comportamento padrão (`activeStart` ausente/false) fica idêntico ao atual — não afeta projeção da empresa nem do dashboard.

### 2. `src/routes/_authenticated/$companySlug/projecao.tsx`
Na seção **`ByProductProjection`** (linha ~1025), passar `activeStart: true` para `computeProjection`:

```ts
const proj = computeProjection(e.days, {
  monthYear: ym.year,
  monthMonth: ym.month,
  activeStart: true,
});
```

Projeção da empresa (KPIs de cima, gráfico, comparativos) permanece inalterada.

## Fora do escopo
- Mudar projeção global da empresa.
- Detectar pausas no meio do mês (produto que rodou dia 5–10 e voltou dia 20) — média continua sobre o intervalo primeiro-ativo→hoje, aceitável para low ticket.
