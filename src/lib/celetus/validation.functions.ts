import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyId } from "@/lib/celetus/companies-resolve";
import { computeDailySummary } from "@/lib/celetus/dashboard.functions";

export type Verdict = "escalar" | "testando" | "segurar" | "matar" | "sem_dados";

export type ValidationRules = {
  cpa_max: number;
  min_invest: number;
  roas_target: number;
};

export const DEFAULT_RULES: ValidationRules = { cpa_max: 14, min_invest: 100, roas_target: 1.3 };

export type ValidationDay = { date: string; sales: number; revenue: number; invest: number };

export type ValidationProduct = {
  id: string;
  name: string;
  src: string | null;
  days_since_created: number;
  created_by_hermes: boolean;
  invest: number;
  sales: number;
  revenue: number;
  cpa: number;
  roas: number;
  verdict: Verdict;
  reason: string;
  daily: ValidationDay[];
};

export type ValidationResult = {
  from: string;
  to: string;
  days: number;
  rules: ValidationRules;
  products: ValidationProduct[];
};

export type HermesReport = {
  id: string;
  title: string;
  body_markdown: string;
  product_id: string | null;
  created_at: string;
};

const VERDICT_ORDER: Verdict[] = ["escalar", "testando", "segurar", "matar", "sem_dados"];

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export function decideVerdict(
  m: { invest: number; sales: number; cpa: number; roas: number },
  r: ValidationRules,
): { verdict: Verdict; reason: string } {
  if (m.invest <= 0)
    return { verdict: "sem_dados", reason: "Sem investimento lançado no período." };
  if (m.invest < r.min_invest) {
    return {
      verdict: "testando",
      reason: `Investiu ${brl(m.invest)}. Decide a partir de ${brl(r.min_invest)}.`,
    };
  }
  if (m.sales === 0) return { verdict: "matar", reason: "Passou do mínimo sem nenhuma venda." };
  const limit = r.cpa_max * 1.3;
  if (m.cpa <= r.cpa_max && m.roas >= r.roas_target) {
    return { verdict: "escalar", reason: "CPA dentro do máximo e ROAS acima do alvo." };
  }
  if (m.cpa <= r.cpa_max) {
    return { verdict: "segurar", reason: "CPA bom, mas ROAS abaixo do alvo." };
  }
  if (m.cpa <= limit) {
    return { verdict: "segurar", reason: "CPA até 30% acima do máximo." };
  }
  return { verdict: "matar", reason: "CPA mais de 30% acima do máximo." };
}

function todaySP(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function fromUntyped(supabase: unknown, table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from(table);
}

async function loadRules(supabase: unknown, companyId: string): Promise<ValidationRules> {
  const { data, error } = await fromUntyped(supabase, "validation_settings")
    .select("cpa_max, min_invest, roas_target")
    .eq("user_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return DEFAULT_RULES;
  return {
    cpa_max: Number(data.cpa_max),
    min_invest: Number(data.min_invest),
    roas_target: Number(data.roas_target),
  };
}

const CompanyInput = z.object({ company_slug: z.string() });

export const getValidation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    CompanyInput.extend({ days: z.number().int().min(3).max(60).optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<ValidationResult> => {
    const { supabase } = context;
    const companyId = await resolveCompanyId(supabase, data.company_slug);
    const days = data.days ?? 14;
    const to = todaySP();
    const from = shiftDate(to, -(days - 1));
    const curMonth = to.slice(0, 7);

    const [rules, summary, productsRes, jobsRes] = await Promise.all([
      loadRules(supabase, companyId),
      computeDailySummary(supabase, companyId, { from, to }),
      supabase
        .from("products")
        .select("id, name, display_name, src, is_active, pinned_month, created_at")
        .eq("user_id", companyId)
        .not("name", "ilike", "sem-src-%"),
      supabase.from("product_jobs").select("product_id").eq("user_id", companyId),
    ]);
    if (productsRes.error) throw new Error(productsRes.error.message);
    if (jobsRes.error) throw new Error(jobsRes.error.message);

    type ProductRow = {
      id: string;
      name: string;
      display_name: string | null;
      src: string | null;
      is_active: boolean;
      pinned_month: string | null;
      created_at: string;
    };
    const productRows = (productsRes.data ?? []) as ProductRow[];
    const jobRows = (jobsRes.data ?? []) as Array<{ product_id: string | null }>;
    const hermesIds = new Set(
      jobRows
        .map((j) => j.product_id)
        .filter(Boolean)
        .map(String),
    );
    const byProduct = new Map(summary.by_product.map((r) => [r.product_id, r]));
    const dailyBy = new Map<string, Map<string, ValidationDay>>();
    for (const d of summary.by_product_day) {
      let m = dailyBy.get(d.product_id);
      if (!m) {
        m = new Map();
        dailyBy.set(d.product_id, m);
      }
      m.set(d.date, { date: d.date, sales: d.sales, revenue: d.revenue, invest: d.invest_final });
    }

    const allDates: string[] = [];
    for (let i = 0; i < days; i++) allDates.push(shiftDate(from, i));
    const nowMs = Date.now();

    const products: ValidationProduct[] = productRows
      .filter((p) => p.is_active || p.pinned_month === curMonth || byProduct.has(p.id))
      .map((p): ValidationProduct => {
        const s = byProduct.get(p.id);
        const invest = s?.invest_final ?? 0;
        const sales = s?.sales ?? 0;
        const revenue = s?.revenue ?? 0;
        const cpa = sales > 0 ? invest / sales : 0;
        const roas = invest > 0 ? revenue / invest : 0;
        const { verdict, reason } = decideVerdict({ invest, sales, cpa, roas }, rules);
        const dm = dailyBy.get(p.id);
        return {
          id: p.id,
          name: p.display_name || p.name,
          src: p.src,
          days_since_created: Math.max(
            0,
            Math.floor((nowMs - new Date(p.created_at).getTime()) / 86_400_000),
          ),
          created_by_hermes: hermesIds.has(p.id),
          invest,
          sales,
          revenue,
          cpa,
          roas,
          verdict,
          reason,
          daily: allDates.map((date) => dm?.get(date) ?? { date, sales: 0, revenue: 0, invest: 0 }),
        };
      })
      .sort(
        (a: ValidationProduct, b: ValidationProduct) =>
          VERDICT_ORDER.indexOf(a.verdict) - VERDICT_ORDER.indexOf(b.verdict) ||
          b.invest - a.invest ||
          b.revenue - a.revenue,
      );

    return { from, to, days, rules, products };
  });

export const saveValidationRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    CompanyInput.extend({
      cpa_max: z.number().min(0).max(100000),
      min_invest: z.number().min(0).max(1000000),
      roas_target: z.number().min(0).max(100),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const companyId = await resolveCompanyId(context.supabase, data.company_slug);
    const { error } = await fromUntyped(context.supabase, "validation_settings").upsert(
      {
        user_id: companyId,
        cpa_max: data.cpa_max,
        min_invest: data.min_invest,
        roas_target: data.roas_target,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listHermesReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyInput.parse(input))
  .handler(async ({ data, context }): Promise<HermesReport[]> => {
    const companyId = await resolveCompanyId(context.supabase, data.company_slug);
    const { data: rows, error } = await context.supabase
      .from("hermes_reports")
      .select("id, title, body_markdown, product_id, created_at")
      .eq("user_id", companyId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as HermesReport[];
  });
