import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompanyId } from "@/lib/celetus/companies-resolve";
import { currentMonthSP } from "@/lib/celetus/products.functions";

export type ProductJobStatus =
  | "na_fila"
  | "criando"
  | "aguardando_cadastro"
  | "aprovado"
  | "cadastrando"
  | "cadastrado"
  | "erro";

export type ProductJobBriefing = {
  tipo: string;
  tema: string;
  publico?: string;
  preco_alvo?: string;
  observacoes?: string;
};

export type ProductJobProgress = { at: string; message: string };

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ProductJob = {
  id: string;
  status: ProductJobStatus;
  briefing: ProductJobBriefing;
  src: string;
  product_id: string | null;
  progress: ProductJobProgress[];
  result: { [key: string]: JsonValue } | null;
  celetus_prompt: string | null;
  checkout_url: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export const PRODUCT_TYPES = [
  "Molde de feltro",
  "Costura",
  "Crochê",
  "Livro emocional",
  "Outro",
] as const;

const JOB_COLUMNS =
  "id, status, briefing, src, product_id, progress, result, celetus_prompt, checkout_url, error_message, created_at, updated_at";

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

function randomSuffix(len = 4): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const CompanyInput = z.object({ company_slug: z.string().optional() });

export const listProductJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    CompanyInput.extend({ include_done: z.boolean().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const companyId = await resolveCompanyId(context.supabase, data.company_slug);
    let q = context.supabase
      .from("product_jobs")
      .select(JOB_COLUMNS)
      .eq("user_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!data.include_done) q = q.neq("status", "cadastrado");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ProductJob[];
  });

export const getProductJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    CompanyInput.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const companyId = await resolveCompanyId(context.supabase, data.company_slug);
    const { data: row, error } = await context.supabase
      .from("product_jobs")
      .select(JOB_COLUMNS)
      .eq("id", data.id)
      .eq("user_id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Pedido não encontrado");
    return row as unknown as ProductJob;
  });

export const createProductJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    CompanyInput.extend({
      tipo: z.string().min(1).max(60),
      tema: z.string().min(2).max(120),
      publico: z.string().max(200).optional(),
      preco_alvo: z.string().max(60).optional(),
      observacoes: z.string().max(2000).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const companyId = await resolveCompanyId(supabase, data.company_slug);

    // SRC único dentro da empresa (o webhook compara sem diferenciar maiúsculas).
    const base = slugify(data.tema) || "produto";
    let src = "";
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = `${base}-${randomSuffix()}`;
      const { data: existing, error } = await supabase
        .from("products")
        .select("id")
        .eq("user_id", companyId)
        .ilike("src", candidate)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!existing) {
        src = candidate;
        break;
      }
    }
    if (!src) throw new Error("Não foi possível gerar um SRC único. Tente de novo.");

    const tema = data.tema.trim();
    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        user_id: companyId,
        name: tema,
        src,
        is_active: true,
        pinned_month: currentMonthSP(),
      } as never)
      .select("id")
      .single();
    if (productError) throw new Error(productError.message);

    const briefing: ProductJobBriefing = {
      tipo: data.tipo,
      tema,
      publico: data.publico?.trim() || undefined,
      preco_alvo: data.preco_alvo?.trim() || undefined,
      observacoes: data.observacoes?.trim() || undefined,
    };

    const { data: job, error: jobError } = await supabase
      .from("product_jobs")
      .insert({
        user_id: companyId,
        status: "na_fila",
        briefing,
        src,
        product_id: (product as { id: string }).id,
        progress: [{ at: new Date().toISOString(), message: "Pedido criado e enviado para a fila do Hermes" }],
      } as never)
      .select("id")
      .single();
    if (jobError) {
      // Sem pedido, não deixa um produto órfão para trás.
      await supabase.from("products").delete().eq("id", (product as { id: string }).id);
      throw new Error(jobError.message);
    }
    return { id: (job as { id: string }).id, src };
  });

export const markProductJobRegistered = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    CompanyInput.extend({
      id: z.string().uuid(),
      checkout_url: z.string().url().max(500),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const companyId = await resolveCompanyId(supabase, data.company_slug);
    const { data: job, error } = await supabase
      .from("product_jobs")
      .select("id, product_id, result, progress")
      .eq("id", data.id)
      .eq("user_id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Pedido não encontrado");

    const j = job as unknown as {
      product_id: string | null;
      result: Record<string, unknown> | null;
      progress: ProductJobProgress[] | null;
    };
    const progress = [
      ...(Array.isArray(j.progress) ? j.progress : []),
      { at: new Date().toISOString(), message: "Cadastrado na Celetus" },
    ];
    const { error: updError } = await supabase
      .from("product_jobs")
      .update({
        status: "cadastrado",
        checkout_url: data.checkout_url,
        progress,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id)
      .eq("user_id", companyId);
    if (updError) throw new Error(updError.message);

    const nome = typeof j.result?.nome === "string" ? j.result.nome.trim() : "";
    if (j.product_id && nome) {
      await supabase
        .from("products")
        .update({ display_name: nome.slice(0, 120) } as never)
        .eq("id", j.product_id)
        .eq("user_id", companyId);
    }
    return { ok: true };
  });

// Usuário aprova: a ponte no PC pega o pedido e chama o Claude para cadastrar na Celetus.
export const approveProductJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyInput.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const companyId = await resolveCompanyId(supabase, data.company_slug);
    const { data: job, error } = await supabase
      .from("product_jobs")
      .select("status, progress, celetus_prompt")
      .eq("id", data.id)
      .eq("user_id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Pedido não encontrado");
    const j = job as unknown as {
      status: ProductJobStatus;
      progress: ProductJobProgress[] | null;
      celetus_prompt: string | null;
    };
    if (j.status !== "aguardando_cadastro") {
      throw new Error("Este pedido não está esperando cadastro.");
    }
    if (!j.celetus_prompt) throw new Error("O Hermes não mandou o prompt de cadastro.");
    const progress = [
      ...(Array.isArray(j.progress) ? j.progress : []),
      { at: new Date().toISOString(), message: "Cadastro aprovado. Esperando a ponte chamar o Claude." },
    ];
    const { error: updError } = await supabase
      .from("product_jobs")
      .update({
        status: "aprovado",
        error_message: null,
        progress,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id)
      .eq("user_id", companyId)
      .eq("status", "aguardando_cadastro");
    if (updError) throw new Error(updError.message);
    return { ok: true };
  });

export const retryProductJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => CompanyInput.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const companyId = await resolveCompanyId(supabase, data.company_slug);
    const { data: job, error } = await supabase
      .from("product_jobs")
      .select("progress")
      .eq("id", data.id)
      .eq("user_id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Pedido não encontrado");
    const prev = (job as unknown as { progress: ProductJobProgress[] | null }).progress;
    const progress = [
      ...(Array.isArray(prev) ? prev : []),
      { at: new Date().toISOString(), message: "Reenviado para a fila" },
    ];
    const { error: updError } = await supabase
      .from("product_jobs")
      .update({
        status: "na_fila",
        error_message: null,
        progress,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id)
      .eq("user_id", companyId);
    if (updError) throw new Error(updError.message);
    return { ok: true };
  });
