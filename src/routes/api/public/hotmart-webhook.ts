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

        // Refund / chargeback / cancellation: flip status of every row of
        // this transaction (Principal + Orderbumps) so they leave revenue.
        if (parsed.kind === "status_update") {
          try {
            const { applyRefundUpdate } = await import(
              "@/routes/api/public/celetus-webhook"
            );
            const { rowsUpdated } = await applyRefundUpdate(
              supabaseAdmin,
              userId,
              parsed.transactionCode,
              parsed.status,
            );
            await logWebhookEvent(supabaseAdmin, {
              user_id: userId,
              status: rowsUpdated > 0 ? "ok" : "ignored",
              transaction_code: parsed.transactionCode,
              error_message: `[hotmart] ${parsed.status.toLowerCase()}${
                rowsUpdated === 0 ? " without original sale" : ""
              }`,
              rows_upserted: rowsUpdated,
              rows_ignored: rowsUpdated === 0 ? 1 : 0,
              payload: rawBody,
            });
            return json({
              ok: true,
              status: parsed.status,
              rows_updated: rowsUpdated,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await logWebhookEvent(supabaseAdmin, {
              user_id: userId,
              status: "error",
              transaction_code: parsed.transactionCode,
              error_message: `[hotmart] ${message}`,
              payload: rawBody,
            });
            return json({ ok: false, error: message });
          }
        }

        // For Orderbumps, resolve the principal's src from the parent
        // transaction so the bump gets grouped under the principal product.
        if (parsed.parentTransactionCode) {
          const { data: parentRow } = await supabaseAdmin
            .from("celetus_sales")
            .select("src")
            .eq("user_id", userId)
            .eq("transaction_code", parsed.parentTransactionCode)
            .neq("kind", "Orderbump")
            .maybeSingle();

          if (parentRow?.src) {
            for (const c of parsed.candidates) {
              c.storedSrc = parentRow.src;
              c.row.src = parentRow.src;
              c.productCandidates = [parentRow.src, ...c.productCandidates];
            }
          }
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

        // Reconciliation: if this is a Principal, backfill any Orderbump
        // siblings that were persisted earlier (race with parallel Hotmart
        // webhooks) so they inherit this Principal's src/product_id.
        if (!parsed.parentTransactionCode) {
          const principal = parsed.candidates[0];
          if (principal?.row?.src && principal?.row?.product_name !== undefined) {
            const { data: principalRow } = await supabaseAdmin
              .from("celetus_sales")
              .select("src, product_id")
              .eq("user_id", userId)
              .eq("transaction_code", parsed.transactionCode)
              .neq("kind", "Orderbump")
              .maybeSingle();

            if (principalRow?.src && principalRow?.product_id) {
              await supabaseAdmin
                .from("celetus_sales")
                .update({ src: principalRow.src, product_id: principalRow.product_id })
                .eq("user_id", userId)
                .eq("kind", "Orderbump")
                .filter(
                  "raw->data->purchase->order_bump->>parent_purchase_transaction",
                  "eq",
                  parsed.transactionCode,
                )
                .or(`src.neq.${principalRow.src},product_id.neq.${principalRow.product_id}`);
            }
          }
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
