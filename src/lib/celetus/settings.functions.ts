import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompany } from "@/lib/celetus/workspaces";

type SupabaseClient = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

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
    const userId = resolveCompany(data.company_slug).userId;
    const selected = currentYearMonth();
    const year = data.year ?? selected.year;
    const month = data.month ?? selected.month;

    const { data: settings, error } = await fromUntyped(supabase, "monthly_tax_settings")
      .select("year, month, investment_tax_rate, revenue_tax_rate")
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
      })
      .select("year, month, investment_tax_rate, revenue_tax_rate")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    return {
      year: ins.data.year,
      month: ins.data.month,
      tax_rate: Number(ins.data.investment_tax_rate),
      revenue_tax_rate: Number(ins.data.revenue_tax_rate),
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
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = resolveCompany(data.company_slug).userId;
    const { error: monthlyError } = await fromUntyped(supabase, "monthly_tax_settings").upsert(
      {
        user_id: userId,
        year: data.year,
        month: data.month,
        investment_tax_rate: data.tax_rate,
        revenue_tax_rate: data.revenue_tax_rate,
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

export const getWebhookConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = resolveCompany(data.company_slug).userId;
    const { data: config } = await supabase
      .from("webhook_config")
      .select("webhook_secret")
      .eq("user_id", userId)
      .maybeSingle();
    if (config) return config;
    const ins = await supabase
      .from("webhook_config")
      .insert({ user_id: userId })
      .select("webhook_secret")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    return ins.data;
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
    const userId = resolveCompany(data.company_slug).userId;
    const secret = data.webhook_secret.trim();
    const { error } = await supabase
      .from("webhook_config")
      .upsert({ user_id: userId, webhook_secret: secret }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { webhook_secret: secret };
  });

export const rotateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = resolveCompany(data.company_slug).userId;
    // Generate via crypto
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const secret = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { error } = await supabase
      .from("webhook_config")
      .upsert({ user_id: userId, webhook_secret: secret }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { webhook_secret: secret };
  });
