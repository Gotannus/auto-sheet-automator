## Problema

No `dashboard.functions.ts`, vendas com `kind = orderbump` somam apenas em `ob_qty` / `ob_revenue`, mas **não entram no `revenue` (Faturamento)**. Por isso a % de orderbump aparece, mas o Faturamento não sobe quando vende OB.

## Correção

No loop de agregação de vendas (linhas ~183-191), incluir a comissão do orderbump no `revenue` do dia:

```ts
} else if (kind === "orderbump" || ...) {
  a.obQty += 1;
  a.obRevenue += commission;
  a.revenue += commission; // ← passa a somar no Faturamento
}
```

- **Sales (quantidade de vendas)**: continua contando só `Principal` (1 venda principal pode ter vários OBs anexados — não inflar contagem).
- **Revenue / Faturamento**: passa a incluir `Principal + Orderbump`.
- **Ticket médio** (`revenue / sales`): naturalmente reflete o OB embutido (igual à planilha).
- **OB %** (`obQty / sales`): segue igual.
- **Lucro, ROI, CPA**: recalculam automaticamente a partir do novo `revenue`.

Nada muda no schema, webhook, ou UI — só o cálculo agregado no servidor.