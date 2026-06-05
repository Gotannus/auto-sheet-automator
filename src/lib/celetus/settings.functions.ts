import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompany } from "@/lib/celetus/workspaces";

const CompanyInput = z.object({
  company_slug: z.string().optional(),
});

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = resolveCompany(data.company_slug).userId;
    const { data: settings } = await supabase
      .from("monthly_settings")
      .select("year, tax_rate")
      .eq("user_id", userId)
      .maybeSingle();
    if (settings) return settings;
    // self-heal: insert default row if trigger didn't fire (e.g. older user)
    const ins = await supabase
      .from("monthly_settings")
      .insert({ user_id: userId })
      .select("year, tax_rate")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    return ins.data;
  });

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        year: z.number().int().min(2000).max(2100),
        tax_rate: z.number().min(0).max(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = resolveCompany(data.company_slug).userId;
    const { error } = await supabase
      .from("monthly_settings")
      .upsert(
        { user_id: userId, year: data.year, tax_rate: data.tax_rate },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
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
