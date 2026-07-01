## Objetivo
Deixar `/projecao` limpa e direta. Uma leitura por card, sem colunas cheias de KPIs, deltas e simuladores confusos.

## Nova estrutura da página (top → bottom)

```text
┌──────────────────────────────────────────────────────┐
│ HERO — Lucro do mês                                  │
│   R$ X.XXX  (verde/vermelho)                         │
│   "Fecha provável: R$ Y.YYY"  · ROI atual Z%         │
│   barra de progresso: X de Y dias                    │
└──────────────────────────────────────────────────────┘

┌──── Realizado ────┐   ┌──── Projetado ────┐
│ Fat  R$           │   │ Fat  R$           │
│ Inv  R$           │   │ Inv  R$           │
│ Lucro R$          │   │ Lucro R$          │
│ ROI  %            │   │ ROI  %            │
└───────────────────┘   └───────────────────┘

┌──────────────────────────────────────────────────────┐
│ Minha meta de lucro                                  │
│  [ input: R$ _____ ]                                 │
│  Falta: R$ ___   ·   Precisa lucrar R$ __/dia        │
│  vs. ritmo atual R$ __/dia  → ✅ dá / ⚠️ não dá     │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Divisão entre sócios (com base no lucro projetado)   │
│  tabela simples: nome · % · R$                       │
│  [botão editar sócios]                               │
└──────────────────────────────────────────────────────┘
```

## O que sai
- Cards "Média real até agora" (Fat/dia, Inv/dia, Lucro/dia).
- `GoalComparison` (Realizado × Meta e Fechamento × Meta com Δ triplo).
- `ScenarioBuilder` com ROI %, faturamento necessário, deltas, botões de +R$ de lucro, reset provável.
- KPI de "Faturamento necessário" e cálculo com `netRevenueRate`/variableCostRate.

## O que fica (simplificado)
- **Hero**: número grande do lucro do mês (realizado). Abaixo, linha compacta com fecha provável + ROI atual + barra de progresso do mês.
- **Dois cards lado a lado** (`Realizado` e `Projetado`): 4 linhas cada — Faturamento, Investimento, Lucro, ROI. Sem deltas.
- **Meta de lucro**: um único input (lucro alvo do mês). Mostra:
  - Falta: `alvo − lucro realizado`
  - Precisa/dia: `falta / dias restantes`
  - Ritmo atual/dia: `lucro realizado / dias passados`
  - Selo verde "no ritmo" se ritmo ≥ precisa/dia, vermelho "abaixo" caso contrário.
- **Sócios**: mantém a tabela de partners, mas menor, mostrando apenas Nome · % · R$ (com base no lucro projetado). Edição por botão que abre inline.

## Card do dashboard
Manter o card "Projeção do mês" no `dashboard.tsx` como está (já usa o mesmo `computeProjection`). Sem mudanças.

## Arquivos
- `src/routes/_authenticated/$companySlug/projecao.tsx` — reescrever componentes `ProjectionWorkspace`, remover `CurrentResult` complexo, `GoalComparison`, `GoalCard`, `GoalRow`, `ScenarioBuilder`, `ScenarioDelta`. Adicionar `HeroCard`, `RealizedCard`, `ProjectedCard`, `SimpleGoalCard`. Manter `PartnersSection` mas encolher UI.
- `src/lib/celetus/projection.ts` — sem alterações (já expõe realized, projectedPace, runningAverage, daysElapsed, daysRemaining, daysInMonth).
- Nenhuma migração de banco.

## Detalhes técnicos
- Cores: lucro positivo `text-emerald-600`, negativo `text-rose-600`. Selo do ritmo: `bg-emerald-500/10 text-emerald-700` ou `bg-rose-500/10 text-rose-700`.
- Barra de progresso: `daysElapsed / daysInMonth`.
- Lucro/dia necessário oculto quando `daysRemaining === 0` (mostra "Mês fechado").
- Sócios: `partner.share_pct × projectedPace.profit`.
- Estado do input de meta com `useState`, default = `projection.recommended.profit` (fecha provável).
- Remover imports não usados após limpeza (`TrendingUp`, `ScenarioDelta`, etc.).
