import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyId } from "@/lib/celetus/companies-resolve";

const SortField = z.enum(["sale_date", "commission_value", "net_value", "gross_value"]);
const SortDir = z.enum(["asc", "desc"]);

export type SaleRow = {
  id: string;
  sale_date: string;
  transaction_code: string;
  line_item_code: string;
  product_name: string | null;
  offer_name: string | null;
  kind: string;
  status: string;
  recipient: string | null;
  quantity: number;
  commission_value: number;
  net_value: number | null;
  gross_value: number | null;
  buyer_name: string | null;
  buyer_email: string | null;
  src: string;
  payment_method: string | null;
};

export const listSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        product_id: z.string().uuid().optional().nullable(),
        status: z.string().optional().nullable(),
        kind: z.string().optional().nullable(),
        search: z.string().optional().nullable(),
        date_from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .nullable(),
        date_to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .nullable(),
        sort_by: SortField.default("sale_date"),
        sort_dir: SortDir.default("desc"),
        page: z.number().int().min(1).default(1),
        page_size: z.number().int().min(1).max(100).default(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;

    let q = supabase
      .from("celetus_sales")
      .select(
        "id, sale_date, transaction_code, line_item_code, product_name, offer_name, kind, status, recipient, quantity, commission_value, net_value, gross_value, buyer_name, buyer_email, src, payment_method",
        { count: "exact" },
      )
      .eq("user_id", userId);

    if (data.product_id) q = q.eq("product_id", data.product_id);
    if (data.status) q = q.eq("status", data.status);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.date_from) q = q.gte("sale_date", `${data.date_from}T00:00:00-03:00`);
    if (data.date_to) q = q.lte("sale_date", `${data.date_to}T23:59:59-03:00`);
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      q = q.or(
        `transaction_code.ilike.%${s}%,buyer_name.ilike.%${s}%,buyer_email.ilike.%${s}%,product_name.ilike.%${s}%`,
      );
    }

    const { data: rows, error, count } = await q
      .order(data.sort_by, { ascending: data.sort_dir === "asc" })
      .range(from, to);

    if (error) throw new Error(error.message);

    // Totals across the full filtered set, ignoring TestWebhook.
    let totalsQ = supabase
      .from("celetus_sales")
      .select("commission_value, gross_value, net_value, kind")
      .eq("user_id", userId)
      .neq("status", "TestWebhook")
      .limit(10000);
    if (data.product_id) totalsQ = totalsQ.eq("product_id", data.product_id);
    if (data.status) totalsQ = totalsQ.eq("status", data.status);
    if (data.kind) totalsQ = totalsQ.eq("kind", data.kind);
    if (data.date_from)
      totalsQ = totalsQ.gte("sale_date", `${data.date_from}T00:00:00-03:00`);
    if (data.date_to)
      totalsQ = totalsQ.lte("sale_date", `${data.date_to}T23:59:59-03:00`);
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      totalsQ = totalsQ.or(
        `transaction_code.ilike.%${s}%,buyer_name.ilike.%${s}%,buyer_email.ilike.%${s}%,product_name.ilike.%${s}%`,
      );
    }
    const { data: aggRows, error: aggErr } = await totalsQ;
    if (aggErr) throw new Error(aggErr.message);

    let totalCount = 0;
    let totalCommission = 0;
    let totalGross = 0;
    let totalNet = 0;
    let principalQty = 0;
    let orderbumpQty = 0;
    for (const r of aggRows ?? []) {
      totalCount += 1;
      totalCommission += Number(r.commission_value ?? 0);
      totalGross += Number(r.gross_value ?? 0);
      totalNet += Number(r.net_value ?? 0);
      const k = String(r.kind ?? "").toLowerCase();
      if (k === "principal" || k === "main") principalQty += 1;
      else if (k === "orderbump" || k === "order_bump" || k === "bump")
        orderbumpQty += 1;
    }

    return {
      rows: (rows ?? []) as SaleRow[],
      total: count ?? 0,
      page: data.page,
      page_size: data.page_size,
      totals: {
        count: totalCount,
        commission: totalCommission,
        gross: totalGross,
        net: totalNet,
        principal_qty: principalQty,
        orderbump_qty: orderbumpQty,
      },
    };
  });
