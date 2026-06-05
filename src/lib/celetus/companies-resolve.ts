import { TEMPORARY_PUBLIC_USER_ID } from "@/lib/celetus/workspaces";

// Resolves a company slug to its UUID for the current owner.
// Pass the `supabase` client from `requireSupabaseAuth` context.
export async function resolveCompanyId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  slug: string | undefined | null,
  ownerUserId: string = TEMPORARY_PUBLIC_USER_ID,
): Promise<string> {
  if (!slug) throw new Error("company_slug is required");
  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .eq("owner_user_id", ownerUserId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Company not found: ${slug}`);
  return data.id as string;
}
