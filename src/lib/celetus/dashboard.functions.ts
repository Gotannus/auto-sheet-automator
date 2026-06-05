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

export type DayRow = {
  date: string;
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
};

export type ExpenseRow = {
  id: string;
  description: string;
  category: string;
  amount: number;
  expense_date: string | null;
};

type ManualAgg = {
  investManual: number | null;
  clicks: number | null;
  checkouts: number | null;
  impressions: number | null;
  notes: string | null;
};

type SalesAgg = {
  sales: number;
  revenue: number;
  obQty: number;
  obRevenue: number;
};

function fromUntyped(supabase: unknown, table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from(table);
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function fmtDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function brDateKey(value: unknown) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function nullableSum(current: number | null, value: unknown) {
  if (value === null || value === undefined) return current;
  return (current ?? 0) + num(value);
}

function isIgnoredIndicationSale(sale: Record<string, unknown>) {
  return (
    hasIndicationMarker(sale.raw) ||
    [sale.src, sale.src_tag, sale.utm_source, sale.campaign_id, sale.adset_id, sale.ad_id].some(
      isIndicationText,
    )
  );
}

function normalizeExpense(row: Record<string, unknown>): ExpenseRow {
  return {
    id: String(row.id),
    description: String(row.description ?? ""),
    category: String(row.category ?? "Geral"),
    amount: num(row.amount),
    expense_date: row.expense_date ? String(row.expense_date) : null,
  };
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

    let expenseRows: ExpenseRow[] = [];
    let itemizedExpenseTotal = 0;
    if (!data.product_id) {
      const { data: expenses, error: expensesError } = await fromUntyped(
        supabase,
        "monthly_expenses",
      )
        .select("id, description, category, amount, expense_date, created_at")
        .eq("user_id", userId)
        .eq("year", data.year)
        .eq("month", data.month)
        .order("expense_date", { ascending: true, nullsFirst: true })
        .order("created_at", { ascending: true });

      if (expensesError) throw new Error(expensesError.message);
      expenseRows = ((expenses ?? []) as Record<string, unknown>[]).map(normalizeExpense);
      itemizedExpenseTotal = expenseRows.reduce((sum, row) => sum + row.amount, 0);
    }

    const investmentTaxRate = num(settings?.investment_tax_rate, 0.1215);
    const revenueTaxRate = num(settings?.revenue_tax_rate);
    const legacyMonthlyExpenses = data.product_id ? 0 : num(settings?.monthly_expenses);
    const monthlyExpenses = data.product_id
      ? 0
      : itemizedExpenseTotal > 0
        ? itemizedExpenseTotal
        : legacyMonthlyExpenses;
    const companyCashRate = num(settings?.company_cash_rate, 0.1);
    const partner1Name = String(settings?.partner_1_name ?? "Rodrigo");
    const partner1Rate = num(settings?.partner_1_rate, 0.35);
    const partner2Name = String(settings?.partner_2_name ?? "Marcos");
    const partner2Rate = num(settings?.partner_2_rate, 0.65);

    const dim = daysInMonth(data.year, data.month);
    const firstDay = fmtDate(data.year, data.month, 1);
    const lastDay = fmtDate(data.year, data.month, dim);
    const fromIso = `${firstDay}T00:00:00-03:00`;
    const toIso = `${lastDay}T23:59:59-03:00`;

    let productSrc: string | null = null;
    if (data.product_id) {
      const { data: product, error: productError } = await fromUntyped(supabase, "products")
        .select("src")
        .eq("user_id", userId)
        .eq("id", data.product_id)
        .maybeSingle();
      if (productError) throw new Error(productError.message);
      productSrc = product?.src ?? null;
    }

    let salesQuery = fromUntyped(supabase, "celetus_sales")
      .select(
        "transaction_code, kind, status, recipient, commission_value, net_value, sale_date, quantity, src, src_tag, utm_source, campaign_id, adset_id, ad_id, raw, product_id",
      )
      .eq("user_id", userId)
      .gte("sale_date", fromIso)
      .lte("sale_date", toIso)
      .in("status", PAID);

    let manualQuery = fromUntyped(supabase, "daily_manual_inputs")
      .select("date, invest_manual, clicks, checkouts, impressions, notes")
      .eq("user_id", userId)
      .gte("date", firstDay)
      .lte("date", lastDay);

    if (data.product_id) {
      if (productSrc) {
        salesQuery = salesQuery.or(
          `product_id.eq.${data.product_id},and(kind.eq.Orderbump,src.eq.${productSrc})`,
        );
      } else {
        salesQuery = salesQuery.eq("product_id", data.product_id);
      }
      manualQuery = manualQuery.eq("product_id", data.product_id);
    }

    const [salesRes, manualRes] = await Promise.all([salesQuery, manualQuery]);
    if (salesRes.error) throw new Error(salesRes.error.message);
    if (manualRes.error) throw new Error(manualRes.error.message);

    const manualByDate = new Map<string, ManualAgg>();
    const getManual = (date: string) => {
      let manual = manualByDate.get(date);
      if (!manual) {
        manual = {
          investManual: null,
          clicks: null,
          checkouts: null,
          impressions: null,
          notes: null,
        };
        manualByDate.set(date, manual);
      }
      return manual;
    };

    for (const row of (manualRes.data ?? []) as Record<string, unknown>[]) {
      const manual = getManual(String(row.date));
      manual.investManual = nullableSum(manual.investManual, row.invest_manual);
      manual.clicks = nullableSum(manual.clicks, row.clicks);
      manual.checkouts = nullableSum(manual.checkouts, row.checkouts);
      manual.impressions = nullableSum(manual.impressions, row.impressions);
      manual.notes = data.product_id ? String(row.notes ?? "") || null : null;
    }

    const salesByDate = new Map<string, SalesAgg>();
    const getSales = (date: string) => {
      let agg = salesByDate.get(date);
      if (!agg) {
        agg = { sales: 0, revenue: 0, obQty: 0, obRevenue: 0 };
        salesByDate.set(date, agg);
      }
      return agg;
    };

    const transactionsWithPrincipal = new Set<string>();
    const pendingOrderbumpRevenue = new Map<string, { dateKey: string; amount: number }>();

    for (const sale of (salesRes.data ?? []) as Record<string, unknown>[]) {
      if (isIgnoredIndicationSale(sale)) continue;

      const recipient = String(sale.recipient ?? "").toLowerCase();
      if (recipient !== "produtor" && recipient !== "producer") continue;

      const dateKey = brDateKey(sale.sale_date);
      if (!dateKey) continue;

      const kind = String(sale.kind ?? "").toLowerCase();
      const agg = getSales(dateKey);
      const transactionCode = String(sale.transaction_code ?? "");
      const commissionValue = num(sale.commission_value);
      const quantity = num(sale.quantity, 1);

      if (kind === "principal" || kind === "main") {
        if (quantity === 1) {
          agg.sales += 1;
          agg.revenue += num(sale.net_value, commissionValue);
          if (transactionCode) transactionsWithPrincipal.add(transactionCode);
        }
        continue;
      }

      if (kind === "orderbump" || kind === "order_bump" || kind === "bump") {
        agg.obQty += 1;
        agg.obRevenue += commissionValue;
        if (transactionCode) {
          const pending = pendingOrderbumpRevenue.get(transactionCode);
          pendingOrderbumpRevenue.set(transactionCode, {
            dateKey,
            amount: (pending?.amount ?? 0) + commissionValue,
          });
        } else {
          agg.revenue += commissionValue;
        }
      }
    }

    for (const [transactionCode, pending] of pendingOrderbumpRevenue) {
      if (!transactionsWithPrincipal.has(transactionCode)) {
        getSales(pending.dateKey).revenue += pending.amount;
      }
    }

    const days: DayRow[] = [];
    for (let day = 1; day <= dim; day += 1) {
      const key = fmtDate(data.year, data.month, day);
      const sale = salesByDate.get(key) ?? { sales: 0, revenue: 0, obQty: 0, obRevenue: 0 };
      const manual = manualByDate.get(key);
      const investManual = manual?.investManual != null ? num(manual.investManual) : null;
      const investFinal = investManual != null ? investManual * (1 + investmentTaxRate) : 0;
      const revenueTax = sale.revenue * revenueTaxRate;
      const profit = sale.revenue - revenueTax - investFinal;

      days.push({
        date: key,
        sales: sale.sales,
        revenue: sale.revenue,
        revenue_tax: revenueTax,
        ob_qty: sale.obQty,
        ob_revenue: sale.obRevenue,
        invest_manual: investManual,
        invest_final: investFinal,
        profit,
        roi: investFinal > 0 ? profit / investFinal : 0,
        cpa: sale.sales > 0 ? investFinal / sale.sales : 0,
        ticket: sale.sales > 0 ? sale.revenue / sale.sales : 0,
        ob_pct: sale.sales > 0 ? sale.obQty / sale.sales : 0,
        clicks: manual?.clicks ?? null,
        checkouts: manual?.checkouts ?? null,
        impressions: manual?.impressions ?? null,
        notes: manual?.notes ?? null,
      });
    }

    const totals = days.reduce(
      (acc, day) => {
        acc.sales += day.sales;
        acc.revenue += day.revenue;
        acc.revenue_tax += day.revenue_tax;
        acc.ob_qty += day.ob_qty;
        acc.ob_revenue += day.ob_revenue;
        acc.invest_manual += day.invest_manual ?? 0;
        acc.invest_final += day.invest_final;
        acc.clicks += day.clicks ?? 0;
        acc.checkouts += day.checkouts ?? 0;
        acc.impressions += day.impressions ?? 0;
        return acc;
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

    return {
      taxRate: investmentTaxRate,
      investmentTaxRate,
      revenueTaxRate,
      days,
      expenses: data.product_id ? [] : expenseRows,
      totals: {
        ...totals,
        profit: netProfit,
        profit_before_expenses: profitBeforeExpenses,
        monthly_expenses: monthlyExpenses,
        legacy_monthly_expenses: legacyMonthlyExpenses,
        expense_count: expenseRows.length,
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
        roi: totals.invest_final > 0 ? netProfit / totals.invest_final : 0,
        cpa: totals.sales > 0 ? totals.invest_final / totals.sales : 0,
        ticket: totals.sales > 0 ? totals.revenue / totals.sales : 0,
        ob_pct: totals.sales > 0 ? totals.ob_qty / totals.sales : 0,
        cpm: totals.impressions > 0 ? (totals.invest_final / totals.impressions) * 1000 : 0,
        conv_click: totals.clicks > 0 ? totals.sales / totals.clicks : 0,
        conv_checkout: totals.checkouts > 0 ? totals.sales / totals.checkouts : 0,
      },
    };
  });

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
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
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

    const { data: saved, error } = await context.supabase
      .from("daily_manual_inputs")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(payload as any, { onConflict: "user_id,product_id,date" })
      .select("product_id, date, invest_manual, clicks, checkouts, impressions, notes, updated_at")
      .single();

    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Investimento nao foi confirmado pelo banco de dados.");
    return { ok: true, saved };
  });
