## Objetivo
Fazer o "Fechamento provável" sempre mostrar a projeção real (média do mês até hoje × dias restantes + realizado), inclusive nos primeiros dias do mês, em vez de cair para o lucro atual como "base segura".

## Mudanças

**1. `src/lib/celetus/projection.ts`**
- Remover o gate `daysElapsed >= 3` do `projectedPace` e `projectedRecent`.
- `projectedPace` = `runRateProjection` sempre (realizado + média diária × dias restantes).
- `projectedRecent` = `recentRunRateProjection` sempre (realizado + média dos últimos 7 dias × dias restantes).
- Manter o campo `projectionReady` só como sinal informativo (para a UI mostrar um aviso "poucos dias de dados, projeção pode variar"), mas sem zerar a projeção.

**2. `src/routes/_authenticated/$companySlug/projecao.tsx`**
- "Fechamento provável" passa a exibir sempre os valores de `projectedPace` (faturamento, invest, lucro, ROI) com verde/vermelho.
- Substituir o texto "Ainda é cedo…/base segura" por um aviso mais leve quando `!projectionReady`: "Baseado em poucos dias, tende a variar bastante." — mas os números da projeção continuam visíveis.
- Idem para o card "Ritmo recente".

**3. `src/routes/_authenticated/$companySlug/dashboard.tsx`**
- Card superior "Projeção do mês": sempre usar `projectedPace.profit` e `projectedRecent.profit`. Trocar o label condicional "Base segura / Ritmo indicativo" por "Fecha provável / Ritmo recente" fixo, mantendo apenas uma nota curta quando `!projectionReady`.

## Fora do escopo
- Simulador de metas, tabela de sócios e cálculo de custos variáveis permanecem como estão.
