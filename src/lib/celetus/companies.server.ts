import { TEMPORARY_PUBLIC_USER_ID } from "@/lib/celetus/workspaces";

// Resolves a company slug to its UUID for the current owner.
// Throws if not found / not owned. Uses supabaseAdmin to bypass RLS — the
// owner check is enforced via owner_user_id.
export async function resolveCompanyId(
  slug: string | undefined | null,
  ownerUserId: string = TEMPORARY_PUBLIC_USER_ID,
): Promise<string> {
  if (!slug) throw new Error("company_slug is required");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Company not found: ${slug}`);
  return data.id as string;
}
