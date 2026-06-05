import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompany } from "@/lib/celetus/workspaces";

export type WebhookEventRow = {
  id: string;
  received_at: string;
  transaction_code: string | null;
  status: string;
  error_message: string | null;
  rows_upserted: number | null;
  rows_ignored: number | null;
  reprocessed_at: string | null;
  payload: Record<string, unknown> | null;
};

export const listWebhookEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        status: z.enum(["all", "ok", "ignored", "error"]).optional().default("all"),
        limit: z.number().int().min(1).max(200).optional().default(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const userId = resolveCompany(data.company_slug).userId;

    let query = supabase
      .from("webhook_events")
      .select(
        "id, received_at, transaction_code, status, error_message, rows_upserted, rows_ignored, reprocessed_at, payload",
      )
      .eq("user_id", userId)
      .order("received_at", { ascending: false })
      .limit(data.limit);

    if (data.status !== "all") {
      query = query.eq("status", data.status);
    }

    const { data: events, error } = await query;
    if (error) throw new Error(error.message);

    // Quick counts (status breakdown) — bounded to last 1000 rows for perf.
    const { data: recent } = await supabase
      .from("webhook_events")
      .select("status")
      .eq("user_id", userId)
      .order("received_at", { ascending: false })
      .limit(1000);

    const counts = { ok: 0, ignored: 0, error: 0, total: 0 };
    for (const row of recent ?? []) {
      counts.total += 1;
      const s = String(row.status) as "ok" | "ignored" | "error";
      if (s in counts) counts[s] += 1;
    }

    return { events: (events ?? []) as WebhookEventRow[], counts };
  });

export const reprocessWebhookEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        event_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId: authUserId } = context;
    const userId = resolveCompany(data.company_slug).userId;

    if (authUserId !== userId) {
      throw new Error("Não autorizado para esta conta.");
    }

    const { data: event, error } = await supabase
      .from("webhook_events")
      .select("id, payload")
      .eq("id", data.event_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!event) throw new Error("Evento não encontrado.");
    if (!event.payload) throw new Error("Evento sem payload salvo.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processWebhookPayload } = await import("@/routes/api/public/celetus-webhook");

    const result = await processWebhookPayload(supabaseAdmin, userId, event.payload);

    await supabaseAdmin.from("webhook_events").insert({
      user_id: userId,
      status: result.status,
      transaction_code: result.transactionCode,
      error_message: result.errorMessage
        ? `[reprocesso] ${result.errorMessage}`
        : `[reprocesso de ${data.event_id}]`,
      rows_upserted: result.rowsUpserted,
      rows_ignored: result.rowsIgnored,
      payload: event.payload,
    });

    await supabaseAdmin
      .from("webhook_events")
      .update({ reprocessed_at: new Date().toISOString() })
      .eq("id", data.event_id);

    return { ok: true, result };
  });
