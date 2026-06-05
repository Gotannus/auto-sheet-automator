// Resolves a company slug to its UUID for users with access to it.
// Relies on RLS — the authenticated supabase client from `requireSupabaseAuth`
// only returns companies where the user is owner OR a member.
export async function resolveCompanyId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  slug: string | undefined | null,
): Promise<string> {
  if (!slug) throw new Error("company_slug is required");
  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Empresa não encontrada ou sem acesso: ${slug}`);
  return data.id as string;
}
