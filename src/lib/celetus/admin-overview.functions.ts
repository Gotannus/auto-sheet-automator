import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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

export type CompanyOverviewRow = {
  company_id: string;
  company_slug: string;
  company_name: string;
  sales: number;
  principal_qty: number;
  ob_qty: number;
  revenue: number;
  invest_manual: number;
  invest_final: number;
  profit: number;
  roi: number;
};

export type RecentSaleRow = {
  id: string;
  company_id: string;
  company_slug: string;
  company_name: string;
  product_name: string;
  buyer_name: string | null;
  sale_date: string;
  kind: string;
  commission_value: number;
};

export type AdminOverviewResult = {
  from: string;
  to: string;
  companies: CompanyOverviewRow[];
  recent_sales: RecentSaleRow[];
};

function isIgnoredIndicationSale(sale: Record<string, unknown>) {
  return (
    hasIndicationMarker(sale.raw) ||
    [sale.src, sale.src_tag, sale.utm_source, sale.campaign_id, sale.adset_id, sale.ad_id].some(
      isIndicationText,
    )
  );
}

export const getAdminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdminOverviewResult> => {
    const { supabase } = context;

    // 1) All companies the user can see (RLS).
    const { data: companies, error: cErr } = await supabase
      .from("companies")
      .select("id, slug, name")
      .order("name", { ascending: true });
    if (cErr) throw new Error(cErr.message);
    const companyList = (companies ?? []) as Array<{ id: string; slug: string; name: string }>;
    const companyIds = companyList.map((c) => c.id);
    const byId = new Map(companyList.map((c) => [c.id, c]));

    if (companyIds.length === 0) {
      return { from: data.from, to: data.to, companies: [], recent_sales: [] };
    }

    const fromIso = `${data.from}T00:00:00-03:00`;
    const toIso = `${data.to}T23:59:59-03:00`;

    // 2) Tax settings per company for ref month (month of `to`).
    const [refY, refM] = data.to.split("-").map(Number);
    const { data: taxRows } = await supabase
      .from("monthly_tax_settings")
      .select("user_id, investment_tax_rate, revenue_tax_rate")
      .in("user_id", companyIds)
      .eq("year", refY)
      .eq("month", refM);
    const taxByCompany = new Map<string, { inv: number; rev: number }>();
    for (const r of (taxRows ?? []) as Array<{
      user_id: string;
      investment_tax_rate: number | null;
      revenue_tax_rate: number | null;
    }>) {
      taxByCompany.set(r.user_id, {
        inv: Number(r.investment_tax_rate ?? 0.1215),
        rev: Number(r.revenue_tax_rate ?? 0),
      });
    }

    // 3) Sales for period (paginate).
    async function fetchAll<T>(
      builder: ReturnType<typeof supabase.from>,
      select: string,
    ): Promise<T[]> {
      const pageSize = 1000;
      const out: T[] = [];
      for (let offset = 0; ; offset += pageSize) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: page, error } = await (builder as any)
          .select(select)
          .range(offset, offset + pageSize - 1);
        if (error) throw new Error(error.message);
        if (!page || page.length === 0) break;
        out.push(...(page as T[]));
        if (page.length < pageSize) break;
      }
      return out;
    }

    type SaleRow = {
      user_id: string;
      kind: string | null;
      recipient: string | null;
      commission_value: number | null;
      quantity: number | null;
      sale_date: string;
      src: string | null;
      src_tag: string | null;
      utm_source: string | null;
      campaign_id: string | null;
      adset_id: string | null;
      ad_id: string | null;
      raw: unknown;
    };

    const salesBuilder = supabase
      .from("celetus_sales")
      .in("user_id", companyIds)
      .gte("sale_date", fromIso)
      .lte("sale_date", toIso)
      .in("status", PAID);
    const allSales = await fetchAll<SaleRow>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      salesBuilder as any,
      "user_id, kind, recipient, commission_value, quantity, sale_date, src, src_tag, utm_source, campaign_id, adset_id, ad_id, raw",
    );

    // 4) Manual invest per company in period.
    const { data: dmiRows, error: dmiErr } = await supabase
      .from("daily_manual_inputs")
      .select("user_id, invest_manual")
      .in("user_id", companyIds)
      .gte("date", data.from)
      .lte("date", data.to);
    if (dmiErr) throw new Error(dmiErr.message);

    const investByCompany = new Map<string, number>();
    for (const r of (dmiRows ?? []) as Array<{ user_id: string; invest_manual: number | null }>) {
      if (r.invest_manual == null) continue;
      investByCompany.set(r.user_id, (investByCompany.get(r.user_id) ?? 0) + Number(r.invest_manual));
    }

    // 5) Aggregate sales per company.
    type Agg = { sales: number; revenue: number; principal: number; obQty: number };
    const agg = new Map<string, Agg>();
    const getAgg = (id: string): Agg => {
      let a = agg.get(id);
      if (!a) {
        a = { sales: 0, revenue: 0, principal: 0, obQty: 0 };
        agg.set(id, a);
      }
      return a;
    };

    for (const s of allSales) {
      if (isIgnoredIndicationSale(s as unknown as Record<string, unknown>)) continue;
      const rec = String(s.recipient ?? "").toLowerCase();
      if (rec !== "produtor" && rec !== "producer") continue;
      const a = getAgg(s.user_id);
      const kind = String(s.kind ?? "").toLowerCase();
      const commission = Number(s.commission_value ?? 0);
      const qty = Number(s.quantity ?? 1);
      if (kind === "principal" || kind === "main") {
        if (qty === 1) {
          a.sales += 1;
          a.principal += 1;
          a.revenue += commission;
        }
      } else if (kind === "orderbump" || kind === "order_bump" || kind === "bump") {
        a.obQty += 1;
        a.revenue += commission;
      }
    }

    const out: CompanyOverviewRow[] = companyList.map((c) => {
      const a = agg.get(c.id) ?? { sales: 0, revenue: 0, principal: 0, obQty: 0 };
      const tax = taxByCompany.get(c.id) ?? { inv: 0.1215, rev: 0 };
      const investManual = investByCompany.get(c.id) ?? 0;
      const investFinal = investManual * (1 + tax.inv);
      const revenueTax = a.revenue * tax.rev;
      const profit = a.revenue - revenueTax - investFinal;
      return {
        company_id: c.id,
        company_slug: c.slug,
        company_name: c.name,
        sales: a.sales,
        principal_qty: a.principal,
        ob_qty: a.obQty,
        revenue: a.revenue,
        invest_manual: investManual,
        invest_final: investFinal,
        profit,
        roi: investFinal > 0 ? profit / investFinal : 0,
      };
    });
    out.sort((x, y) => y.revenue - x.revenue);

    // 6) Recent sales (latest 20 across all companies).
    const { data: recent, error: recentErr } = await supabase
      .from("celetus_sales")
      .select(
        "id, user_id, product_name, buyer_name, sale_date, kind, commission_value, recipient, status",
      )
      .in("user_id", companyIds)
      .neq("status", "TestWebhook")
      .order("sale_date", { ascending: false })
      .limit(40);
    if (recentErr) throw new Error(recentErr.message);

    // Resolve product display names for recent rows.
    type RecentRaw = {
      id: string;
      user_id: string;
      product_name: string | null;
      buyer_name: string | null;
      sale_date: string;
      kind: string | null;
      commission_value: number | null;
      recipient: string | null;
    };
    const rawRecent = (recent ?? []) as RecentRaw[];
    const filteredRecent = rawRecent
      .filter((r) => {
        const rec = String(r.recipient ?? "").toLowerCase();
        return rec === "produtor" || rec === "producer";
      })
      .slice(0, 20);

    // Try to map product_name -> display_name (per company).
    const productNames = Array.from(
      new Set(filteredRecent.map((r) => r.product_name).filter((n): n is string => !!n)),
    );
    const displayByKey = new Map<string, string>();
    if (productNames.length > 0) {
      const { data: prods } = await supabase
        .from("products")
        .select("user_id, name, display_name")
        .in("user_id", companyIds)
        .in("name", productNames);
      for (const p of (prods ?? []) as Array<{
        user_id: string;
        name: string;
        display_name: string | null;
      }>) {
        if (p.display_name) {
          displayByKey.set(`${p.user_id}::${p.name}`, p.display_name);
        }
      }
    }

    const recentOut: RecentSaleRow[] = filteredRecent.map((r) => {
      const c = byId.get(r.user_id);
      const displayName =
        (r.product_name && displayByKey.get(`${r.user_id}::${r.product_name}`)) ||
        r.product_name ||
        "—";
      return {
        id: r.id,
        company_id: r.user_id,
        company_slug: c?.slug ?? "",
        company_name: c?.name ?? "—",
        product_name: displayName,
        buyer_name: r.buyer_name,
        sale_date: r.sale_date,
        kind: String(r.kind ?? ""),
        commission_value: Number(r.commission_value ?? 0),
      };
    });

    return {
      from: data.from,
      to: data.to,
      companies: out,
      recent_sales: recentOut,
    };
  });
