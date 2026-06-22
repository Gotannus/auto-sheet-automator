import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyId } from "@/lib/celetus/companies-resolve";
import { hasIndicationMarker, isIndicationText } from "@/lib/celetus/normalize";

const PAID = [
  "Pago",
  "Aprovado",
  "pago",
  "paid",
  "approved",
  "aprovado",
  "complete",
  "completed",
  "ApprovedPurchase",
  "SubscriptionActive",
  "SubscriptionCompleted",
];

export type ByProductRow = {
  product_id: string;
  product_name: string;
  sales: number;
  revenue: number;
  revenue_tax: number;
  ob_qty: number;
  ob_revenue: number;
  invest_manual: number | null;
  invest_final: number;
  profit: number;
  roi: number;
  cpa: number;
  ticket: number;
  ob_pct: number;
};

export type DayRow = {
  date: string; // YYYY-MM-DD
  sales: number;
  revenue: number;
  revenue_tax: number;
  ob_qty: number;
  ob_revenue: number;
  invest_manual: number | null;
  invest_final: number;
  profit: number;
  roi: number;
  cpa: number;
  ticket: number;
  ob_pct: number;
  clicks: number | null;
  checkouts: number | null;
  impressions: number | null;
  notes: string | null;
  sales_auto: number;
  revenue_auto: number;
  sales_override: number | null;
  revenue_override: number | null;
  by_product?: ByProductRow[];
};


