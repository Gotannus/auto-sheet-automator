import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { computeDailySummary } from "@/lib/celetus/dashboard.functions";

// API usada pelo Hermes (agente no PC) para conversar com o sistema.
// Autenticação: header `x-hermes-secret` (ou `Authorization: Bearer ...`) com o
// segredo do Hermes da empresa (companies.hermes_secret).
//
//   GET  /api/public/hermes/ping
//   GET  /api/public/hermes/jobs/next           pega o próximo pedido da fila (204 se vazia)
//   GET  /api/public/hermes/jobs/:id
//   POST /api/public/hermes/jobs/:id/progress   { message }
//   POST /api/public/hermes/jobs/:id/result     { result, celetus_prompt }
//   POST /api/public/hermes/jobs/:id/error      { message }
//   GET  /api/public/hermes/jobs/approved/next  próximo pedido aprovado para cadastrar (204 se nenhum)
//   POST /api/public/hermes/jobs/:id/registered      { checkout_url }  -> cadastrado
//   POST /api/public/hermes/jobs/:id/register-failed { message }       -> volta a aguardando_cadastro
//   GET  /api/public/hermes/metrics?days=14
//   POST /api/public/hermes/reports             { title, body_markdown, product_id? }

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];
type Company = { id: string; slug: string; name: string };

const JOB_COLUMNS =
  "id, status, briefing, src, product_id, progress, result, celetus_prompt, checkout_url, error_message, created_at, updated_at";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

