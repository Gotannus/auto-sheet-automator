import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyId } from "@/lib/celetus/companies-resolve";

export type Partner = {
  id: string;
  name: string;
  share_pct: number;
  sort_order: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const t = (supabase: unknown) => (supabase as any).from("company_partners");

export const listPartners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ company_slug: z.string() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<Partner[]> => {
    const companyId = await resolveCompanyId(context.supabase, data.company_slug);
    const { data: rows, error } = await t(context.supabase)
      .select("id, name, share_pct, sort_order")
      .eq("company_id", companyId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows ?? []).map((r: any) => ({
      id: String(r.id),
      name: String(r.name),
      share_pct: Number(r.share_pct),
      sort_order: Number(r.sort_order),
    }));
  });

export const savePartners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string(),
        partners: z.array(
          z.object({
            id: z.string().uuid().optional(),
            name: z.string().min(1),
            share_pct: z.number().min(0).max(100),
            sort_order: z.number().int().min(0),
          }),
        ),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const companyId = await resolveCompanyId(supabase, data.company_slug);
    const table = t(supabase);

    const { data: existing, error: exErr } = await table
      .select("id")
      .eq("company_id", companyId);
    if (exErr) throw new Error(exErr.message);

    const keepIds = new Set(data.partners.map((p) => p.id).filter(Boolean) as string[]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toDelete = (existing ?? []).map((r: any) => String(r.id)).filter((id: string) => !keepIds.has(id));
    if (toDelete.length > 0) {
      const { error: dErr } = await table.delete().in("id", toDelete);
      if (dErr) throw new Error(dErr.message);
    }

    for (const p of data.partners) {
      if (p.id) {
        const { error } = await table
          .update({ name: p.name, share_pct: p.share_pct, sort_order: p.sort_order })
          .eq("id", p.id)
          .eq("company_id", companyId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await table.insert({
          company_id: companyId,
          name: p.name,
          share_pct: p.share_pct,
          sort_order: p.sort_order,
        });
        if (error) throw new Error(error.message);
      }
    }
    return { ok: true };
  });