function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function fmtDate(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function fromUntyped(supabase: unknown, table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from(table);
}

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        product_id: z.string().uuid().optional(),
        year: z.number().int(),
        month: z.number().int().min(1).max(12),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);

    const { data: settings, error: settingsError } = await fromUntyped(
      supabase,
      "monthly_tax_settings",
    )
      .select(
        "investment_tax_rate, revenue_tax_rate, monthly_expenses, company_cash_rate, partner_1_name, partner_1_rate, partner_2_name, partner_2_rate",
      )
      .eq("user_id", userId)
      .eq("year", data.year)
      .eq("month", data.month)
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);

    const investmentTaxRate = Number(settings?.investment_tax_rate ?? 0.1215);
    const revenueTaxRate = Number(settings?.revenue_tax_rate ?? 0);

    // Despesas: soma dos itens lançados no mês.
    // Se não houver itens, cai no valor único legado de monthly_tax_settings.monthly_expenses.
    let monthlyExpenses = 0;
    if (!data.product_id) {
      const expensesRes = await fromUntyped(supabase, "monthly_expenses_items")
        .select("amount")
        .eq("user_id", userId)
        .eq("year", data.year)
        .eq("month", data.month);
      if (expensesRes.error) throw new Error(expensesRes.error.message);
      const itemsTotal = (expensesRes.data ?? []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (sum: number, r: any) => sum + Number(r.amount ?? 0),
        0,
      );
      monthlyExpenses = itemsTotal > 0 ? itemsTotal : Number(settings?.monthly_expenses ?? 0);
    }
    const companyCashRate = Number(settings?.company_cash_rate ?? 0.1);
    const partner1Name = String(settings?.partner_1_name ?? "Rodrigo");
    const partner1Rate = Number(settings?.partner_1_rate ?? 0.35);
    const partner2Name = String(settings?.partner_2_name ?? "Marcos");
    const partner2Rate = Number(settings?.partner_2_rate ?? 0.65);

    const dim = daysInMonth(data.year, data.month);
    const firstDay = fmtDate(data.year, data.month, 1);
    const lastDay = fmtDate(data.year, data.month, dim);
    // Sale_date range as ISO timestamps (Brazil local boundaries)
    const fromIso = `${firstDay}T00:00:00-03:00`;
    const toIso = `${lastDay}T23:59:59-03:00`;

    // If filtering by product, also resolve its src so we can attribute
    // orderbumps purchased on this product's checkout (Celetus-style grouping).
    let productSrc: string | null = null;
    if (data.product_id) {
      const { data: prod, error: prodError } = await supabase
        .from("products")
        .select("src")
        .eq("user_id", userId)
        .eq("id", data.product_id)
        .maybeSingle();
      if (prodError) throw new Error(prodError.message);
      productSrc = prod?.src ?? null;
    }

    let salesQuery = supabase
      .from("celetus_sales")
      .select(
        "kind, status, recipient, commission_value, net_value, sale_date, quantity, src, src_tag, utm_source, campaign_id, adset_id, ad_id, raw, product_id",
      )
      .eq("user_id", userId)
      .gte("sale_date", fromIso)
      .lte("sale_date", toIso)
      .in("status", PAID);

    let dmiQuery = supabase
      .from("daily_manual_inputs")
      .select(
        "date, product_id, invest_manual, clicks, checkouts, impressions, notes, sales_override, revenue_override",
      )
      .eq("user_id", userId)
      .gte("date", firstDay)
      .lte("date", lastDay);

    if (data.product_id) {
      // Match Celetus checkout-level grouping:
      //   sales whose product_id is this product (Principal + own Orderbumps)
      //   OR orderbumps purchased on this product's checkout (src = product.src)
      if (productSrc) {
        salesQuery = salesQuery.or(
          `product_id.eq.${data.product_id},and(kind.eq.Orderbump,src.eq.${productSrc})`,
        );
      } else {
        salesQuery = salesQuery.eq("product_id", data.product_id);
      }
      dmiQuery = dmiQuery.eq("product_id", data.product_id);
    }

    // Paginate sales (PostgREST caps a single response at 1000 rows). Busy
    // months can exceed that and silently truncate the dashboard totals.
    async function fetchAllSales() {
      const pageSize = 1000;
      const all: any[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data: page, error } = await salesQuery.range(offset, offset + pageSize - 1);
        if (error) throw new Error(error.message);
        if (!page || page.length === 0) break;
        all.push(...page);
        if (page.length < pageSize) break;
      }
      return { data: all, error: null as null };
    }

    const [salesRes, dmiRes] = await Promise.all([fetchAllSales(), dmiQuery]);

    if (dmiRes.error) throw new Error(dmiRes.error.message);

    type ManualAgg = {
      investManual: number | null;
      clicks: number | null;
      checkouts: number | null;
      impressions: number | null;
      notes: string | null;
    };
    const dmiByDate = new Map<string, ManualAgg>();
    const getManualAgg = (date: string): ManualAgg => {
      let manual = dmiByDate.get(date);
      if (!manual) {
        manual = {
          investManual: null,
          clicks: null,
          checkouts: null,
          impressions: null,
          notes: null,
        };
        dmiByDate.set(date, manual);
      }
      return manual;
    };

    // Overrides per (product_id, date) — only set when user manually edited.
    type Override = { sales: number | null; revenue: number | null };
    const overrideByPD = new Map<string, Override>();
    // Manual invest per (product_id, date) — used for by-product breakdown in Total view.
    const investManualByPD = new Map<string, number>();
    const pdKey = (pid: string, date: string) => `${pid}::${date}`;

    for (const r of dmiRes.data ?? []) {
      const manual = getManualAgg(r.date);
      manual.investManual = nullableSum(manual.investManual, r.invest_manual);
      manual.clicks = nullableSum(manual.clicks, r.clicks);
      manual.checkouts = nullableSum(manual.checkouts, r.checkouts);
      manual.impressions = nullableSum(manual.impressions, r.impressions);
      manual.notes = data.product_id ? (r.notes ?? null) : null;
      if (r.product_id && r.invest_manual != null) {
        const key = pdKey(r.product_id, r.date);
        investManualByPD.set(key, (investManualByPD.get(key) ?? 0) + Number(r.invest_manual));
      }
      if (r.product_id && (r.sales_override != null || r.revenue_override != null)) {
        overrideByPD.set(pdKey(r.product_id, r.date), {
          sales: r.sales_override != null ? Number(r.sales_override) : null,
          revenue: r.revenue_override != null ? Number(r.revenue_override) : null,
        });
      }
    }


    // Aggregate sales per day in BRT (and per product+day for total override math)
    type Agg = { sales: number; revenue: number; obQty: number; obRevenue: number };
    const agg = new Map<string, Agg>();
    const getAgg = (k: string): Agg => {
      let a = agg.get(k);
      if (!a) {
        a = { sales: 0, revenue: 0, obQty: 0, obRevenue: 0 };
        agg.set(k, a);
      }
      return a;
    };
    const aggByPD = new Map<string, Agg>();
    const getAggPD = (k: string): Agg => {
      let a = aggByPD.get(k);
      if (!a) {
        a = { sales: 0, revenue: 0, obQty: 0, obRevenue: 0 };
        aggByPD.set(k, a);
      }
      return a;
    };

    for (const s of salesRes.data ?? []) {
      if (isIgnoredIndicationSale(s)) continue;

      const kind = String(s.kind ?? "").toLowerCase();
      const rec = String(s.recipient ?? "").toLowerCase();
      if (rec !== "produtor" && rec !== "producer") continue;
      const dt = new Date(s.sale_date);
      // Convert to BRT date string
      const brt = new Date(dt.getTime() - 3 * 60 * 60 * 1000);
      const key = brt.toISOString().slice(0, 10);
      const a = getAgg(key);
      const pid = s.product_id ? String(s.product_id) : null;
      const aPD = pid ? getAggPD(pdKey(pid, key)) : null;
      const itemCommission = Number(s.commission_value ?? 0);
      const qty = Number(s.quantity ?? 1);
      if (kind === "principal" || kind === "main") {
        if (qty === 1) {
          a.sales += 1;
          a.revenue += itemCommission;
          if (aPD) {
            aPD.sales += 1;
            aPD.revenue += itemCommission;
          }
        }
      } else if (kind === "orderbump" || kind === "order_bump" || kind === "bump") {
        a.obQty += 1;
        a.obRevenue += itemCommission;
        // Match Celetus "faturado no dia" — sum every line item (Principal + Orderbump)
        // into the headline revenue, not only Principal.
        a.revenue += itemCommission;
        if (aPD) {
          aPD.obQty += 1;
          aPD.obRevenue += itemCommission;
          aPD.revenue += itemCommission;
        }
      }
    }

    // Apply override deltas onto per-day aggregate so totals respect manual edits.
    // - Product view: only one product; replace its day values directly.
    // - Total view: for each (product, date) with override, swap that product's
    //   webhook-aggregated sales/revenue for the override value, then re-sum.
    const overrideSalesByDate = new Map<string, number>();
    const overrideRevenueByDate = new Map<string, number>();
    if (data.product_id) {
      for (const [k, ov] of overrideByPD) {
        const [pid, date] = k.split("::");
        if (pid !== data.product_id) continue;
        const a = getAgg(date);
        if (ov.sales != null) {
          overrideSalesByDate.set(date, ov.sales);
          a.sales = ov.sales;
        }
        if (ov.revenue != null) {
          // Replace headline revenue (Principal + OB) with override; keep OB columns from webhook.
          overrideRevenueByDate.set(date, ov.revenue);
          a.revenue = ov.revenue;
        }
      }
    } else {
      for (const [k, ov] of overrideByPD) {
        const [, date] = k.split("::");
        const aPD = aggByPD.get(k) ?? { sales: 0, revenue: 0, obQty: 0, obRevenue: 0 };
        const a = getAgg(date);
        if (ov.sales != null) {
          a.sales += ov.sales - aPD.sales;
        }
        if (ov.revenue != null) {
          a.revenue += ov.revenue - aPD.revenue;
        }
      }
    }

    // Resolve product names for by-product breakdown (Total view only).
    const productNameById = new Map<string, string>();
    if (!data.product_id) {
      const pidSet = new Set<string>();
      for (const k of aggByPD.keys()) pidSet.add(k.split("::")[0]);
      for (const k of investManualByPD.keys()) pidSet.add(k.split("::")[0]);
      for (const k of overrideByPD.keys()) pidSet.add(k.split("::")[0]);
      const pids = Array.from(pidSet);
      if (pids.length > 0) {
        const { data: prods, error: prodErr } = await supabase
          .from("products")
          .select("id, name, display_name")
          .eq("user_id", userId)
          .in("id", pids);
        if (prodErr) throw new Error(prodErr.message);
        for (const p of prods ?? [])
          productNameById.set(
            String(p.id),
            String((p as { display_name?: string | null }).display_name || p.name || ""),
          );
      }
    }

    const days: DayRow[] = [];
    for (let d = 1; d <= dim; d++) {
      const key = fmtDate(data.year, data.month, d);
      const a = agg.get(key) ?? { sales: 0, revenue: 0, obQty: 0, obRevenue: 0 };
      const dmi = dmiByDate.get(key);
      const investManual = dmi?.investManual != null ? Number(dmi.investManual) : null;
      const investFinal = investManual != null ? investManual * (1 + investmentTaxRate) : 0;
      const revenueTax = a.revenue * revenueTaxRate;
      const profit = a.revenue - revenueTax - investFinal;
      const roi = investFinal > 0 ? profit / investFinal : 0;
      const cpa = a.sales > 0 ? investFinal / a.sales : 0;
      const ticket = a.sales > 0 ? a.revenue / a.sales : 0;
      const obPct = a.sales > 0 ? a.obQty / a.sales : 0;

      // Show override input pre-filled only in product view (single product/day row).
      let salesOverride: number | null = null;
      let revenueOverride: number | null = null;
      let salesAuto = a.sales;
      let revenueAuto = a.revenue;
      if (data.product_id) {
        const ov = overrideByPD.get(pdKey(data.product_id, key));
        salesOverride = ov?.sales ?? null;
        revenueOverride = ov?.revenue ?? null;
        if (overrideSalesByDate.has(key)) {
          // Recover the pre-override webhook value for placeholder display.
          const aPD = aggByPD.get(pdKey(data.product_id, key));
          salesAuto = aPD?.sales ?? 0;
        }
        if (overrideRevenueByDate.has(key)) {
          const aPD = aggByPD.get(pdKey(data.product_id, key));
          revenueAuto = aPD?.revenue ?? 0;
        }
      }

      // Per-product breakdown for this day (Total view).
      let byProduct: ByProductRow[] | undefined;
      if (!data.product_id) {
        const pidsForDay = new Set<string>();
        for (const k of aggByPD.keys()) {
          const [pid, date] = k.split("::");
          if (date === key) pidsForDay.add(pid);
        }
        for (const k of investManualByPD.keys()) {
          const [pid, date] = k.split("::");
          if (date === key) pidsForDay.add(pid);
        }
        for (const k of overrideByPD.keys()) {
          const [pid, date] = k.split("::");
          if (date === key) pidsForDay.add(pid);
        }
        const rows: ByProductRow[] = [];
        for (const pid of pidsForDay) {
          const aPD = aggByPD.get(pdKey(pid, key)) ?? {
            sales: 0,
            revenue: 0,
            obQty: 0,
            obRevenue: 0,
          };
          const ov = overrideByPD.get(pdKey(pid, key));
          const pSales = ov?.sales != null ? ov.sales : aPD.sales;
          const pRevenue = ov?.revenue != null ? ov.revenue : aPD.revenue;
          const pInvestManual = investManualByPD.get(pdKey(pid, key)) ?? null;
          const pInvestFinal =
            pInvestManual != null ? pInvestManual * (1 + investmentTaxRate) : 0;
          const pRevenueTax = pRevenue * revenueTaxRate;
          const pProfit = pRevenue - pRevenueTax - pInvestFinal;
          const pRoi = pInvestFinal > 0 ? pProfit / pInvestFinal : 0;
          const pCpa = pSales > 0 ? pInvestFinal / pSales : 0;
          const pTicket = pSales > 0 ? pRevenue / pSales : 0;
          const pObPct = pSales > 0 ? aPD.obQty / pSales : 0;
          if (
            pSales === 0 &&
            pRevenue === 0 &&
            pInvestManual == null &&
            aPD.obQty === 0
          ) {
            continue;
          }
          rows.push({
            product_id: pid,
            product_name: productNameById.get(pid) ?? "(produto removido)",
            sales: pSales,
            revenue: pRevenue,
            revenue_tax: pRevenueTax,
            ob_qty: aPD.obQty,
            ob_revenue: aPD.obRevenue,
            invest_manual: pInvestManual,
            invest_final: pInvestFinal,
            profit: pProfit,
            roi: pRoi,
            cpa: pCpa,
            ticket: pTicket,
            ob_pct: pObPct,
          });
        }
        rows.sort((x, y) => y.revenue - x.revenue || y.sales - x.sales);
        byProduct = rows;
      }

      days.push({
        date: key,
        sales: a.sales,
        revenue: a.revenue,
        revenue_tax: revenueTax,
        ob_qty: a.obQty,
        ob_revenue: a.obRevenue,
        invest_manual: investManual,
        invest_final: investFinal,
        profit,
        roi,
        cpa,
        ticket,
        ob_pct: obPct,
        clicks: dmi?.clicks ?? null,
        checkouts: dmi?.checkouts ?? null,
        impressions: dmi?.impressions ?? null,
        notes: dmi?.notes ?? null,
        sales_auto: salesAuto,
        revenue_auto: revenueAuto,
        sales_override: salesOverride,
        revenue_override: revenueOverride,
        by_product: byProduct,
      });
    }


    // Totals
    const totals = days.reduce(
      (t, d) => {
        t.sales += d.sales;
        t.revenue += d.revenue;
        t.revenue_tax += d.revenue_tax;
        t.ob_qty += d.ob_qty;
        t.ob_revenue += d.ob_revenue;
        t.invest_manual += d.invest_manual ?? 0;
        t.invest_final += d.invest_final;
        t.clicks += d.clicks ?? 0;
        t.checkouts += d.checkouts ?? 0;
        t.impressions += d.impressions ?? 0;
        return t;
      },
      {
        sales: 0,
        revenue: 0,
        revenue_tax: 0,
        ob_qty: 0,
        ob_revenue: 0,
        invest_manual: 0,
        invest_final: 0,
        clicks: 0,
        checkouts: 0,
        impressions: 0,
      },
    );

    const profitBeforeExpenses = totals.revenue - totals.revenue_tax - totals.invest_final;
    const netProfit = profitBeforeExpenses - monthlyExpenses;
    const positiveSplitBase = Math.max(0, netProfit);
    const companyCash = positiveSplitBase * companyCashRate;
    const distributableProfit = Math.max(0, positiveSplitBase - companyCash);
    const partner1Amount = distributableProfit * partner1Rate;
    const partner2Amount = distributableProfit * partner2Rate;
    const roi = totals.invest_final > 0 ? netProfit / totals.invest_final : 0;
    const cpa = totals.sales > 0 ? totals.invest_final / totals.sales : 0;
    const ticket = totals.sales > 0 ? totals.revenue / totals.sales : 0;
    const obPct = totals.sales > 0 ? totals.ob_qty / totals.sales : 0;
    const cpm = totals.impressions > 0 ? (totals.invest_final / totals.impressions) * 1000 : 0;
    const convClick = totals.clicks > 0 ? totals.sales / totals.clicks : 0;
    const convCheckout = totals.checkouts > 0 ? totals.sales / totals.checkouts : 0;

    return {
      taxRate: investmentTaxRate,
      investmentTaxRate,
      revenueTaxRate,
      days,
      totals: {
        ...totals,
        profit: netProfit,
        profit_before_expenses: profitBeforeExpenses,
        monthly_expenses: monthlyExpenses,
        net_profit: netProfit,
        company_cash_rate: companyCashRate,
        company_cash: companyCash,
        distributable_profit: distributableProfit,
        partner_1_name: partner1Name,
        partner_1_rate: partner1Rate,
        partner_1_amount: partner1Amount,
        partner_2_name: partner2Name,
        partner_2_rate: partner2Rate,
        partner_2_amount: partner2Amount,
        roi,
        cpa,
        ticket,
        ob_pct: obPct,
        cpm,
        conv_click: convClick,
        conv_checkout: convCheckout,
      },
    };
  });

