import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyId } from "@/lib/celetus/companies-resolve";

export type Product = {
  id: string;
  name: string;
  display_name: string | null;
  src: string;
  is_active: boolean;
  created_at: string;
};


const CompanyInput = z.object({
  company_slug: z.string().optional(),
});

export const listProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const { data: rows, error } = await supabase
      .from("products")
      .select("id, name, display_name, src, is_active, created_at")
      .eq("user_id", userId)
      .not("name", "ilike", "sem-src-%")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Product[];
  });


export const createProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        name: z.string().min(1).max(120),
        src: z.string().min(1).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const { data: row, error } = await supabase
      .from("products")
      .insert({ user_id: userId, name: data.name, src: data.src.trim() })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        id: z.string().uuid(),
        name: z.string().min(1).max(120),
        src: z.string().min(1).max(120),
        display_name: z.string().max(120).nullable().optional(),
        is_active: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const patch: Record<string, unknown> = { name: data.name, src: data.src.trim() };
    if (data.display_name !== undefined) {
      const v = data.display_name?.trim() ?? "";
      patch.display_name = v.length > 0 ? v : null;
    }
    if (data.is_active !== undefined) patch.is_active = data.is_active;
    const { error } = await supabase
      .from("products")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setProductActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        id: z.string().uuid(),
        is_active: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const { error } = await supabase
      .from("products")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ is_active: data.is_active } as any)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_slug: z.string().optional(), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = await resolveCompanyId(context.supabase, data.company_slug);
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
