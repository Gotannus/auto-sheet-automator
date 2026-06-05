import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("monthly_settings")
      .select("year, tax_rate")
      .maybeSingle();
    if (data) return data;
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
        year: z.number().int().min(2000).max(2100),
        tax_rate: z.number().min(0).max(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
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
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("webhook_config")
      .select("webhook_secret")
      .maybeSingle();
    if (data) return data;
    const ins = await supabase
      .from("webhook_config")
      .insert({ user_id: userId })
      .select("webhook_secret")
      .single();
    if (ins.error) throw new Error(ins.error.message);
    return ins.data;
  });

export const rotateWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Generate via crypto
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const secret = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { error } = await supabase
      .from("webhook_config")
      .upsert(
        { user_id: userId, webhook_secret: secret },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    return { webhook_secret: secret };
  });