// ---------------------------------------------------------------------------
// Daily summary — visão "Resumo do dia" por empresa (ex: Hoje vs Ontem).
// Agrega vendas + inputs manuais num intervalo arbitrário [from, to], com a
// mesma lógica de Principal/Orderbump/overrides usada em getDashboard.
// ---------------------------------------------------------------------------

export type DailySummaryProductRow = {
  product_id: string;
  product_name: string;
  sales: number;
  revenue: number;
  ob_qty: number;
  ob_revenue: number;
  invest_manual: number;
  invest_final: number;
  profit: number;
  roi: number;
  cpa: number;
  ticket: number;
};

export type DailySummaryTotals = {
  sales: number;
  revenue: number;
  revenue_tax: number;
  ob_qty: number;
  ob_revenue: number;
  ob_pct: number;
  invest_manual: number;
  invest_final: number;
  profit: number;
  roi: number;
  cpa: number;
  ticket: number;
};

export type DailySummaryResult = {
  from: string;
  to: string;
  totals: DailySummaryTotals;
  by_product: DailySummaryProductRow[];
};

export const getDailySummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        product_id: z.string().uuid().optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<DailySummaryResult> => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);

    // Use os tax rates do mês de `to` (referência mais recente do período).
    const [refY, refM] = data.to.split("-").map(Number);
    const { data: settings } = await fromUntyped(supabase, "monthly_tax_settings")
      .select("investment_tax_rate, revenue_tax_rate")
      .eq("user_id", userId)
      .eq("year", refY)
      .eq("month", refM)
      .maybeSingle();
    const investmentTaxRate = Number(settings?.investment_tax_rate ?? 0.1215);
    const revenueTaxRate = Number(settings?.revenue_tax_rate ?? 0);

    const fromIso = `${data.from}T00:00:00-03:00`;
    const toIso = `${data.to}T23:59:59-03:00`;

    // Resolve productSrc para agrupar orderbumps do checkout (estilo Celetus).
    let productSrc: string | null = null;
    if (data.product_id) {
      const { data: prod, error: prodError } = await supabase
        .from("products")
        .select("src")
        .eq("user_id", userId)
        .eq("id", data.product_id)
        .maybeSingle();
      if (prodError) throw new Error(prodError.message);
      productSrc = prod?.src ?? null;
    }

    let salesQuery = supabase
      .from("celetus_sales")
      .select(
        "kind, status, recipient, commission_value, sale_date, quantity, src, src_tag, utm_source, campaign_id, adset_id, ad_id, raw, product_id",
      )
      .eq("user_id", userId)
      .gte("sale_date", fromIso)
      .lte("sale_date", toIso)
      .in("status", PAID);

    if (data.product_id) {
      if (productSrc) {
        salesQuery = salesQuery.or(
          `product_id.eq.${data.product_id},and(kind.eq.Orderbump,src.eq.${productSrc})`,
        );
      } else {
        salesQuery = salesQuery.eq("product_id", data.product_id);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allSales: any[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data: page, error } = await salesQuery.range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      if (!page || page.length === 0) break;
      allSales.push(...page);
      if (page.length < pageSize) break;
    }

    // DIAG
    console.log("[getDailySummary] DIAG", JSON.stringify({
      from: data.from, to: data.to,
      product_id: data.product_id ?? null,
      productSrc,
      fromIso, toIso,
      fetched_sales: allSales.length,
      sample: allSales.slice(0, 3).map((s) => ({
        id: s.id, kind: s.kind, status: s.status, recipient: s.recipient,
        product_id: s.product_id, src: s.src, sale_date: s.sale_date,
        commission_value: s.commission_value, quantity: s.quantity,
      })),
    }));

    let dmiQuery = fromUntyped(supabase, "daily_manual_inputs")
      .select("date, product_id, invest_manual, sales_override, revenue_override")
      .eq("user_id", userId)
      .gte("date", data.from)
      .lte("date", data.to);
    if (data.product_id) dmiQuery = dmiQuery.eq("product_id", data.product_id);
    const { data: dmiRows, error: dmiErr } = await dmiQuery;
    if (dmiErr) throw new Error(dmiErr.message);

    type Agg = { sales: number; revenue: number; obQty: number; obRevenue: number };
    const aggByPD = new Map<string, Agg>();
    const pdKey = (pid: string, date: string) => `${pid}::${date}`;
    const getPD = (k: string): Agg => {
      let a = aggByPD.get(k);
      if (!a) {
        a = { sales: 0, revenue: 0, obQty: 0, obRevenue: 0 };
        aggByPD.set(k, a);
      }
      return a;
    };

    for (const s of allSales) {
      if (isIgnoredIndicationSale(s)) continue;
      const rec = String(s.recipient ?? "").toLowerCase();
      if (rec !== "produtor" && rec !== "producer") continue;
      if (!s.product_id) continue;
      const kind = String(s.kind ?? "").toLowerCase();
      const dt = new Date(s.sale_date);
      const brt = new Date(dt.getTime() - 3 * 60 * 60 * 1000);
      const key = brt.toISOString().slice(0, 10);
      // Quando filtrando por produto, atribui orderbumps do checkout ao produto filtrado.
      const pid = data.product_id ?? String(s.product_id);
      const a = getPD(pdKey(pid, key));
      const itemCommission = Number(s.commission_value ?? 0);
      const qty = Number(s.quantity ?? 1);
      if (kind === "principal" || kind === "main") {
        if (qty === 1) {
          a.sales += 1;
          a.revenue += itemCommission;
        }
      } else if (kind === "orderbump" || kind === "order_bump" || kind === "bump") {
        a.obQty += 1;
        a.obRevenue += itemCommission;
        a.revenue += itemCommission;
      }
    }

    // Overrides + invest_manual por (produto, dia).
    const investByPD = new Map<string, number>();
    const overrideByPD = new Map<string, { sales: number | null; revenue: number | null }>();
    for (const r of dmiRows ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = r as any;
      if (!row.product_id) continue;
      const k = pdKey(row.product_id, row.date);
      if (row.invest_manual != null) {
        investByPD.set(k, (investByPD.get(k) ?? 0) + Number(row.invest_manual));
      }
      if (row.sales_override != null || row.revenue_override != null) {
        overrideByPD.set(k, {
          sales: row.sales_override != null ? Number(row.sales_override) : null,
          revenue: row.revenue_override != null ? Number(row.revenue_override) : null,
        });
      }
    }

    // Aplica overrides somando deltas por (produto, dia).
    for (const [k, ov] of overrideByPD) {
      const a = getPD(k);
      if (ov.sales != null) a.sales = ov.sales;
      if (ov.revenue != null) a.revenue = ov.revenue;
    }

    // Agrega por produto (somando todos os dias do período).
    type PAgg = Agg & { invest: number };
    const byProductMap = new Map<string, PAgg>();
    const getP = (pid: string): PAgg => {
      let a = byProductMap.get(pid);
      if (!a) {
        a = { sales: 0, revenue: 0, obQty: 0, obRevenue: 0, invest: 0 };
        byProductMap.set(pid, a);
      }
      return a;
    };
    for (const [k, a] of aggByPD) {
      const pid = k.split("::")[0];
      const p = getP(pid);
      p.sales += a.sales;
      p.revenue += a.revenue;
      p.obQty += a.obQty;
      p.obRevenue += a.obRevenue;
    }
    for (const [k, v] of investByPD) {
      const pid = k.split("::")[0];
      getP(pid).invest += v;
    }

    // Resolve nomes de produtos.
    const pids = Array.from(byProductMap.keys());
    const nameById = new Map<string, string>();
    if (pids.length > 0) {
      const { data: prods, error: prodErr } = await supabase
        .from("products")
        .select("id, name, display_name")
        .eq("user_id", userId)
        .in("id", pids);
      if (prodErr) throw new Error(prodErr.message);
      for (const p of prods ?? [])
        nameById.set(
          String(p.id),
          String((p as { display_name?: string | null }).display_name || p.name || ""),
        );
    }

    const byProduct: DailySummaryProductRow[] = [];
    for (const [pid, a] of byProductMap) {
      if (a.sales === 0 && a.revenue === 0 && a.invest === 0 && a.obQty === 0) continue;
      const investFinal = a.invest * (1 + investmentTaxRate);
      const revenueTax = a.revenue * revenueTaxRate;
      const profit = a.revenue - revenueTax - investFinal;
      byProduct.push({
        product_id: pid,
        product_name: nameById.get(pid) ?? "(produto removido)",
        sales: a.sales,
        revenue: a.revenue,
        ob_qty: a.obQty,
        ob_revenue: a.obRevenue,
        invest_manual: a.invest,
        invest_final: investFinal,
        profit,
        roi: investFinal > 0 ? profit / investFinal : 0,
        cpa: a.sales > 0 ? investFinal / a.sales : 0,
        ticket: a.sales > 0 ? a.revenue / a.sales : 0,
      });
    }
    byProduct.sort((x, y) => y.revenue - x.revenue || y.sales - x.sales);

    // Totais.
    const t = byProduct.reduce(
      (acc, r) => {
        acc.sales += r.sales;
        acc.revenue += r.revenue;
        acc.ob_qty += r.ob_qty;
        acc.ob_revenue += r.ob_revenue;
        acc.invest_manual += r.invest_manual;
        acc.invest_final += r.invest_final;
        return acc;
      },
      { sales: 0, revenue: 0, ob_qty: 0, ob_revenue: 0, invest_manual: 0, invest_final: 0 },
    );
    const revenueTax = t.revenue * revenueTaxRate;
    const profit = t.revenue - revenueTax - t.invest_final;

    return {
      from: data.from,
      to: data.to,
      totals: {
        sales: t.sales,
        revenue: t.revenue,
        revenue_tax: revenueTax,
        ob_qty: t.ob_qty,
        ob_revenue: t.ob_revenue,
        ob_pct: t.sales > 0 ? t.ob_qty / t.sales : 0,
        invest_manual: t.invest_manual,
        invest_final: t.invest_final,
        profit,
        roi: t.invest_final > 0 ? profit / t.invest_final : 0,
        cpa: t.sales > 0 ? t.invest_final / t.sales : 0,
        ticket: t.sales > 0 ? t.revenue / t.sales : 0,
      },
      by_product: byProduct,
    };
  });


