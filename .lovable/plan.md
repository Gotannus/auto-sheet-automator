## Ajustes

### 1. Remover "Resumo do dia"
- Em `src/routes/_authenticated/route.tsx`: remover o `<NavItem>` "Resumo do dia" (linhas 57–59) e o import de `Zap`.
- Deletar `src/routes/_authenticated/$companySlug/hoje.tsx` para eliminar a duplicação (a Visão Geral do Gotannus e o Dashboard já cobrem o caso). A rota `/hoje` some do bundle após deletar o arquivo.

### 2. Investimento por produto no modo Total (por dia)
Hoje, no modo Total (`isTotal === true`), a `DailyTable` renderiza `ReadOnlyDailyRow` e a linha expandida ("Detalhe por produto") só mostra números. Vamos permitir editar o **investimento manual daquele produto naquele dia** direto na linha expandida — o total do dia continua sem edição direta (o campo do dia agregado permanece read-only).

Mudanças em `src/routes/_authenticated/$companySlug/dashboard.tsx`:
- `DashContent` já recebe `companySlug`; passar também para `DailyTable` (já passa) e propagar até `ReadOnlyDailyRow` o `companySlug` para permitir a mutação.
- Em `ReadOnlyDailyRow`, transformar a célula "Invest. manual" de cada linha de `by_product` em um input inline (mesmo componente `NumCell` usado hoje) com botão de lápis → confirm → salvar. Ao salvar, chamar `upsertDailyInput` com `{ company_slug, product_id: p.product_id, date: day.date, invest_manual: value }` (mesmo shape usado pelo `DailyRow` de produto único). Após sucesso: `invalidateQueries({ queryKey: ["dash", companySlug] })` — refaz tanto o Total quanto qualquer produto individual.
- Manter as demais colunas do detalhe por produto como leitura. Bloquear edição no header do dia (linha agregada) permanece — o pedido é justamente restringir edição ao par (produto, data).
- Recalcular os totais do dia acontece naturalmente no próximo fetch (já vem agregado do server).

### 3. Filtro de produtos com atividade no período
No `<Select>` de produto (linhas 366–378), esconder produtos sem qualquer venda **e** sem investimento manual dentro do período carregado.

Abordagem:
- Rodar uma consulta paralela leve com `productId = Total` sempre (mesmo quando o usuário já está com um produto específico selecionado), reaproveitando `getDashboard` e o cache do React Query (mesma `queryKey` do modo Total → sem duplicação quando estiver em Total).
- Derivar `activeProductIds = union` de todos os `by_product[].product_id` em que `sales > 0 || (invest_manual ?? 0) > 0`, considerando todos os `days` do período (respeitando `range` quando ativo).
- Filtrar `products` pelo `activeProductIds` antes do `.map` do Select. Sempre manter no dropdown o produto atualmente selecionado (mesmo que sem atividade) para não bugar o `Select` controlado; se ele estiver fora do conjunto, exibi-lo em cinza com sufixo "(sem atividade)".
- Enquanto a query paralela está carregando, mostrar a lista completa (fallback), evitando "flash" com o dropdown vazio.

### Arquivos
- `src/routes/_authenticated/route.tsx` — remover item de menu.
- `src/routes/_authenticated/$companySlug/hoje.tsx` — deletar.
- `src/routes/_authenticated/$companySlug/dashboard.tsx` — edição inline no breakdown por produto + filtro do Select.

Sem mudanças em server functions, schema ou outras telas.