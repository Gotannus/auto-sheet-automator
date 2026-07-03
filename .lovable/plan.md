## Ajustes

### 1. Dashboard — produto clicável ao expandir a data
Em `src/routes/_authenticated/$companySlug/dashboard.tsx`, na tabela "Detalhe por produto — <data>" (linha ~890), transformar `p.product_name` num `Link` para `/$companySlug/produto/$productId`, com estilo discreto (hover sublinhado, cor herdada) para manter o visual atual da tabela.

### 2. Projeção — produtos no topo
Em `src/routes/_authenticated/$companySlug/projecao.tsx`, mover o `<ByProductProjection />` para logo abaixo do `<KpiRow />`, ocupando largura total (fora do grid 2-col). O grid atual (`CompareBars` + `ByProductProjection`) passa a conter só o `CompareBars` — ou fundimos `CompareBars` com o `ExecutiveReading` na linha existente. Ordem final:

```text
KpiRow
ByProductProjection   ← movido pra cá (full-width)
DailyChart | ExecutiveReading
CompareBars           ← sozinho ou realocado
GoalCard | PartnersSection
```

Assim os produtos aparecem imediatamente após os KPIs, sem precisar rolar.

### Fora do escopo
Nada de mudanças em cálculo, backend, ou no card do produto em si.