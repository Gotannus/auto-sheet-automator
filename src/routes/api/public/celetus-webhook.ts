import { createFileRoute } from "@tanstack/react-router";
import {
  hasIndicationMarker,
  isIndicationText,
  parseCeletusDate,
  kindLabel,
  norm,
} from "@/lib/celetus/normalize";
import { getCompany } from "@/lib/celetus/workspaces";

type AnyRecord = Record<string, unknown>;
type SupabaseAdminClient =
  (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

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
  row: AnyRecord;
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

        if (!secret) return json({ error: "missing secret" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const companySlug =
          url.searchParams.get("company") || url.searchParams.get("workspace") || "";
        const company = companySlug ? getCompany(companySlug) : null;

        if (companySlug && !company) return json({ error: "invalid company" }, 404);

        let configQuery = supabaseAdmin
          .from("webhook_config")
          .select("user_id")
          .eq("webhook_secret", secret);

        if (company) configQuery = configQuery.eq("user_id", company.userId);

        const { data: config, error: configError } = await configQuery.maybeSingle();

        if (configError) return json({ error: configError.message }, 500);
        if (!config) return json({ error: "invalid secret" }, 401);

        const userId = String(config.user_id);

        let rawBody: unknown = null;
        try {
          rawBody = await request.json();
        } catch {
          await logWebhookEvent(supabaseAdmin, {
            user_id: userId,
            status: "ignored",
            error_message: "empty or invalid json",
            payload: null,
          });
          return ignoreWebhook("empty or invalid json");
        }

        const result = await processWebhookPayload(supabaseAdmin, userId, rawBody);

        await logWebhookEvent(supabaseAdmin, {
          user_id: userId,
          status: result.status,
          transaction_code: result.transactionCode,
          error_message: result.errorMessage,
          rows_upserted: result.rowsUpserted,
          rows_ignored: result.rowsIgnored,
          payload: rawBody,
        });

        if (result.status === "error") {
          // Respond 200 so Celetus doesn't keep retrying; the log captures it.
          return json({ ok: false, error: result.errorMessage });
        }

        if (result.status === "ignored") {
          return ignoreWebhook(result.errorMessage ?? "ignored");
        }

        return json({
          ok: true,
          rows_received: result.rowsReceived,
          rows_upserted: result.rowsUpserted,
          rows_ignored: result.rowsIgnored,
          auto_created_products: result.autoCreatedProducts,
        });
      },
      GET: async () => json({ ok: true, info: "POST a Celetus payload here" }),
    },
  },
});

type WebhookResult = {
  status: "ok" | "ignored" | "error";
  transactionCode: string | null;
  errorMessage: string | null;
  rowsReceived: number;
  rowsUpserted: number;
  rowsIgnored: number;
  autoCreatedProducts: number;
};

