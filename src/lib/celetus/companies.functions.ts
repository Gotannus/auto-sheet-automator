import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugifyName } from "@/lib/celetus/workspaces";

export type CompanySummary = {
  id: string;
  slug: string;
  name: string;
  webhook_secret: string;
  created_at: string;
  is_owner: boolean;
};

export type CompanyMember = {
  id: string;
  user_id: string;
  email: string | null;
  role: string;
  created_at: string;
};

export const listMyCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("companies")
      .select("id, slug, name, webhook_secret, created_at, owner_user_id")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((c: { id: string; slug: string; name: string; webhook_secret: string; created_at: string; owner_user_id: string }) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      webhook_secret: c.webhook_secret,
      created_at: c.created_at,
      is_owner: c.owner_user_id === userId,
    })) as CompanySummary[];
  });

export const getCompanyBySlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ slug: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("companies")
      .select("id, slug, name, webhook_secret, created_at, owner_user_id")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      webhook_secret: row.webhook_secret,
      created_at: row.created_at,
      is_owner: row.owner_user_id === userId,
    } as CompanySummary;
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
    const ownerId = context.userId!;
    const baseSlug = slugifyName(data.name);

    let slug = baseSlug;
    let attempt = 1;
    while (attempt < 50) {
      const { data: existing } = await supabaseAdmin
        .from("companies")
        .select("id")
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
    return { ...row, is_owner: true } as CompanySummary;
  });

// ---- Members management (owner only) ----

async function assertOwner(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  companyId: string,
  userId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("owner_user_id")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.owner_user_id !== userId) {
    throw new Error("Apenas o dono da empresa pode gerenciar sócios.");
  }
}

export const listCompanyMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_slug: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownerId = context.userId!;
    const { data: company, error: cErr } = await supabaseAdmin
      .from("companies")
      .select("id, owner_user_id")
      .eq("slug", data.company_slug)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!company || company.owner_user_id !== ownerId) {
      throw new Error("Apenas o dono pode listar sócios.");
    }
    const { data: rows, error } = await supabaseAdmin
      .from("company_members")
      .select("id, user_id, role, created_at")
      .eq("company_id", company.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    // Fetch emails for each member
    const result: CompanyMember[] = [];
    for (const r of rows ?? []) {
      let email: string | null = null;
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        email = u.user?.email ?? null;
      } catch {
        email = null;
      }
      result.push({ id: r.id, user_id: r.user_id, role: r.role, created_at: r.created_at, email });
    }
    return result;
  });

export const addCompanyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().min(1),
        email: z.string().email().trim().toLowerCase(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownerId = context.userId!;
    const { data: company, error: cErr } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("slug", data.company_slug)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!company) throw new Error("Empresa não encontrada.");
    await assertOwner(supabaseAdmin, company.id, ownerId);

    // Find auth user by email
    const { data: list, error: lErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (lErr) throw new Error(lErr.message);
    const target = list.users.find(
      (u) => (u.email ?? "").toLowerCase() === data.email,
    );
    if (!target) {
      throw new Error(
        `Nenhum usuário cadastrado com o e-mail ${data.email}. Peça para ele criar a conta primeiro.`,
      );
    }
    if (target.id === ownerId) {
      throw new Error("Você já é o dono desta empresa.");
    }

    const { error } = await supabaseAdmin
      .from("company_members")
      .insert({ company_id: company.id, user_id: target.id, role: "member" });
    if (error) {
      if (String(error.message).includes("duplicate")) {
        throw new Error("Esse usuário já é sócio desta empresa.");
      }
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const removeCompanyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().min(1),
        member_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownerId = context.userId!;
    const { data: company, error: cErr } = await supabaseAdmin
      .from("companies")
      .select("id")
      .eq("slug", data.company_slug)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!company) throw new Error("Empresa não encontrada.");
    await assertOwner(supabaseAdmin, company.id, ownerId);

    const { error } = await supabaseAdmin
      .from("company_members")
      .delete()
      .eq("id", data.member_id)
      .eq("company_id", company.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