function nullableSum(current: number | null, value: unknown) {
  if (value === null || value === undefined) return current;
  return (current ?? 0) + Number(value ?? 0);
}

function isIgnoredIndicationSale(sale: Record<string, unknown>) {
  return (
    hasIndicationMarker(sale.raw) ||
    [sale.src, sale.src_tag, sale.utm_source, sale.campaign_id, sale.adset_id, sale.ad_id].some(
      isIndicationText,
    )
  );
}

export const upsertDailyInput = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        product_id: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        invest_manual: z.number().nullable().optional(),
        clicks: z.number().int().nullable().optional(),
        checkouts: z.number().int().nullable().optional(),
        impressions: z.number().int().nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
        sales_override: z.number().int().min(0).nullable().optional(),
        revenue_override: z.number().min(0).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const payload: Record<string, unknown> = {
      user_id: userId,
      product_id: data.product_id,
      date: data.date,
    };
    if (data.invest_manual !== undefined) payload.invest_manual = data.invest_manual;
    if (data.clicks !== undefined) payload.clicks = data.clicks;
    if (data.checkouts !== undefined) payload.checkouts = data.checkouts;
    if (data.impressions !== undefined) payload.impressions = data.impressions;
    if (data.notes !== undefined) payload.notes = data.notes;
    if (data.sales_override !== undefined) payload.sales_override = data.sales_override;
    if (data.revenue_override !== undefined) payload.revenue_override = data.revenue_override;
    const { data: saved, error } = await supabase
      .from("daily_manual_inputs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(payload as any, { onConflict: "user_id,product_id,date" })
      .select(
        "product_id, date, invest_manual, clicks, checkouts, impressions, notes, sales_override, revenue_override, updated_at",
      )
      .single();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Edicao nao foi confirmada pelo banco de dados.");
    return { ok: true, saved };
  });
