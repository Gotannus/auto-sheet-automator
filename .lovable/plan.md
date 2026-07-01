## Ajustes na Visão Geral (`/gotannus/visao-geral`)

### 1. Card "Total" das 3 empresas
No topo da grade de empresas (antes dos cards individuais), adicionar um card destacado "Total geral" somando todas as empresas visíveis no período:
- Faturamento (soma de `revenue`)
- Investimento (soma de `invest_final`; também mostrar `invest_manual` somado embaixo, no mesmo padrão dos cards)
- Lucro (soma de `profit`) — verde se ≥ 0, vermelho se < 0
- ROI consolidado = lucro_total / invest_final_total
- Rodapé: `X vendas · YP / ZB` somando `sales`, `principal_qty`, `ob_qty`

Cálculo feito no cliente a partir do array `companies` que o server já retorna — sem mexer no server function.

### 2. Filtro de empresa nas "Últimas vendas"
Acima da lista `ÚLTIMAS VENDAS`, adicionar um `<Select>` compacto com:
- "Todas as empresas" (padrão)
- Uma opção por empresa (usando `company_slug` como value, `company_name` como label) — geradas a partir do próprio `result.companies`

Filtro aplicado no cliente sobre `recent_sales` (`company_slug === selected`). Mantém o auto-refresh de 30s existente e o indicador "ao vivo".

Observação: como hoje o server retorna as 20 vendas mais recentes no total, ao filtrar por uma empresa específica a lista pode ficar curta em períodos com poucas vendas dessa empresa. Se quiser sempre 20 por empresa selecionada, precisaria alterar o server function para aceitar `company_slug` opcional e refazer a query — me avisa se quer essa versão em vez do filtro puramente client-side.

### Arquivos
- `src/routes/_authenticated/$companySlug/visao-geral.tsx` — único arquivo alterado. Sem mudanças em server functions, schema ou outras telas.
