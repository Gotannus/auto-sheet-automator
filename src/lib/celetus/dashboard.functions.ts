import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompany } from "@/lib/celetus/workspaces";

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
        product_id: z.string().uuid(),
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
      .select("investment_tax_rate, revenue_tax_rate")
      .eq("user_id", userId)
      .eq("year", data.year)
      .eq("month", data.month)
      .maybeSingle();
    if (settingsError) throw new Error(settingsError.message);

    const investmentTaxRate = Number(settings?.investment_tax_rate ?? 0.1215);
    const revenueTaxRate = Number(settings?.revenue_tax_rate ?? 0);

    const dim = daysInMonth(data.year, data.month);
    const firstDay = fmtDate(data.year, data.month, 1);
    const lastDay = fmtDate(data.year, data.month, dim);
    // Sale_date range as ISO timestamps (Brazil local boundaries)
    const fromIso = `${firstDay}T00:00:00-03:00`;
    const toIso = `${lastDay}T23:59:59-03:00`;

    const [salesRes, dmiRes] = await Promise.all([
      supabase
        .from("celetus_sales")
        .select("kind, status, recipient, commission_value, sale_date, quantity")
        .eq("user_id", userId)
        .eq("product_id", data.product_id)
        .gte("sale_date", fromIso)
        .lte("sale_date", toIso)
        .in("status", PAID),
      supabase
        .from("daily_manual_inputs")
        .select("date, invest_manual, clicks, checkouts, impressions, notes")
        .eq("user_id", userId)
        .eq("product_id", data.product_id)
        .gte("date", firstDay)
        .lte("date", lastDay),
    ]);

    if (salesRes.error) throw new Error(salesRes.error.message);
    if (dmiRes.error) throw new Error(dmiRes.error.message);

    // Index daily manual inputs by date
    const dmiByDate = new Map<string, (typeof dmiRes.data)[number]>();
    for (const r of dmiRes.data ?? []) dmiByDate.set(r.date, r);

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
      const kind = String(s.kind ?? "").toLowerCase();
      const rec = String(s.recipient ?? "").toLowerCase();
      if (rec !== "produtor" && rec !== "producer") continue;
      const dt = new Date(s.sale_date);
      // Convert to BRT date string
      const brt = new Date(dt.getTime() - 3 * 60 * 60 * 1000);
      const key = brt.toISOString().slice(0, 10);
      const a = getAgg(key);
      const commission = Number(s.commission_value ?? 0);
      const qty = Number(s.quantity ?? 1);
      if (kind === "principal" || kind === "main") {
        if (qty === 1) {
          a.sales += 1;
          a.revenue += commission;
        }
      } else if (kind === "orderbump" || kind === "order_bump" || kind === "bump") {
        a.obQty += 1;
        a.obRevenue += commission;
      }
    }

    const days: DayRow[] = [];
    for (let d = 1; d <= dim; d++) {
      const key = fmtDate(data.year, data.month, d);
      const a = agg.get(key) ?? { sales: 0, revenue: 0, obQty: 0, obRevenue: 0 };
      const dmi = dmiByDate.get(key);
      const investManual = dmi?.invest_manual != null ? Number(dmi.invest_manual) : null;
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

    const profit = totals.revenue - totals.revenue_tax - totals.invest_final;
    const roi = totals.invest_final > 0 ? profit / totals.invest_final : 0;
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
        profit,
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
