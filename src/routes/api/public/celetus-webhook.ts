import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { parseCeletusDate, kindLabel, norm } from "@/lib/celetus/normalize";

const Money = z.union([z.number(), z.string()]).optional();

const Customer = z
  .object({
    name: z.string().optional(),
    document: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  })
  .passthrough();

const Item = z
  .object({
    id: z.string().optional(),
    code: z.string().optional(),
    product_id: z.string().optional(),
    productId: z.string().optional(),
    name: z.string().optional(),
    product_name: z.string().optional(),
    productName: z.string().optional(),
    offer_name: z.string().optional(),
    offerName: z.string().optional(),
    item_type: z.string().optional(),
    itemType: z.string().optional(),
    kind: z.string().optional(),
    type: z.string().optional(),
    item_type_sale: z.string().optional(),
    quantity: z.union([z.number(), z.string()]).optional(),
    amount: Money,
    unitaryValue: Money,
    unitary_value: Money,
    price: Money,
    value: Money,
    commission: Money,
    commissionValue: Money,
    commission_value: Money,
    userCommission: Money,
    user_commission: Money,
  })
  .passthrough();

const Charge = z
  .object({
    id: z.string().optional(),
    code: z.string().optional(),
    status: z.string().optional(),
    amount: Money,
    payment_method: z.string().optional(),
    paymentMethod: z.string().optional(),
    created_date: z.union([z.string(), z.number()]).optional(),
    createdAt: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const Tracking = z
  .object({
    sck: z.string().optional(),
    src: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_content: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_source: z.string().optional(),
    utm_term: z.string().optional(),
    campaign: z.string().optional(),
    content: z.string().optional(),
    medium: z.string().optional(),
    source: z.string().optional(),
    term: z.string().optional(),
  })
  .passthrough();

const Commission = z
  .object({
    totalPrice: Money,
    total_price: Money,
    gatewayFee: Money,
    gateway_fee: Money,
    userCommission: Money,
    user_commission: Money,
    commissionValue: Money,
    commission_value: Money,
    currency: z.string().optional(),
  })
  .passthrough();

const Payload = z
  .object({
    id: z.string().optional(),
    event_name: z.string().optional(),
    event_type: z.string().optional(),
    eventType: z.string().optional(),
    event_type_identifier: z.string().optional(),
    transactionCode: z.string().optional(),
    transaction_code: z.string().optional(),
    order_code: z.string().optional(),
    orderCode: z.string().optional(),
    order_id: z.string().optional(),
    orderId: z.string().optional(),
    code: z.string().optional(),
    src: z.string().optional(),
    productSrc: z.string().optional(),
    product_src: z.string().optional(),
    productId: z.string().optional(),
    product_id: z.string().optional(),
    productName: z.string().optional(),
    product_name: z.string().optional(),
    offerName: z.string().optional(),
    offer_name: z.string().optional(),
    kind: z.string().optional(),
    type: z.string().optional(),
    itemType: z.string().optional(),
    item_type: z.string().optional(),
    status: z.string().optional(),
    paymentStatus: z.string().optional(),
    payment_status: z.string().optional(),
    order_status: z.string().optional(),
    orderStatus: z.string().optional(),
    paymentMethod: z.string().optional(),
    payment_method: z.string().optional(),
    commissionValue: Money,
    commission_value: Money,
    grossValue: Money,
    gross_value: Money,
    netValue: Money,
    net_value: Money,
    fees: Money,
    saleDate: z.union([z.string(), z.number()]).optional(),
    sale_date: z.union([z.string(), z.number()]).optional(),
    createdAt: z.union([z.string(), z.number()]).optional(),
    created_at: z.union([z.string(), z.number()]).optional(),
    created_date: z.union([z.string(), z.number()]).optional(),
    approvedDate: z.union([z.string(), z.number()]).optional(),
    approved_date: z.union([z.string(), z.number()]).optional(),
    quantity: z.union([z.number(), z.string()]).optional(),
    recipient: z.string().optional(),
    recipientType: z.string().optional(),
    recipient_type: z.string().optional(),
    recipientCompany: z.string().optional(),
    seller_name: z.string().optional(),
    sellerName: z.string().optional(),
    seller_type: z.string().optional(),
    sellerType: z.string().optional(),
    buyerName: z.string().optional(),
    buyer_name: z.string().optional(),
    buyerEmail: z.string().optional(),
    buyer_email: z.string().optional(),
    buyerPhone: z.string().optional(),
    buyer_phone: z.string().optional(),
    buyerDocument: z.string().optional(),
    buyer_document: z.string().optional(),
    srcTag: z.string().optional(),
    src_tag: z.string().optional(),
    utmSource: z.string().optional(),
    utm_source: z.string().optional(),
    utmStatus: z.string().optional(),
    utm_status: z.string().optional(),
    campaignId: z.string().optional(),
    campaign_id: z.string().optional(),
    adsetId: z.string().optional(),
    adset_id: z.string().optional(),
    adId: z.string().optional(),
    ad_id: z.string().optional(),
    customer: Customer.optional(),
    items: z.array(Item).optional(),
    products: z.array(Item).optional(),
    charge: Charge.optional(),
    trackingParameters: Tracking.optional(),
    tracking_parameters: Tracking.optional(),
    tracking: Tracking.optional(),
    commission: Commission.optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

type PayloadData = z.infer<typeof Payload>;
type ItemData = z.infer<typeof Item>;

type ProductRow = {
  id: string;
  src: string;
  name: string;
};

type SaleCandidate = {
  productCandidates: string[];
  storedSrc: string;
  transactionCode: string;
  productName: string | null;
  row: Record<string, unknown>;
};

export const Route = createFileRoute("/api/public/celetus-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const secret =
          request.headers.get("api-token") ||
          request.headers.get("x-webhook-secret") ||
          request.headers.get("authorization")?.replace(/^Bearer /i, "") ||
          url.searchParams.get("secret") ||
          "";

        if (!secret) {
          return json({ error: "missing secret" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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

        const normalizedBody = unwrapPayload(body);
        const parsed = Payload.safeParse(normalizedBody);
        if (!parsed.success) {
          return json({ error: "invalid payload", issues: parsed.error.issues }, 400);
        }
        const payload = parsed.data;

        const candidates = buildSaleCandidates(payload, normalizedBody);
        if (candidates.length === 0) {
          return json({ error: "missing sale items" }, 400);
        }

        const { data: products, error: productsErr } = await supabaseAdmin
          .from("products")
          .select("id, src, name")
          .eq("user_id", userId);
        if (productsErr) return json({ error: productsErr.message }, 500);

        const productRows = (products ?? []) as ProductRow[];
        const fallbackProduct = findPayloadProduct(productRows, candidates);
        const rows = candidates.map((candidate) => {
          const product = findProduct(productRows, candidate) ?? fallbackProduct;
          if (!product) {
            return {
              candidate,
              row: null,
            };
          }

          return {
            candidate,
            row: {
              ...candidate.row,
              user_id: userId,
              product_id: product.id,
            },
          };
        });

        const missing = rows
          .filter((r) => !r.row)
          .map((r) => ({
            transaction_code: r.candidate.transactionCode,
            product_name: r.candidate.productName,
            src_candidates: r.candidate.productCandidates,
          }));

        if (missing.length > 0) {
          return json(
            {
              error: "product not registered for this payload",
              missing,
            },
            404,
          );
        }

        const rowsToUpsert = rows.map((r) => r.row as Record<string, unknown>);
        const { error: upErr } = await supabaseAdmin
          .from("celetus_sales")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(rowsToUpsert as any, {
            onConflict: "user_id,transaction_code,src,kind",
          });
        if (upErr) return json({ error: upErr.message }, 500);

        return json({
          ok: true,
          rows_received: candidates.length,
          rows_upserted: rowsToUpsert.length,
        });
      },
      GET: async () => json({ ok: true, info: "POST a Celetus payload here" }),
    },
  },
});

function buildSaleCandidates(payload: PayloadData, raw: unknown): SaleCandidate[] {
  const items = getItems(payload);
  const transactionCode = firstText(
    payload.transactionCode,
    payload.transaction_code,
    payload.order_code,
    payload.orderCode,
    payload.code,
    payload.charge?.code,
    payload.order_id,
    payload.orderId,
    payload.id,
  );

  if (!transactionCode) {
    throw new Error("missing transactionCode");
  }

  const tracking = payload.trackingParameters ?? payload.tracking_parameters ?? payload.tracking;
  const totalGross = getTotalGross(payload, items);
  const totalCommission = getTotalCommission(payload, items, totalGross);
  const totalItemAmount = items.reduce((sum, item) => sum + getItemAmount(item), 0);
  const saleDate =
    parseCeletusDate(
      firstText(
        payload.saleDate,
        payload.sale_date,
        payload.approvedDate,
        payload.approved_date,
        payload.createdAt,
        payload.created_at,
        payload.created_date,
        payload.charge?.createdAt,
        payload.charge?.created_date,
      ),
    ) ?? new Date();
  const status = statusLabel(
    firstText(
      payload.status,
      payload.paymentStatus,
      payload.payment_status,
      payload.charge?.status,
      payload.order_status,
      payload.orderStatus,
      payload.event_type,
      payload.eventType,
    ),
  );
  const paymentMethod = firstText(
    payload.paymentMethod,
    payload.payment_method,
    payload.charge?.paymentMethod,
    payload.charge?.payment_method,
  );
  const recipientType = firstText(
    payload.recipientType,
    payload.recipient_type,
    payload.seller_type,
    payload.sellerType,
    payload.recipient,
    "Produtor",
  );
  const recipient = firstText(payload.recipient, recipientType, "Produtor");
  const recipientCompany = firstText(
    payload.recipientCompany,
    payload.seller_name,
    payload.sellerName,
  );

  return items.map((item) => {
    const itemKind = kindLabel(
      firstText(
        item.item_type,
        item.itemType,
        item.kind,
        item.type,
        payload.item_type,
        payload.itemType,
        payload.kind,
        payload.type,
      ),
    );
    const productName = firstText(
      item.name,
      item.product_name,
      item.productName,
      payload.productName,
      payload.product_name,
    );
    const itemSrc = firstText(
      item.id,
      item.code,
      item.product_id,
      item.productId,
      payload.productId,
      payload.product_id,
      payload.productSrc,
      payload.product_src,
      payload.src,
      tracking?.src,
    );
    const productCandidates = uniqueTexts([
      item.id,
      item.code,
      item.product_id,
      item.productId,
      payload.productId,
      payload.product_id,
      payload.productSrc,
      payload.product_src,
      payload.src,
      tracking?.src,
    ]);
    const itemCommission = getItemCommission(item, totalCommission, totalItemAmount, items.length);
    const quantity = Math.max(1, Math.trunc(num(item.quantity ?? payload.quantity, 1)));

    return {
      productCandidates,
      storedSrc: itemSrc,
      transactionCode,
      productName: productName || null,
      row: {
        transaction_code: transactionCode,
        buyer_name:
          firstText(payload.buyerName, payload.buyer_name, payload.customer?.name) || null,
        buyer_email:
          firstText(payload.buyerEmail, payload.buyer_email, payload.customer?.email) || null,
        buyer_phone:
          firstText(payload.buyerPhone, payload.buyer_phone, payload.customer?.phone) || null,
        buyer_document:
          firstText(payload.buyerDocument, payload.buyer_document, payload.customer?.document) ||
          null,
        src: itemSrc,
        product_name: productName || null,
        offer_name:
          firstText(item.offerName, item.offer_name, payload.offerName, payload.offer_name) || null,
        kind: itemKind,
        status,
        doc_type: orderKindLabel(firstText(item.item_type_sale)),
        payment_method: paymentMethod || null,
        commission_value: itemCommission,
        sale_date: saleDate.toISOString(),
        quantity,
        gross_value: totalGross || null,
        net_value: totalCommission || null,
        fees: getFees(payload) || null,
        recipient,
        recipient_company: recipientCompany || null,
        recipient_type: recipientType,
        item_type: itemKind,
        src_tag: firstText(payload.srcTag, payload.src_tag, tracking?.sck) || null,
        utm_source:
          firstText(
            payload.utmSource,
            payload.utm_source,
            tracking?.utm_source,
            tracking?.source,
          ) || null,
        utm_status:
          firstText(payload.utmStatus, payload.utm_status, payload.charge?.status) || null,
        campaign_id:
          firstText(payload.campaignId, payload.campaign_id, tracking?.utm_campaign) || null,
        adset_id: firstText(payload.adsetId, payload.adset_id, tracking?.utm_medium) || null,
        ad_id: firstText(payload.adId, payload.ad_id, tracking?.utm_content) || null,
        raw: raw as Record<string, unknown>,
      },
    };
  });
}

function unwrapPayload(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const record = body as Record<string, unknown>;

  if (record.data && typeof record.data === "object") {
    const data = record.data as Record<string, unknown>;
    if (data.order_code || data.order_id || data.customer || data.items || data.products) {
      return data;
    }
  }

  return body;
}

function getItems(payload: PayloadData): ItemData[] {
  if (payload.items?.length) return payload.items;
  if (payload.products?.length) return payload.products;

  return [
    {
      id: firstText(payload.productId, payload.product_id, payload.productSrc, payload.src),
      name: firstText(payload.productName, payload.product_name),
      offerName: firstText(payload.offerName, payload.offer_name),
      item_type: firstText(payload.item_type, payload.itemType, payload.kind, payload.type),
      quantity: payload.quantity,
      commissionValue: payload.commissionValue ?? payload.commission_value,
      amount: payload.grossValue ?? payload.gross_value,
    },
  ];
}

function findProduct(products: ProductRow[], candidate: SaleCandidate) {
  const bySrc = findProductBySrc(products, candidate.productCandidates);
  if (bySrc) return bySrc;

  if (!candidate.productName) return null;
  return products.find((p) => norm(p.name) === norm(candidate.productName)) ?? null;
}

function findPayloadProduct(products: ProductRow[], candidates: SaleCandidate[]) {
  const bySrc = findProductBySrc(
    products,
    candidates.flatMap((c) => c.productCandidates),
  );
  if (bySrc) return bySrc;

  for (const candidate of candidates) {
    if (!candidate.productName) continue;
    const byName = products.find((p) => norm(p.name) === norm(candidate.productName));
    if (byName) return byName;
  }

  return null;
}

function findProductBySrc(products: ProductRow[], candidates: string[]) {
  const normalized = new Set(candidates.map((value) => norm(value)).filter(Boolean));
  return products.find((product) => normalized.has(norm(product.src))) ?? null;
}

function getTotalGross(payload: PayloadData, items: ItemData[]) {
  const explicit = firstNumber(
    payload.commission?.totalPrice,
    payload.commission?.total_price,
    payload.charge?.amount,
    payload.grossValue,
    payload.gross_value,
  );

  if (explicit !== null) return explicit;
  return roundMoney(items.reduce((sum, item) => sum + getItemAmount(item), 0));
}

function getTotalCommission(payload: PayloadData, items: ItemData[], fallback: number) {
  const explicit = firstNumber(
    payload.commission?.userCommission,
    payload.commission?.user_commission,
    payload.commission?.commissionValue,
    payload.commission?.commission_value,
    payload.commissionValue,
    payload.commission_value,
    payload.netValue,
    payload.net_value,
  );

  if (explicit !== null) return explicit;
  return fallback || roundMoney(items.reduce((sum, item) => sum + getItemAmount(item), 0));
}

function getItemCommission(
  item: ItemData,
  totalCommission: number,
  totalItemAmount: number,
  itemCount: number,
) {
  const explicit = firstNumber(
    item.commission,
    item.commissionValue,
    item.commission_value,
    item.userCommission,
    item.user_commission,
  );

  if (explicit !== null) return explicit;
  if (itemCount === 1) return totalCommission;

  const itemAmount = getItemAmount(item);
  if (totalCommission && totalItemAmount && itemAmount) {
    return roundMoney(totalCommission * (itemAmount / totalItemAmount));
  }

  return itemAmount;
}

function getItemAmount(item: ItemData) {
  const amount = firstNumber(
    item.amount,
    item.unitaryValue,
    item.unitary_value,
    item.price,
    item.value,
  );
  const quantity = num(item.quantity, 1);
  return roundMoney((amount ?? 0) * quantity);
}

function getFees(payload: PayloadData) {
  return (
    firstNumber(payload.fees, payload.commission?.gatewayFee, payload.commission?.gateway_fee) ?? 0
  );
}

function statusLabel(value: unknown) {
  const normalized = norm(value).replace(/[^a-z0-9]/g, "");

  if (
    [
      "pago",
      "paid",
      "approved",
      "aprovado",
      "complete",
      "completed",
      "approvedpurchase",
      "subscriptionactive",
      "subscriptioncompleted",
    ].includes(normalized)
  ) {
    return "Pago";
  }

  if (
    [
      "pending",
      "processing",
      "waitingpayment",
      "processingtransaction",
      "pixgenerated",
      "boletogenerated",
    ].includes(normalized)
  ) {
    return "Pendente";
  }

  if (["refunded", "refundclaimed", "reembolso"].includes(normalized)) {
    return "Reembolso";
  }

  if (normalized === "chargeback") {
    return "Chargeback";
  }

  if (["canceled", "cancelled", "cancelado"].includes(normalized)) {
    return "Cancelado";
  }

  if (["expired", "expiredpurchase", "overdue", "expirado"].includes(normalized)) {
    return "Expirado";
  }

  if (["failed", "purchasedeclined", "nofunds", "recusado"].includes(normalized)) {
    return "Recusado";
  }

  if (["abandoned", "abandonedcheckout", "abandonado"].includes(normalized)) {
    return "Abandonado";
  }

  return firstText(value) || "desconhecido";
}

function orderKindLabel(value: unknown) {
  return norm(value).includes("assinatura") || norm(value).includes("subscription")
    ? "Assinatura"
    : "Pedido";
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }

  return "";
}

function uniqueTexts(values: unknown[]) {
  return Array.from(new Set(values.map((value) => firstText(value)).filter(Boolean)));
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = num(value, NaN);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return null;
}

function num(v: unknown, def = 0): number {
  if (v == null || v === "") return def;
  if (typeof v === "number") return v;
  let text = String(v)
    .trim()
    .replace(/[^\d,.-]/g, "");
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const n = Number(text);
  return Number.isNaN(n) ? def : n;
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
