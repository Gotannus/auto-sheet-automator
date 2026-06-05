import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyId } from "@/lib/celetus/companies-resolve";

type SupabaseClient = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

const SETTINGS_SELECT =
  "year, month, investment_tax_rate, revenue_tax_rate, monthly_expenses, company_cash_rate, partner_1_name, partner_1_rate, partner_2_name, partner_2_rate";
const EXPENSE_SELECT = "id, year, month, description, category, amount, expense_date, created_at";

const CompanyInput = z.object({
  company_slug: z.string().optional(),
  year: z.number().int().min(2000).max(2100).optional(),
  month: z.number().int().min(1).max(12).optional(),
});

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function fromUntyped(supabase: unknown, table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from(table);
}

function normalizeExpense(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    year: Number(row.year),
    month: Number(row.month),
    description: String(row.description ?? ""),
    category: String(row.category ?? "Geral"),
    amount: Number(row.amount ?? 0),
    expense_date: row.expense_date ? String(row.expense_date) : null,
    created_at: String(row.created_at ?? ""),
  };
}

async function getLegacyInvestmentTaxRate(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("monthly_settings")
    .select("tax_rate")
    .eq("user_id", userId)
    .maybeSingle();

  return Number(data?.tax_rate ?? 0.1215);
}

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const selected = currentYearMonth();
    const year = data.year ?? selected.year;
    const month = data.month ?? selected.month;

    const { data: settings, error } = await fromUntyped(supabase, "monthly_tax_settings")
      .select(SETTINGS_SELECT)
      .eq("user_id", userId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (settings) {
      return {
        year: settings.year,
        month: settings.month,
        tax_rate: Number(settings.investment_tax_rate),
        revenue_tax_rate: Number(settings.revenue_tax_rate),
        monthly_expenses: Number(settings.monthly_expenses ?? 0),
        company_cash_rate: Number(settings.company_cash_rate ?? 0.1),
        partner_1_name: String(settings.partner_1_name ?? "Rodrigo"),
        partner_1_rate: Number(settings.partner_1_rate ?? 0.35),
        partner_2_name: String(settings.partner_2_name ?? "Marcos"),
        partner_2_rate: Number(settings.partner_2_rate ?? 0.65),
      };
    }

    const legacyTaxRate = await getLegacyInvestmentTaxRate(supabase, userId);
    const ins = await fromUntyped(supabase, "monthly_tax_settings")
      .insert({
        user_id: userId,
        year,
        month,
        investment_tax_rate: legacyTaxRate,
        revenue_tax_rate: 0,
        monthly_expenses: 0,
        company_cash_rate: 0.1,
        partner_1_name: "Rodrigo",
        partner_1_rate: 0.35,
        partner_2_name: "Marcos",
        partner_2_rate: 0.65,
      })
      .select(SETTINGS_SELECT)
      .single();
    if (ins.error) throw new Error(ins.error.message);
    return {
      year: ins.data.year,
      month: ins.data.month,
      tax_rate: Number(ins.data.investment_tax_rate),
      revenue_tax_rate: Number(ins.data.revenue_tax_rate),
      monthly_expenses: Number(ins.data.monthly_expenses ?? 0),
      company_cash_rate: Number(ins.data.company_cash_rate ?? 0.1),
      partner_1_name: String(ins.data.partner_1_name ?? "Rodrigo"),
      partner_1_rate: Number(ins.data.partner_1_rate ?? 0.35),
      partner_2_name: String(ins.data.partner_2_name ?? "Marcos"),
      partner_2_rate: Number(ins.data.partner_2_rate ?? 0.65),
    };
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12),
        tax_rate: z.number().min(0).max(1),
        revenue_tax_rate: z.number().min(0).max(1),
        monthly_expenses: z.number().min(0),
        company_cash_rate: z.number().min(0).max(1),
        partner_1_name: z.string().trim().min(1).max(80),
        partner_1_rate: z.number().min(0).max(1),
        partner_2_name: z.string().trim().min(1).max(80),
        partner_2_rate: z.number().min(0).max(1),
      })
      .superRefine((value, ctx) => {
        const partnerTotal = value.partner_1_rate + value.partner_2_rate;
        if (Math.abs(partnerTotal - 1) > 0.0001) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["partner_2_rate"],
            message: "A soma dos percentuais dos socios precisa ser 100%.",
          });
        }
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const { error: monthlyError } = await fromUntyped(supabase, "monthly_tax_settings").upsert(
      {
        user_id: userId,
        year: data.year,
        month: data.month,
        investment_tax_rate: data.tax_rate,
        revenue_tax_rate: data.revenue_tax_rate,
        monthly_expenses: data.monthly_expenses,
        company_cash_rate: data.company_cash_rate,
        partner_1_name: data.partner_1_name.trim(),
        partner_1_rate: data.partner_1_rate,
        partner_2_name: data.partner_2_name.trim(),
        partner_2_rate: data.partner_2_rate,
      },
      { onConflict: "user_id,year,month" },
    );
    if (monthlyError) throw new Error(monthlyError.message);

    const { error: legacyError } = await supabase
      .from("monthly_settings")
      .upsert(
        { user_id: userId, year: data.year, tax_rate: data.tax_rate },
        { onConflict: "user_id" },
      );
    if (legacyError) throw new Error(legacyError.message);

    return { ok: true };
  });

export const listMonthlyExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    CompanyInput.required({ year: true, month: true }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const { data: rows, error } = await fromUntyped(supabase, "monthly_expenses")
      .select(EXPENSE_SELECT)
      .eq("user_id", userId)
      .eq("year", data.year)
      .eq("month", data.month)
      .order("expense_date", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Record<string, unknown>[]).map(normalizeExpense);
  });

export const addMonthlyExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12),
        description: z.string().trim().min(1).max(140),
        category: z.string().trim().max(60).optional(),
        amount: z.number().min(0.01),
        expense_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
      })
      .superRefine((value, ctx) => {
        const prefix = `${value.year}-${String(value.month).padStart(2, "0")}-`;
        if (value.expense_date && !value.expense_date.startsWith(prefix)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["expense_date"],
            message: "A data da despesa precisa estar no mes selecionado.",
          });
        }
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const { data: row, error } = await fromUntyped(supabase, "monthly_expenses")
      .insert({
        user_id: userId,
        year: data.year,
        month: data.month,
        description: data.description.trim(),
        category: data.category?.trim() || "Geral",
        amount: data.amount,
        expense_date: data.expense_date ?? null,
      })
      .select(EXPENSE_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return normalizeExpense(row as Record<string, unknown>);
  });

export const deleteMonthlyExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const { error } = await fromUntyped(supabase, "monthly_expenses")
      .delete()
      .eq("user_id", userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getWebhookConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const companyId = await resolveCompanyId(context.supabase, data.company_slug);
    const { data: row, error } = await supabase
      .from("companies")
      .select("webhook_secret")
      .eq("id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { webhook_secret: row?.webhook_secret ?? "" };
  });

export const updateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        webhook_secret: z.string().trim().min(6).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const companyId = await resolveCompanyId(context.supabase, data.company_slug);
    const secret = data.webhook_secret.trim();
    const { error } = await supabase
      .from("companies")
      .update({ webhook_secret: secret })
      .eq("id", companyId);
    if (error) throw new Error(error.message);
    return { webhook_secret: secret };
  });

export const rotateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const companyId = await resolveCompanyId(context.supabase, data.company_slug);
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const secret = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { error } = await supabase
      .from("companies")
      .update({ webhook_secret: secret })
      .eq("id", companyId);
    if (error) throw new Error(error.message);
    return { webhook_secret: secret };
  });
