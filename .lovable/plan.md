## Objetivo
1. No simulador, trocar o campo "Investimento planejado no mês" por "ROI do mês" (meta de ROI em %). Investimento passa a ser calculado a partir do lucro alvo e do ROI (`invest = lucro / ROI`).
2. Substituir o bloco atual "Fechamento provável / Ritmo recente" por dois cards de comparação com a meta:
   - **Realizado × Meta do mês** — o que já foi feito vs. o alvo do simulador.
   - **Fechamento provável × Meta projetada** — projeção (média × dias restantes) vs. o alvo do simulador.

## Mudanças em `src/routes/_authenticated/$companySlug/projecao.tsx`

**Simulador (`ScenarioBuilder`)**
- Remover state `plannedInvestText`; adicionar `targetRoiText` (default = ROI do `projection.recommended`, exibido como percentual, ex. `216,5`).
- Novo cálculo:
  - `targetRoi = parseFloat(targetRoiText) / 100`
  - `plannedInvest = targetRoi > 0 ? targetProfit / targetRoi : 0`
  - `requiredRevenue = (targetProfit + plannedInvest) / netRevenueRate`
- Trocar o label/Input "Investimento planejado no mês" por "ROI do mês (%)".
- Botão "Resetar provável" volta ambos para os valores do `projection.recommended` (lucro e ROI).
- KPIs finais e deltas continuam iguais (agora "Investimento" reflete o valor derivado).

**Comparações (substituir `ForecastResult`)**
- Levar `scenario` como prop e criar novo componente `GoalComparison` com dois cards lado a lado:
  - Card 1 "Realizado × Meta do mês": mostra Lucro / Faturamento / Investimento realizados, o alvo abaixo, e o `Δ` (verde se ≥ meta em lucro/faturamento, vermelho se abaixo; para invest é inverso: menor = melhor). Inclui % da meta atingida no lucro.
  - Card 2 "Fechamento provável × Meta projetada": mesma estrutura mas usando `p.projectedPace` no lugar do realizado; mantém o aviso curto quando `!p.projectionReady`.
- Manter a nota "Se continuar no mesmo ritmo…" no card de projeção.
- Ordem na página: Resultado atual → **Meta e simulação** (`ScenarioBuilder`) → **Comparações com a meta** (`GoalComparison`) → Sócios. (Mover o simulador para cima do comparador para que o alvo já esteja definido quando a comparação for lida; sócios continuam no fim.)

**Workspace**
- Já tem `scenario` em state; passar para `GoalComparison`.
- Remover import não usado (`TrendingDown` se sobrar).

## Fora do escopo
- Lógica de projeção em `src/lib/celetus/projection.ts`, card do dashboard, sócios e demais telas ficam como estão.
