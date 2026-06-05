import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugifyName, TEMPORARY_PUBLIC_USER_ID } from "@/lib/celetus/workspaces";

export type CompanySummary = {
  id: string;
  slug: string;
  name: string;
  webhook_secret: string;
  created_at: string;
};

function getOwnerId(context: { userId?: string | null }): string {
  return context.userId || TEMPORARY_PUBLIC_USER_ID;
}

export const listMyCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownerId = getOwnerId(context);
    const { data, error } = await supabaseAdmin
      .from("companies")
      .select("id, slug, name, webhook_secret, created_at")
      .eq("owner_user_id", ownerId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as CompanySummary[];
  });

export const getCompanyBySlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ slug: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownerId = getOwnerId(context);
    const { data: row, error } = await supabaseAdmin
      .from("companies")
      .select("id, slug, name, webhook_secret, created_at")
      .eq("owner_user_id", ownerId)
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as CompanySummary | null) ?? null;
  });

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(80),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownerId = getOwnerId(context);
    const baseSlug = slugifyName(data.name);

    // Find a unique slug for this owner.
    let slug = baseSlug;
    let attempt = 1;
    // Try up to 50 variants.
    while (attempt < 50) {
      const { data: existing } = await supabaseAdmin
        .from("companies")
        .select("id")
        .eq("owner_user_id", ownerId)
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    const { data: row, error } = await supabaseAdmin
      .from("companies")
      .insert({
        owner_user_id: ownerId,
        slug,
        name: data.name.trim(),
      })
      .select("id, slug, name, webhook_secret, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as CompanySummary;
  });
