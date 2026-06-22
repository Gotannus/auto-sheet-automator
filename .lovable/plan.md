Vou corrigir o filtro de produto no Dashboard para que “Hoje + A mulher forte tá cansada” mostre as 3 vendas que aparecem no Total.

Plano:
1. Remover o log de diagnóstico que foi deixado em `getDailySummary`.
2. Ajustar a consulta de vendas filtrada por produto para não depender do `.or(...)` com `src`, que pode falhar no caso de `mulher-forte`.
3. Manter a regra atual: ao filtrar um produto, contar vendas do próprio `product_id` e orderbumps do checkout desse produto via `src`.
4. Aplicar a mesma correção em `getDashboard` e `getDailySummary`, para Dashboard e Resumo do dia ficarem consistentes.
5. Validar o cenário das imagens: Total hoje continua com 5 vendas e Mulher Forte hoje passa a mostrar 3 vendas / R$ 50,61.