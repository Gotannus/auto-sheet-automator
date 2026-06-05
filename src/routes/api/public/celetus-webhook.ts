import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { parseCeletusDate, kindLabel, norm } from "@/lib/celetus/normalize";

// Accept loose Celetus-like payload; we only enforce keys we actually use.
const Payload = z
  .object({
    transactionCode: z.string().optional(),
    transaction_code: z.string().optional(),
    code: z.string().optional(),
    src: z.string().optional(),
    productSrc: z.string().optional(),
    product_src: z.string().optional(),
    productId: z.string().optional(),

    productName: z.string().optional(),
    product_name: z.string().optional(),
    offerName: z.string().optional(),
    offer_name: z.string().optional(),

    kind: z.string().optional(),
    type: z.string().optional(),

    status: z.string().optional(),
    paymentStatus: z.string().optional(),

    paymentMethod: z.string().optional(),
    payment_method: z.string().optional(),

    commissionValue: z.union([z.number(), z.string()]).optional(),
    commission_value: z.union([z.number(), z.string()]).optional(),
    grossValue: z.union([z.number(), z.string()]).optional(),
    gross_value: z.union([z.number(), z.string()]).optional(),
    netValue: z.union([z.number(), z.string()]).optional(),
    net_value: z.union([z.number(), z.string()]).optional(),
    fees: z.union([z.number(), z.string()]).optional(),

    saleDate: z.union([z.string(), z.number()]).optional(),
    sale_date: z.union([z.string(), z.number()]).optional(),
    createdAt: z.union([z.string(), z.number()]).optional(),

    quantity: z.union([z.number(), z.string()]).optional(),

    recipient: z.string().optional(),
    recipientType: z.string().optional(),
    recipient_type: z.string().optional(),
    recipientCompany: z.string().optional(),

    buyerName: z.string().optional(),
    buyer_name: z.string().optional(),
    buyerEmail: z.string().optional(),
    buyer_email: z.string().optional(),
    buyerPhone: z.string().optional(),
    buyerDocument: z.string().optional(),

    itemType: z.string().optional(),
    srcTag: z.string().optional(),
    src_tag: z.string().optional(),
    utmSource: z.string().optional(),
    utmStatus: z.string().optional(),
    campaignId: z.string().optional(),
    adsetId: z.string().optional(),
    adId: z.string().optional(),
  })
  .passthrough();

function num(v: unknown, def = 0): number {
  if (v == null || v === "") return def;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return isNaN(n) ? def : n;
}

export const Route = createFileRoute("/api/public/celetus-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const secret =
          request.headers.get("x-webhook-secret") ||
          request.headers.get("authorization")?.replace(/^Bearer /i, "") ||
          url.searchParams.get("secret") ||
          "";

        if (!secret) {
          return json({ error: "missing secret" }, 401);
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // Find owner by secret
        const { data: wc, error: wcErr } = await supabaseAdmin
          .from("webhook_config")
          .select("user_id")
          .eq("webhook_secret", secret)
          .maybeSingle();
        if (wcErr) return json({ error: wcErr.message }, 500);
        if (!wc) return json({ error: "invalid secret" }, 401);
        const userId = wc.user_id;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid json" }, 400);
        }
        const parsed = Payload.safeParse(body);
        if (!parsed.success) {
          return json({ error: "invalid payload", issues: parsed.error.issues }, 400);
        }
        const p = parsed.data;

        const src =
          p.src ?? p.productSrc ?? p.product_src ?? p.productId ?? "";
        if (!src) return json({ error: "missing src" }, 400);

        const transactionCode =
          p.transactionCode ?? p.transaction_code ?? p.code ?? "";
        if (!transactionCode) {
          return json({ error: "missing transactionCode" }, 400);
        }

        // Find product by (user_id, src)
        const { data: product, error: prodErr } = await supabaseAdmin
          .from("products")
          .select("id")
          .eq("user_id", userId)
          .eq("src", src)
          .maybeSingle();
        if (prodErr) return json({ error: prodErr.message }, 500);
        if (!product) {
          return json(
            { error: "product not registered for this src", src },
            404,
          );
        }

        const saleDate =
          parseCeletusDate(p.saleDate ?? p.sale_date ?? p.createdAt) ??
          new Date();

        const kind = kindLabel(p.kind ?? p.type);
        const status = String(p.status ?? p.paymentStatus ?? "").trim() || "desconhecido";

        const row = {
          user_id: userId,
          product_id: product.id,
          transaction_code: transactionCode,
          buyer_name: p.buyerName ?? p.buyer_name ?? null,
          buyer_email: p.buyerEmail ?? p.buyer_email ?? null,
          buyer_phone: p.buyerPhone ?? null,
          buyer_document: p.buyerDocument ?? null,
          src,
          product_name: p.productName ?? p.product_name ?? null,
          offer_name: p.offerName ?? p.offer_name ?? null,
          kind,
          status,
          payment_method: p.paymentMethod ?? p.payment_method ?? null,
          commission_value: num(p.commissionValue ?? p.commission_value),
          sale_date: saleDate.toISOString(),
          quantity: Math.max(1, Math.trunc(num(p.quantity, 1))),
          gross_value: num(p.grossValue ?? p.gross_value, 0) || null,
          net_value: num(p.netValue ?? p.net_value, 0) || null,
          fees: num(p.fees, 0) || null,
          recipient: p.recipient ?? null,
          recipient_company: p.recipientCompany ?? null,
          recipient_type: p.recipientType ?? p.recipient_type ?? null,
          item_type: p.itemType ?? null,
          src_tag: p.srcTag ?? p.src_tag ?? null,
          utm_source: p.utmSource ?? null,
          utm_status: p.utmStatus ?? null,
          campaign_id: p.campaignId ?? null,
          adset_id: p.adsetId ?? null,
          ad_id: p.adId ?? null,
          raw: body as Record<string, unknown>,
        };

        const { error: upErr } = await supabaseAdmin
          .from("celetus_sales")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(row as any, { onConflict: "user_id,transaction_code,src,kind" });
        if (upErr) return json({ error: upErr.message }, 500);

        return json({ ok: true });
      },
      GET: async () => json({ ok: true, info: "POST a Celetus payload here" }),
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// silence unused
void norm;
