import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompany } from "@/lib/celetus/workspaces";
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
    const userId = resolveCompany(data.company_slug).userId;

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
    const monthlyExpenses = data.product_id ? 0 : Number(settings?.monthly_expenses ?? 0);
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

    let salesQuery = supabase
      .from("celetus_sales")
      .select(
        "kind, status, recipient, commission_value, net_value, sale_date, quantity, src, src_tag, utm_source, campaign_id, adset_id, ad_id, raw",
      )
      .eq("user_id", userId)
      .gte("sale_date", fromIso)
      .lte("sale_date", toIso)
      .in("status", PAID);

    let dmiQuery = supabase
      .from("daily_manual_inputs")
      .select("date, invest_manual, clicks, checkouts, impressions, notes")
      .eq("user_id", userId)
      .gte("date", firstDay)
      .lte("date", lastDay);

    if (data.product_id) {
      salesQuery = salesQuery.eq("product_id", data.product_id);
      dmiQuery = dmiQuery.eq("product_id", data.product_id);
    }

    const [salesRes, dmiRes] = await Promise.all([salesQuery, dmiQuery]);

    if (salesRes.error) throw new Error(salesRes.error.message);
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

    for (const r of dmiRes.data ?? []) {
      const manual = getManualAgg(r.date);
      manual.investManual = nullableSum(manual.investManual, r.invest_manual);
      manual.clicks = nullableSum(manual.clicks, r.clicks);
      manual.checkouts = nullableSum(manual.checkouts, r.checkouts);
      manual.impressions = nullableSum(manual.impressions, r.impressions);
      manual.notes = data.product_id ? (r.notes ?? null) : null;
    }

    // Aggregate sales per day in BRT
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
      const itemCommission = Number(s.commission_value ?? 0);
      const orderCommission = Number(s.net_value ?? s.commission_value ?? 0);
      const qty = Number(s.quantity ?? 1);
      if (kind === "principal" || kind === "main") {
        if (qty === 1) {
          a.sales += 1;
          a.revenue += orderCommission;
        }
      } else if (kind === "orderbump" || kind === "order_bump" || kind === "bump") {
        a.obQty += 1;
        a.obRevenue += itemCommission;
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
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = resolveCompany(data.company_slug).userId;
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
    const { data: saved, error } = await supabase
      .from("daily_manual_inputs")
      .select("product_id, date, invest_manual, clicks, checkouts, impressions, notes, updated_at")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(payload as any, { onConflict: "user_id,product_id,date" })
      .single();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Investimento nao foi confirmado pelo banco de dados.");
    return { ok: true, saved };
  });
