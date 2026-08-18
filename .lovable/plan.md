# Escolher quais empresas aparecem na Visão Geral

Hoje a Visão Geral (Gotannus) mostra todas as empresas que você tem acesso. Você quer poder esconder algumas (ex.: a do Bruno, que é de mentorado) do seu painel de administrador.

## Como vai funcionar

- Cada empresa ganha uma marcação "mostrar na Visão Geral", guardada no banco e controlada por você (administrador). Vale em qualquer navegador/dispositivo.
- Um botão "Empresas exibidas" no topo da Visão Geral abre uma lista com todas as empresas e um interruptor para cada uma. Desligou, some.
- A empresa desligada some de tudo nessa tela: cards de empresa, Total geral e a lista de Últimas vendas da lateral.
- Isso não afeta nada mais: a empresa continua funcionando normalmente, com dashboard, webhooks e vendas intactos. Ela só não aparece na Visão Geral.

## Detalhes técnicos

- Migração: adicionar `show_in_overview boolean not null default true` em `public.companies` (políticas atuais de dono já cobrem leitura/edição).
- `src/lib/celetus/admin-overview.functions.ts`: filtrar `show_in_overview = true` na consulta de empresas; como os agregados e as vendas recentes derivam dessa lista, cards, Total geral e feed já ficam consistentes. Adicionar uma função `listOverviewCompanySettings` (todas as empresas + flag) e `setCompanyOverviewVisibility({ companyId, show })`, ambas com `requireSupabaseAuth`.
- `src/routes/_authenticated/$companySlug/visao-geral.tsx`: botão/`Popover` "Empresas exibidas" com `Switch` por empresa; ao alternar, chamar a mutação e invalidar as queries `admin-overview` e a de configuração.

## Correção de build pendente

Três links de produto (`products.tsx`, `produto.$productId.tsx`, `projecao.tsx`) usam caminhos montados por string, que o roteador tipado rejeita. Ajustar esses `Link` para usar rota + parâmetros (`to="/$companySlug/produto/$productId"` com `params`) como primeiro passo, para o projeto voltar a compilar.
