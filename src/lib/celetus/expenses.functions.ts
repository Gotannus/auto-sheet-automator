import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyId } from "@/lib/celetus/companies-resolve";

function fromUntyped(supabase: unknown, table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from(table);
}

export type ExpenseItem = {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  amount: number;
  notes: string | null;
};

export type ExpensesResult = {
  year: number;
  month: number;
  items: ExpenseItem[];
  total: number;
  by_category: { category: string; total: number }[];
};

const PeriodInput = z.object({
  company_slug: z.string().optional(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PeriodInput.parse(input))
  .handler(async ({ data, context }): Promise<ExpensesResult> => {
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const { data: rows, error } = await fromUntyped(context.supabase, "monthly_expenses_items")
      .select("id, date, description, category, amount, notes")
      .eq("user_id", userId)
      .eq("year", data.year)
      .eq("month", data.month)
      .order("date", { ascending: true });
    if (error) throw new Error(error.message);

    const items: ExpenseItem[] = (rows ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => ({
        id: r.id,
        date: r.date,
        description: r.description,
        category: r.category ?? "Outros",
        amount: Number(r.amount ?? 0),
        notes: r.notes ?? null,
      }),
    );

    const total = items.reduce((s, i) => s + i.amount, 0);
    const catMap = new Map<string, number>();
    for (const i of items) catMap.set(i.category, (catMap.get(i.category) ?? 0) + i.amount);
    const by_category = Array.from(catMap.entries())
      .map(([category, t]) => ({ category, total: t }))
      .sort((a, b) => b.total - a.total);

    return { year: data.year, month: data.month, items, total, by_category };
  });

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        year: z.number().int().min(2000).max(2100),
        month: z.number().int().min(1).max(12),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().trim().min(1).max(255),
        category: z.string().trim().min(1).max(60),
        amount: z.number().min(0),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const { error } = await fromUntyped(context.supabase, "monthly_expenses_items").insert({
      user_id: userId,
      year: data.year,
      month: data.month,
      date: data.date,
      description: data.description,
      category: data.category,
      amount: data.amount,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        id: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        description: z.string().trim().min(1).max(255),
        category: z.string().trim().min(1).max(60),
        amount: z.number().min(0),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const { error } = await fromUntyped(context.supabase, "monthly_expenses_items")
      .update({
        date: data.date,
        description: data.description,
        category: data.category,
        amount: data.amount,
        notes: data.notes ?? null,
      })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteExpense = createServerFn({ method: "POST" })
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
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const { error } = await fromUntyped(context.supabase, "monthly_expenses_items")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