export async function processWebhookPayload(
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
  rawBody: unknown,
): Promise<WebhookResult> {
  const base: WebhookResult = {
    status: "ignored",
    transactionCode: null,
    errorMessage: null,
    rowsReceived: 0,
    rowsUpserted: 0,
    rowsIgnored: 0,
    autoCreatedProducts: 0,
  };

  const payload = asRecord(unwrapPayload(rawBody));
  if (!payload) return { ...base, errorMessage: "invalid payload" };

  let candidates: SaleCandidate[];
  try {
    candidates = buildSaleCandidates(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "missing transaction code") {
      return { ...base, errorMessage: "missing transaction code" };
    }
    return {
      ...base,
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }

  const transactionCode = candidates[0]?.transactionCode ?? null;
  if (candidates.length === 0) {
    return { ...base, transactionCode, errorMessage: "missing sale items" };
  }

  const sellableCandidates = candidates.filter(
    (candidate) => !isIndicationCandidate(payload, candidate),
  );

  if (sellableCandidates.length === 0) {
    return {
      ...base,
      transactionCode,
      errorMessage: "indication sale",
      rowsReceived: candidates.length,
      rowsIgnored: candidates.length,
    };
  }

  const { data: products, error: productsError } = await supabaseAdmin
    .from("products")
    .select("id, src, name")
    .eq("user_id", userId);

  if (productsError) {
    return {
      ...base,
      status: "error",
      transactionCode,
      errorMessage: productsError.message,
    };
  }

  const productRows = (products ?? []) as ProductRow[];
  let autoCreatedProducts = 0;
  const rows: AnyRecord[] = [];

  for (const candidate of sellableCandidates) {
    let product = findProduct(productRows, candidate);

    if (!product) {
      try {
        product = await createProductFromCandidate(supabaseAdmin, userId, candidate);
      } catch (error) {
        return {
          ...base,
          status: "error",
          transactionCode,
          errorMessage: error instanceof Error ? error.message : String(error),
        };
      }
      productRows.push(product);
      autoCreatedProducts += 1;
    }

    rows.push({
      ...candidate.row,
      user_id: userId,
      product_id: product.id,
    });
  }

  const { error: upsertError } = await supabaseAdmin
    .from("celetus_sales")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(rows as any, {
      onConflict: "user_id,transaction_code,line_item_code",
    });

  if (upsertError) {
    return {
      ...base,
      status: "error",
      transactionCode,
      errorMessage: upsertError.message,
    };
  }

  return {
    status: "ok",
    transactionCode,
    errorMessage: null,
    rowsReceived: candidates.length,
    rowsUpserted: rows.length,
    rowsIgnored: candidates.length - sellableCandidates.length,
    autoCreatedProducts,
  };
}

async function logWebhookEvent(
  supabaseAdmin: SupabaseAdminClient,
  data: {
    user_id: string;
    status: "ok" | "ignored" | "error";
    transaction_code?: string | null;
    error_message?: string | null;
    rows_upserted?: number | null;
    rows_ignored?: number | null;
    payload: unknown;
  },
) {
  try {
    await supabaseAdmin.from("webhook_events").insert({
      user_id: data.user_id,
      status: data.status,
      transaction_code: data.transaction_code ?? null,
      error_message: data.error_message ?? null,
      rows_upserted: data.rows_upserted ?? null,
      rows_ignored: data.rows_ignored ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: data.payload as any,
    });
  } catch (error) {
    console.error("[celetus-webhook] failed to log event", error);
  }
}



function buildSaleCandidates(payload: AnyRecord): SaleCandidate[] {
  const items = getItems(payload);
  const transactionCode = firstText(
    payload.transactionCode,
    payload.transaction_code,
    payload.order_code,
    payload.orderCode,
    payload.code,
    record(payload.charge)?.code,
    payload.order_id,
    payload.orderId,
    payload.id,
  );

  if (!transactionCode) throw new Error("missing transaction code");

  const tracking =
    record(payload.trackingParameters) ??
    record(payload.tracking_parameters) ??
    record(payload.tracking);
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
        record(payload.charge)?.createdAt,
        record(payload.charge)?.created_date,
      ),
    ) ?? new Date();
  const status = statusLabel(
    firstText(
      payload.status,
      payload.paymentStatus,
      payload.payment_status,
      record(payload.charge)?.status,
      payload.order_status,
      payload.orderStatus,
      payload.event_type,
      payload.eventType,
    ),
  );
  const paymentMethod = firstText(
    payload.paymentMethod,
    payload.payment_method,
    record(payload.charge)?.paymentMethod,
    record(payload.charge)?.payment_method,
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
    const productName = firstText(
      item.name,
      item.product_name,
      item.productName,
      payload.productName,
      payload.product_name,
    );
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
    const actualSrc = firstText(
      tracking?.src,
      payload.src,
      payload.productSrc,
      payload.product_src,
      payload.productId,
      payload.product_id,
      item.product_code,
      item.productCode,
      item.product_id,
      item.productId,
      item.id,
      item.code,
    );
    const storedSrc =
      actualSrc ||
      buildTemporarySrc(
        productName,
        transactionCode,
        firstText(item.product_code, item.code, item.id),
      );
    const productCandidates = uniqueTexts([
      storedSrc,
      tracking?.src,
      payload.src,
      payload.productSrc,
      payload.product_src,
      payload.productId,
      payload.product_id,
      item.product_code,
      item.productCode,
      item.product_id,
      item.productId,
      item.id,
      item.code,
    ]);
    const itemCommission = getItemCommission(item, totalCommission, totalItemAmount, items.length);
    const quantity = Math.max(1, Math.trunc(num(item.quantity ?? payload.quantity, 1)));
    const offerName = firstText(
      item.offerName,
      item.offer_name,
      payload.offerName,
      payload.offer_name,
    );
    const lineItemCode = buildLineItemCode(productName, itemKind, offerName, storedSrc);

    return {
      productCandidates,
      storedSrc,
      transactionCode,
      productName: productName || null,
      row: {
        transaction_code: transactionCode,
        buyer_name:
          firstText(payload.buyerName, payload.buyer_name, record(payload.customer)?.name) || null,
        buyer_email:
          firstText(payload.buyerEmail, payload.buyer_email, record(payload.customer)?.email) ||
          null,
        buyer_phone:
          firstText(payload.buyerPhone, payload.buyer_phone, record(payload.customer)?.phone) ||
          null,
        buyer_document:
          firstText(
            payload.buyerDocument,
            payload.buyer_document,
            record(payload.customer)?.document,
          ) || null,
        src: storedSrc,
        line_item_code: lineItemCode,
        product_name: productName || null,
        offer_name: offerName || null,
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
          firstText(payload.utmStatus, payload.utm_status, record(payload.charge)?.status) || null,
        campaign_id:
          firstText(payload.campaignId, payload.campaign_id, tracking?.utm_campaign) || null,
        adset_id: firstText(payload.adsetId, payload.adset_id, tracking?.utm_medium) || null,
        ad_id: firstText(payload.adId, payload.ad_id, tracking?.utm_content) || null,
        raw: payload,
      },
    };
  });
}