async function authenticate(request: Request) {
  const secret =
    request.headers.get("x-hermes-secret") ||
    request.headers.get("authorization")?.replace(/^Bearer /i, "") ||
    "";
  if (!secret || secret.length < 16) return { error: json({ error: "missing secret" }, 401) };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("hermes_secret", secret)
    .maybeSingle();
  if (error) return { error: json({ error: error.message }, 500) };
  if (!data) return { error: json({ error: "invalid secret" }, 401) };
  return { admin: supabaseAdmin, company: data as Company };
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function todaySP(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

type ProgressItem = { at: string; message: string };

async function loadJob(admin: Admin, companyId: string, id: string) {
  const { data, error } = await admin
    .from("product_jobs")
    .select(JOB_COLUMNS)
    .eq("id", id)
    .eq("user_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as
    | (Record<string, unknown> & { status: string; progress: ProgressItem[] | null })
    | null;
}

function appendProgress(prev: ProgressItem[] | null, message: string): ProgressItem[] {
  const list = Array.isArray(prev) ? prev : [];
  return [...list, { at: new Date().toISOString(), message: message.slice(0, 500) }].slice(-200);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ProgressBody = z.object({ message: z.string().trim().min(1).max(500) });
const ResultBody = z.object({
  result: z.record(z.string(), z.unknown()),
  celetus_prompt: z.string().max(20000).optional().nullable(),
});
const ErrorBody = z.object({ message: z.string().trim().min(1).max(2000) });
const RegisteredBody = z.object({
  checkout_url: z.string().trim().url().max(500).refine((v) => /^https?:\/\//i.test(v)),
});
const ReportBody = z.object({
  title: z.string().trim().min(1).max(200),
  body_markdown: z.string().max(50000),
  product_id: z.string().uuid().optional().nullable(),
});

async function handle(request: Request, splat: string): Promise<Response> {
  const auth = await authenticate(request);
  if ("error" in auth) return auth.error as Response;
  const { admin, company } = auth;
  const parts = splat.split("/").filter(Boolean);
  const method = request.method.toUpperCase();

  try {
    // ping
    if (method === "GET" && parts.length === 1 && parts[0] === "ping") {
      return json({ ok: true, company: { slug: company.slug, name: company.name } });
    }

    // jobs/next
    if (method === "GET" && parts[0] === "jobs" && parts[1] === "next" && parts.length === 2) {
      const { data, error } = await admin.rpc("claim_next_product_job", {
        _company_id: company.id,
      });
      if (error) throw new Error(error.message);
      const job = Array.isArray(data) ? data[0] : null;
      if (!job) return new Response(null, { status: 204 });
      return json({ id: job.id, src: job.src, briefing: job.briefing, product_id: job.product_id });
    }

    // jobs/approved/next: próximo pedido aprovado para cadastrar na Celetus
    if (
      method === "GET" &&
      parts[0] === "jobs" &&
      parts[1] === "approved" &&
      parts[2] === "next" &&
      parts.length === 3
    ) {
      const { data, error } = await admin.rpc("claim_next_approved_job", {
        _company_id: company.id,
      });
      if (error) throw new Error(error.message);
      const job = Array.isArray(data) ? data[0] : null;
      if (!job) return new Response(null, { status: 204 });
      return json({
        id: job.id,
        src: job.src,
        briefing: job.briefing,
        result: job.result,
        celetus_prompt: job.celetus_prompt,
        product_id: job.product_id,
      });
    }

    // jobs/:id[/action]
    if (parts[0] === "jobs" && parts[1] && UUID.test(parts[1])) {
      const id = parts[1];
      const action = parts[2] ?? "";
      const job = await loadJob(admin, company.id, id);
      if (!job) return json({ error: "job not found" }, 404);

      if (method === "GET" && !action) return json(job);
      if (method !== "POST") return json({ error: "method not allowed" }, 405);
      if (job.status === "cadastrado") {
        return json({ error: "job already registered; nothing to change" }, 409);
      }
      const body = await readBody(request);
      const now = new Date().toISOString();

      if (action === "progress") {
        const p = ProgressBody.safeParse(body);
        if (!p.success) return json({ error: "invalid body", details: p.error.flatten() }, 400);
        const { error } = await admin
          .from("product_jobs")
          .update({ progress: appendProgress(job.progress, p.data.message), updated_at: now } as never)
          .eq("id", id)
          .eq("user_id", company.id);
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }

      if (action === "result") {
        const p = ResultBody.safeParse(body);
        if (!p.success) return json({ error: "invalid body", details: p.error.flatten() }, 400);
        const { error } = await admin
          .from("product_jobs")
          .update({
            status: "aguardando_cadastro",
            result: p.data.result,
            celetus_prompt: p.data.celetus_prompt ?? null,
            error_message: null,
            progress: appendProgress(job.progress, "Produto pronto. Falta cadastrar na Celetus."),
            updated_at: now,
          } as never)
          .eq("id", id)
          .eq("user_id", company.id);
        if (error) throw new Error(error.message);
        return json({ ok: true, status: "aguardando_cadastro" });
      }

      if (action === "error") {
        const p = ErrorBody.safeParse(body);
        if (!p.success) return json({ error: "invalid body", details: p.error.flatten() }, 400);
        const { error } = await admin
          .from("product_jobs")
          .update({
            status: "erro",
            error_message: p.data.message,
            progress: appendProgress(job.progress, "O Hermes encontrou um erro"),
            updated_at: now,
          } as never)
          .eq("id", id)
          .eq("user_id", company.id);
        if (error) throw new Error(error.message);
        return json({ ok: true, status: "erro" });
      }

      if (action === "registered") {
        const p = RegisteredBody.safeParse(body);
        if (!p.success) return json({ error: "invalid body", details: p.error.flatten() }, 400);
        if (job.status !== "cadastrando" && job.status !== "aprovado") {
          return json({ error: `job is ${job.status}, not being registered` }, 409);
        }
        const { error } = await admin
          .from("product_jobs")
          .update({
            status: "cadastrado",
            checkout_url: p.data.checkout_url,
            error_message: null,
            progress: appendProgress(job.progress, "Cadastrado na Celetus pelo Claude"),
            updated_at: now,
          } as never)
          .eq("id", id)
          .eq("user_id", company.id);
        if (error) throw new Error(error.message);
        const result = job.result as Record<string, unknown> | null;
        const nome = typeof result?.nome === "string" ? result.nome.trim() : "";
        if (job.product_id && nome) {
          await admin
            .from("products")
            .update({ display_name: nome.slice(0, 120) } as never)
            .eq("id", String(job.product_id))
            .eq("user_id", company.id);
        }
        return json({ ok: true, status: "cadastrado" });
      }

      if (action === "register-failed") {
        const p = ErrorBody.safeParse(body);
        if (!p.success) return json({ error: "invalid body", details: p.error.flatten() }, 400);
        const { error } = await admin
          .from("product_jobs")
          .update({
            status: "aguardando_cadastro",
            error_message: p.data.message,
            progress: appendProgress(job.progress, "O cadastro automático falhou"),
            updated_at: now,
          } as never)
          .eq("id", id)
          .eq("user_id", company.id);
        if (error) throw new Error(error.message);
        return json({ ok: true, status: "aguardando_cadastro" });
      }

      return json({ error: "unknown action" }, 404);
    }

    // metrics
    if (method === "GET" && parts.length === 1 && parts[0] === "metrics") {
      const url = new URL(request.url);
      const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 14) || 14));
      const to = todaySP();
      const from = shiftDate(to, -(days - 1));
      const recentFrom = shiftDate(to, -2);

      const [period, recent, productsRes, jobsRes] = await Promise.all([
        computeDailySummary(admin, company.id, { from, to }),
        computeDailySummary(admin, company.id, { from: recentFrom, to }),
        admin
          .from("products")
          .select("id, name, display_name, src, is_active, pinned_month, created_at")
          .eq("user_id", company.id)
          .not("name", "ilike", "sem-src-%"),
        admin
          .from("product_jobs")
          .select("product_id, status, created_at, checkout_url")
          .eq("user_id", company.id)
          .not("product_id", "is", null),
      ]);
      if (productsRes.error) throw new Error(productsRes.error.message);
      if (jobsRes.error) throw new Error(jobsRes.error.message);

      const periodBy = new Map(period.by_product.map((r) => [r.product_id, r]));
      const recentBy = new Map(recent.by_product.map((r) => [r.product_id, r]));
      const jobBy = new Map(
        (jobsRes.data ?? []).map((j) => [String(j.product_id), j]),
      );
      const curMonth = to.slice(0, 7);

      const products = (productsRes.data ?? [])
        .filter(
          (p) => p.is_active || p.pinned_month === curMonth || periodBy.has(p.id),
        )
        .map((p) => {
          const job = jobBy.get(p.id);
          return {
            id: p.id,
            name: p.display_name || p.name,
            src: p.src,
            is_active: p.is_active,
            pinned_this_month: p.pinned_month === curMonth,
            created_at: p.created_at,
            created_by_hermes: Boolean(job),
            job_status: job?.status ?? null,
            checkout_url: job?.checkout_url ?? null,
            period: periodBy.get(p.id) ?? null,
            last_3_days: recentBy.get(p.id) ?? null,
          };
        });

      return json({
        company: { slug: company.slug, name: company.name },
        generated_at: new Date().toISOString(),
        period: { from, to, days, totals: period.totals },
        last_3_days: { from: recentFrom, to, totals: recent.totals },
        notes:
          "revenue = comissão do produtor (principal + orderbumps). invest_final = investimento manual + imposto sobre investimento. cpa e roi usam invest_final, iguais ao dashboard.",
        products,
      });
    }

    // reports
    if (method === "POST" && parts.length === 1 && parts[0] === "reports") {
      const p = ReportBody.safeParse(await readBody(request));
      if (!p.success) return json({ error: "invalid body", details: p.error.flatten() }, 400);
      if (p.data.product_id) {
        const { data: prod } = await admin
          .from("products")
          .select("id")
          .eq("id", p.data.product_id)
          .eq("user_id", company.id)
          .maybeSingle();
        if (!prod) return json({ error: "product not found" }, 404);
      }
      const { data, error } = await admin
        .from("hermes_reports")
        .insert({
          user_id: company.id,
          product_id: p.data.product_id ?? null,
          title: p.data.title,
          body_markdown: p.data.body_markdown,
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return json({ ok: true, id: (data as { id: string }).id });
    }

    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
}

export const Route = createFileRoute("/api/public/hermes/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handle(request, params._splat ?? ""),
      POST: async ({ request, params }) => handle(request, params._splat ?? ""),
    },
  },
});
