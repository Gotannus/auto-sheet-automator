
## Objetivo

Reestilizar a página `/projecao` seguindo o layout do HTML enviado (dashboard escuro estilo "CVR Intelligence"), mantendo toda a lógica atual (dados vindos de `computeProjection`, meta, sócios, projeção por produto). Apenas apresentação — nenhuma mudança em `projection.ts`, `dashboard.functions.ts` ou server functions.

## Escopo

Arquivo único: `src/routes/_authenticated/$companySlug/projecao.tsx`.

Sem sidebar (o app já tem navegação própria) — aproveitamos apenas o **conteúdo principal** do modelo. Cores/superfícies via tokens do design system (`bg-card`, `border`, `text-emerald-500`, `text-rose-500`, `text-primary`) para respeitar tema escuro/claro do projeto, não hard-code de `#070b14`.

## Nova estrutura da página

```text
┌─ Topbar ────────────────────────────────────────────────┐
│  Projeção · Empresa · Mês         [Este mês ▾]  [chips] │
├─ KPI row (5 cards) ─────────────────────────────────────┤
│ Lucro mês │ Fecha provável │ ROI atual │ Fat. mês │ Inv│
│  (verde/  │  (verde grande)│  (azul)   │  (info)  │(warn)
│  vermelho │  + Δ vs meta   │           │          │    │
├─ Main grid (1.3fr / 1fr) ───────────────────────────────┤
│ Curva diária de lucro       │  Leitura executiva       │
│ (SVG line + área, ponto     │  · 3 read-cards dinâmicos│
│  "hoje" destacado, linha    │  · bloco conclusão       │
│  pontilhada projetada)      │    (on pace / off pace)  │
├─ Bottom grid (1fr / 1fr) ───────────────────────────────┤
│ Realizado × Projetado ×     │ Projeção por produto     │
│ Meta (triple-bars por       │ (tabela + mini strip:    │
│ métrica: Fat, Inv, Lucro,   │  Fat, Inv, Lucro, ROI)   │
│ ROI)                        │                          │
├─ Meta de lucro + Sócios ────────────────────────────────┤
│ (mantém componentes atuais, estilizados como cards)     │
└─────────────────────────────────────────────────────────┘
```

## Detalhes de UI

- **KPI cards**: mesmo formato do modelo (label uppercase pequena, valor 34px bold, sub, trend pill). Cores por semântica: `success` para lucro positivo, `alert` para negativo, `info`/`warn` para faturamento/investimento.
- **Curva diária (SVG)**: gerada a partir de `q.data.days` acumulando lucro por dia. Área com gradient azul, ponto de "hoje" verde. Se `daysRemaining > 0`, linha pontilhada estendida até `projectedPace.profit` no último dia do mês.
- **Leitura executiva**: 3 cards gerados por regras simples:
  1. Ritmo atual (lucro/dia realizado)
  2. Fecha provável × meta (bate/não bate)
  3. Produto líder projetado
  + bloco conclusão colorido (verde se on-pace, âmbar se abaixo).
- **Triple-bars comparativas**: substitui os cards "Realizado" e "Projetado" atuais. Para cada métrica (Faturamento, Investimento, Lucro, ROI): barras Realizado / Projetado / Meta com % relativo ao maior.
- **Projeção por produto**: reaproveita cálculo do `ByProductProjection` atual, apenas re-renderizado como tabela compacta no card, com strip de mini-KPIs no topo (totais).
- **Meta de lucro** (`GoalCard`) e **Sócios** (`PartnersSection`): mantidos, apenas com espaçamento/tipografia alinhados ao novo visual.

## O que NÃO muda

- `computeProjection`, `projection.ts`, servidor, queries.
- Componentes `GoalCard` e `PartnersSection` (só ajustes visuais leves).
- Não adiciono sidebar/nav do modelo — o app já tem a sua.
- Sem novos pacotes.

## Riscos

- Layout denso pode ficar apertado em telas médias; usarei os mesmos breakpoints do modelo (`@media 1260px` e `780px`) via Tailwind (`lg:` / `md:`).
- SVG inline sem lib; simples e sem dependências.

Se aprovar, implemento tudo em uma edição do `projecao.tsx`.
