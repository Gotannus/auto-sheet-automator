import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompany } from "@/lib/celetus/workspaces";

export type Product = {
  id: string;
  name: string;
  src: string;
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
    const userId = resolveCompany(data.company_slug).userId;
    const { data: rows, error } = await supabase
      .from("products")
      .select("id, name, src, created_at")
      .eq("user_id", userId)
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
    const userId = resolveCompany(data.company_slug).userId;
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
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = resolveCompany(data.company_slug).userId;
    const { error } = await supabase
      .from("products")
      .update({ name: data.name, src: data.src.trim() })
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
    const userId = resolveCompany(data.company_slug).userId;
    const { error } = await supabase
      .from("products")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