function isIndicationCandidate(payload: AnyRecord, candidate: SaleCandidate) {
  return (
    hasIndicationMarker(payload) ||
    candidate.productCandidates.some(isIndicationText) ||
    isIndicationText(candidate.storedSrc) ||
    [
      candidate.row.src,
      candidate.row.src_tag,
      candidate.row.utm_source,
      candidate.row.campaign_id,
      candidate.row.adset_id,
      candidate.row.ad_id,
    ].some(isIndicationText)
  );
}

function unwrapPayload(body: unknown): unknown {
  const payload = record(body);
  if (!payload) return body;

  const data = record(payload.data);
  if (data && (data.order_code || data.order_id || data.customer || data.items || data.products)) {
    return data;
  }

  return payload;
}

function getItems(payload: AnyRecord): AnyRecord[] {
  const items = arrayOfRecords(payload.items);
  if (items.length) return items;

  const products = arrayOfRecords(payload.products);
  if (products.length) return products;

  return [
    {
      id: firstText(payload.productId, payload.product_id, payload.productSrc, payload.src),
      product_code: firstText(
        payload.productId,
        payload.product_id,
        payload.productSrc,
        payload.src,
      ),
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
  return products.find((product) => norm(product.name) === norm(candidate.productName)) ?? null;
}

function findProductBySrc(products: ProductRow[], candidates: string[]) {
  const normalized = new Set(candidates.map((value) => norm(value)).filter(Boolean));
  return products.find((product) => normalized.has(norm(product.src))) ?? null;
}

async function createProductFromCandidate(
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
  candidate: SaleCandidate,
) {
  const { data, error } = await supabaseAdmin
    .from("products")
    .upsert(
      {
        user_id: userId,
        src: candidate.storedSrc,
        name: candidate.productName || candidate.storedSrc,
      },
      { onConflict: "user_id,src" },
    )
    .select("id, src, name")
    .single();

  if (error) throw new Error(error.message);
  return data as ProductRow;
}

function getTotalGross(payload: AnyRecord, items: AnyRecord[]) {
  const explicit = firstNumber(
    record(payload.commission)?.totalPrice,
    record(payload.commission)?.total_price,
    record(payload.charge)?.amount,
    payload.grossValue,
    payload.gross_value,
  );

  if (explicit !== null) return explicit;
  return roundMoney(items.reduce((sum, item) => sum + getItemAmount(item), 0));
}

function getTotalCommission(payload: AnyRecord, items: AnyRecord[], fallback: number) {
  const explicit = firstNumber(
    record(payload.commission)?.userCommission,
    record(payload.commission)?.user_commission,
    record(payload.commission)?.commissionValue,
    record(payload.commission)?.commission_value,
    payload.commissionValue,
    payload.commission_value,
    payload.netValue,
    payload.net_value,
  );

  if (explicit !== null) return explicit;
  return fallback || roundMoney(items.reduce((sum, item) => sum + getItemAmount(item), 0));
}

function getItemCommission(
  item: AnyRecord,
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

function getItemAmount(item: AnyRecord) {
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

function getFees(payload: AnyRecord) {
  return (
    firstNumber(
      payload.fees,
      record(payload.commission)?.gatewayFee,
      record(payload.commission)?.gateway_fee,
    ) ?? 0
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

  if (["refunded", "refundclaimed", "reembolso"].includes(normalized)) return "Reembolso";
  if (normalized === "chargeback") return "Chargeback";
  if (["canceled", "cancelled", "cancelado"].includes(normalized)) return "Cancelado";
  if (["expired", "expiredpurchase", "overdue", "expirado"].includes(normalized)) return "Expirado";
  if (["failed", "purchasedeclined", "nofunds", "recusado"].includes(normalized)) return "Recusado";
  if (["abandoned", "abandonedcheckout", "abandonado"].includes(normalized)) return "Abandonado";

  return firstText(value) || "desconhecido";
}

function orderKindLabel(value: unknown) {
  return norm(value).includes("assinatura") || norm(value).includes("subscription")
    ? "Assinatura"
    : "Pedido";
}

function buildTemporarySrc(productName: string, transactionCode: string, itemCode: string) {
  const basis = firstText(productName, itemCode, transactionCode, crypto.randomUUID());
  return `sem-src-${slug(basis)}`.slice(0, 120);
}

function buildLineItemCode(
  productName: string,
  itemKind: string,
  offerName: string,
  storedSrc: string,
) {
  return uniqueTexts([itemKind, productName || storedSrc, offerName])
    .join(":")
    .slice(0, 240);
}

function slug(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "produto"
  );
}

function asRecord(value: unknown): AnyRecord | null {
  return record(value) ?? null;
}

function record(value: unknown): AnyRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as AnyRecord;
}

function arrayOfRecords(value: unknown): AnyRecord[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (record(item) ? [record(item) as AnyRecord] : []))
    : [];
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

function num(value: unknown, fallback = 0): number {
  if (value == null || value === "") return fallback;
  if (typeof value === "number") return value;

  let text = String(value)
    .trim()
    .replace(/[^\d,.-]/g, "");

  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");

  const parsed = Number(text);
  return Number.isNaN(parsed) ? fallback : parsed;
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

function ignoreWebhook(reason: string) {
  return json({
    ok: true,
    ignored: true,
    reason,
  });
}
