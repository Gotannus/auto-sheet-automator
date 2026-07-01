## Projeção de lucro e simulador de cenários

### 1. Card no Dashboard (resumo rápido)
Novo card "Projeção do mês" no topo do `dashboard.tsx`, visível quando o período selecionado for um dos presets mensais (Este mês / Mês passado). Mostra:
- **Realizado**: lucro acumulado até hoje.
- **Projeção A — Média diária × dias do mês**: `(lucro_realizado / dias_com_atividade) × dias_no_mês`.
- **Projeção B — Últimos 7 dias**: `lucro_realizado + média_últimos_7d × dias_restantes`.
- Diferença vs mês anterior (delta % opcional).
- Link "Ver simulador →" para a nova aba.

Cores: verde se positivo, vermelho se negativo (padrão já usado no projeto).

### 2. Nova aba "Projeção" no menu da empresa
Rota: `src/routes/_authenticated/$companySlug/projecao.tsx`.
Item de menu adicionado em `src/routes/_authenticated/route.tsx` (ícone `TrendingUp`).

Estrutura da página:

**a) Resumo do mês atual** — mesmas duas projeções lado a lado + ROI projetado + faturamento projetado.

**b) Simulador de cenários** — controles interativos (sem persistência, estado local):
- Slider "Aumento de faturamento" (−20% a +100%, default 0%).
- Slider "Redução de investimento" (−50% a +50%, default 0%).
- Slider "ROI alvo" (0% a 500%) — alternativa: calcula lucro necessário para atingir esse ROI mantendo investimento atual.
- Card resultado: faturamento simulado, investimento simulado, lucro simulado, ROI simulado — atualizando em tempo real.
- Baseline = Projeção A do mês.

**c) Divisão entre sócios** — tabela editável:
- Lista de sócios da empresa (nome + %).
- Botão "Adicionar sócio" / remover linha.
- Validação: soma dos % deve dar 100 (aviso visual se não bater).
- Para cada sócio: valor no cenário realizado, na projeção do mês, e no cenário simulado.
- Salvar persiste no banco (nova tabela `company_partners`).

### 3. Schema — nova tabela `company_partners`
Migração:
```sql
CREATE TABLE public.company_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  share_pct numeric(5,2) NOT NULL CHECK (share_pct >= 0 AND share_pct <= 100),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_partners TO authenticated;
GRANT ALL ON public.company_partners TO service_role;
ALTER TABLE public.company_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members manage partners" ON public.company_partners
  FOR ALL TO authenticated
  USING (public.has_company_access(auth.uid(), company_id))
  WITH CHECK (public.has_company_access(auth.uid(), company_id));
-- + trigger update_updated_at_column
```

### 4. Server functions novas
Arquivo `src/lib/celetus/projection.functions.ts`:
- `getMonthProjection({ company_slug, month? })` → devolve `{ realized_profit, realized_revenue, realized_invest, days_elapsed, days_in_month, days_remaining, avg_daily_profit, avg_last7_profit, projection_avg, projection_last7, projected_revenue, projected_invest }`. Reutiliza a mesma agregação do `getDashboard` (query paginada de vendas + `daily_manual_inputs`).
- `listPartners({ company_slug })` / `savePartners({ company_slug, partners: [{ id?, name, share_pct, sort_order }] })` — upsert + delete dos removidos numa transação lógica.

Todas usam `requireSupabaseAuth`.

### 5. Arquivos alterados / criados
- **Criar**: `src/routes/_authenticated/$companySlug/projecao.tsx`, `src/lib/celetus/projection.functions.ts`.
- **Editar**: `src/routes/_authenticated/route.tsx` (item de menu), `src/routes/_authenticated/$companySlug/dashboard.tsx` (card de projeção no topo).
- **Migração**: tabela `company_partners`.

### Observações técnicas
- Timezone BRT já é padrão (`brtNow` reutilizado).
- Projeções só fazem sentido em janela mensal contínua — no modo "Personalizado" ou faixas curtas o card do dashboard fica oculto e a aba usa sempre o mês atual como base (com seletor "Este mês / Mês passado" só para referência histórica).
- Divisão entre sócios aplica-se sobre o lucro (não faturamento).
