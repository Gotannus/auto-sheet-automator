## Painel Admin Gotannus — Visão geral das empresas

Nova aba dentro de `/gotannus` mostrando últimas vendas em tempo real e resumo de faturamento/lucro de todas as empresas que o usuário tem acesso.

### 1. Acesso protegido por senha (4188)

- Gate de senha aplicado **somente quando a empresa atual = Gotannus** e o usuário acessa a aba "Visão Geral".
- Senha `4188`, armazenada em `sessionStorage` com chave `gotannus_admin_unlocked` (mesmo padrão usado em `/tannus`).
- Tela simples: input de 4 dígitos + botão "Entrar". Sai do gate ao acertar.

### 2. Nova aba no menu lateral (apenas Gotannus)

- Em `src/routes/_authenticated/route.tsx`, adicionar item de menu **"Visão Geral"** (ícone `Eye` ou `LayoutGrid`) condicional: só aparece quando `slug === "gotannus"`.
- Nova rota: `src/routes/_authenticated/$companySlug/visao-geral.tsx`.
  - Se o slug não for `gotannus`, redireciona para o dashboard da empresa.

### 3. Server function: `getAdminOverview`

Novo arquivo `src/lib/celetus/admin-overview.functions.ts` com `requireSupabaseAuth`. Retorna:

- **`recent_sales`**: últimas 20 vendas (todas as empresas do usuário), ordenadas por `sale_date desc`, ignorando `status = 'TestWebhook'`. Campos: empresa (nome), produto (display_name ou name), comprador, hora, valor, tipo (Principal/Bump).
- **`companies_summary`**: para cada empresa do usuário, no período selecionado:
  - faturamento (soma `commission_value` das vendas aprovadas)
  - investimento (soma de `daily_manual_inputs.invest_value` + facebook ads + despesas mensais rateadas — mesma lógica já usada no `getDashboard`)
  - lucro = faturamento − investimento − impostos/custos do mês (reaproveitar agregação existente)
  - nº de vendas (principal / bump)
  - ROI %

Para reduzir duplicação, a função itera sobre as empresas e reusa a query base de `getDashboard`/`getDailySummary` em modo "totais por empresa".

### 4. UI da página `visao-geral.tsx`

Layout em duas seções:

**Topo — Seletor de período** (Hoje / Ontem / 7 dias / Este mês / Mês passado / Personalizado), igual ao `hoje.tsx`.

**Esquerda (2/3) — Cards por empresa**
```text
┌─────────────────────────────────────┐
│ Cecilia Labs                        │
│ Faturamento  R$ 1.234,56            │
│ Investimento R$   400,00            │
│ Lucro        R$   834,56  (verde)   │
│ ROI 208% · 12 vendas (10P / 2B)     │
└─────────────────────────────────────┘
```
- Lucro em **verde** se positivo, **vermelho** se negativo (regra já estabelecida).
- Clicar no card → navega para `/{slug}/hoje`.

**Direita (1/3) — Últimas vendas (tempo real)**
- Lista compacta scrollável: `Empresa · Produto · 14:32 · R$ 19,90`.
- `useQuery` com `refetchInterval: 30_000` e `refetchOnWindowFocus: true`.
- Badge "ao vivo" com pulso verde.

### 5. Detalhes técnicos

- A função respeita RLS: só retorna empresas onde o usuário é owner/membro (via `companies` + `company_members`).
- Reaproveita `resolveCompanyId` em loop ou faz join único — preferir um único `select` em `celetus_sales` com `inner join` em `companies` filtrando por `owner_user_id = userId OR id IN (member_company_ids)`.
- Paginação das vendas usa o mesmo padrão de batching já corrigido no `getDashboard` (não é necessário aqui pois é só LIMIT 20).
- Sem mudanças de schema.

### Arquivos

- **Novo**: `src/lib/celetus/admin-overview.functions.ts`
- **Novo**: `src/routes/_authenticated/$companySlug/visao-geral.tsx`
- **Editar**: `src/routes/_authenticated/route.tsx` (adicionar item de menu condicional)
