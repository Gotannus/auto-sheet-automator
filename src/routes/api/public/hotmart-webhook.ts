import { createFileRoute } from "@tanstack/react-router";
import {
  logWebhookEvent,
  persistSaleCandidates,
} from "@/routes/api/public/celetus-webhook";
import { parseHotmartPayload } from "@/lib/celetus/hotmart-parser";

export const Route = createFileRoute("/api/public/hotmart-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        let rawBody: unknown = null;
        let bodyText = "";
        try {
          bodyText = await request.text();
          rawBody = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          return json({ ok: true, ignored: true, reason: "invalid json" });
        }

        const bodyHottok =
          rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)
            ? (rawBody as Record<string, unknown>).hottok
            : null;

        const hottok =
          request.headers.get("x-hotmart-hottok") ||
          request.headers.get("hottok") ||
          (typeof bodyHottok === "string" ? bodyHottok : "") ||
          url.searchParams.get("hottok") ||
          url.searchParams.get("secret") ||
          "";

        if (!hottok) return json({ error: "missing hottok" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const companySlug = url.searchParams.get("company") || url.searchParams.get("workspace") || "";

        let q = supabaseAdmin
          .from("companies")
          .select("id, slug")
          .eq("hotmart_hottok", hottok);
        if (companySlug) q = q.eq("slug", companySlug);

        const { data: company, error: companyError } = await q.maybeSingle();
        if (companyError) return json({ error: companyError.message }, 500);
        if (!company) return json({ error: "invalid hottok" }, 401);

        const userId = String(company.id);
        const parsed = parseHotmartPayload(rawBody);

        if (parsed.kind === "ignored") {
          await logWebhookEvent(supabaseAdmin, {
            user_id: userId,
            status: "ignored",
            transaction_code: parsed.transactionCode,
            error_message: `[hotmart] ${parsed.reason}`,
            payload: rawBody,
          });
          return json({ ok: true, ignored: true, reason: parsed.reason });
        }

        const result = await persistSaleCandidates(supabaseAdmin, userId, parsed.candidates);

        if (result.status === "error") {
          await logWebhookEvent(supabaseAdmin, {
            user_id: userId,
            status: "error",
            transaction_code: parsed.transactionCode,
            error_message: `[hotmart] ${result.errorMessage}`,
            payload: rawBody,
          });
          return json({ ok: false, error: result.errorMessage });
        }

        await logWebhookEvent(supabaseAdmin, {
          user_id: userId,
          status: "ok",
          transaction_code: parsed.transactionCode,
          error_message: "[hotmart]",
          rows_upserted: result.rowsUpserted,
          rows_ignored: 0,
          payload: rawBody,
        });

        return json({
          ok: true,
          rows_received: parsed.candidates.length,
          rows_upserted: result.rowsUpserted,
          rows_ignored: 0,
          auto_created_products: result.autoCreatedProducts,
        });
      },
      GET: async () => json({ ok: true, info: "POST a Hotmart payload here" }),
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
