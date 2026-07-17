import type { SaleCandidate } from "@/routes/api/public/celetus-webhook";

type AnyRecord = Record<string, unknown>;

const ACCEPTED_EVENTS = new Set([
  "PURCHASE_APPROVED",
  "PURCHASE_COMPLETE",
  "PURCHASE_REFUNDED",
  "PURCHASE_CHARGEBACK",
  "PURCHASE_CANCELED",
  "PURCHASE_PROTEST",
]);

function statusFromEvent(event: string): string {
  switch (event) {
    case "PURCHASE_APPROVED":
    case "PURCHASE_COMPLETE":
      return "Pago";
    case "PURCHASE_REFUNDED":
      return "Reembolso";
    case "PURCHASE_CHARGEBACK":
    case "PURCHASE_PROTEST":
      return "Chargeback";
    case "PURCHASE_CANCELED":
      return "Cancelado";
    default:
      return "desconhecido";
  }
}

function paymentLabel(type: unknown): string | null {
  const v = String(type ?? "").toUpperCase();
  if (!v) return null;
  if (v.includes("PIX")) return "pix";
  if (v.includes("BILLET") || v.includes("BOLETO")) return "boleto";
  if (v.includes("CREDIT")) return "credit_card";
  return v.toLowerCase();
}

function record(value: unknown): AnyRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as AnyRecord;
}

function arr(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter((x) => record(x)) as AnyRecord[] : [];
}

function num(v: unknown, fallback = 0): number {
  if (v == null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isNaN(n) ? fallback : n;
}

function txt(...vals: unknown[]): string {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function toISODate(v: unknown): string {
  if (v == null) return new Date().toISOString();
  if (typeof v === "number") return new Date(v).toISOString();
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return new Date(Number(s)).toISOString();
  const d = new Date(s);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export type HotmartParseResult =
  | { kind: "ignored"; reason: string; transactionCode: string | null }
  | {
      kind: "status_update";
      transactionCode: string;
      status: "Reembolso" | "Chargeback" | "Cancelado";
    }
  | {
      kind: "ok";
      candidates: SaleCandidate[];
      transactionCode: string;
      parentTransactionCode: string | null;
    };

export function parseHotmartPayload(rawBody: unknown): HotmartParseResult {
  const payload = record(rawBody);
  if (!payload) return { kind: "ignored", reason: "invalid payload", transactionCode: null };

  const event = String(payload.event ?? "").toUpperCase();
  if (!ACCEPTED_EVENTS.has(event)) {
    return { kind: "ignored", reason: `event ${event || "unknown"} not handled`, transactionCode: null };
  }

  const data = record(payload.data) ?? {};
  const purchase = record(data.purchase) ?? {};
  const product = record(data.product) ?? {};
  const buyer = record(data.buyer) ?? {};
  const price = record(purchase.price) ?? {};
  const payment = record(purchase.payment) ?? {};
  const offer = record(purchase.offer) ?? {};
  const origin = record(purchase.origin) ?? {};
  const commissions = arr(purchase.commissions ?? data.commissions);
  const affiliates = arr(data.affiliates);

  const transactionCode = txt(purchase.transaction, purchase.order_ref, payload.id);
  if (!transactionCode) {
    return { kind: "ignored", reason: "missing transaction", transactionCode: null };
  }

  // Refund / chargeback / cancellation events: emit a status_update so the
  // webhook handler can flip the existing sale's status regardless of whether
  // the original sale was affiliate or not.
  const isNegative =
    event === "PURCHASE_REFUNDED" ||
    event === "PURCHASE_CHARGEBACK" ||
    event === "PURCHASE_PROTEST" ||
    event === "PURCHASE_CANCELED";
  if (isNegative) {
    const status = statusFromEvent(event) as "Reembolso" | "Chargeback" | "Cancelado";
    return { kind: "status_update", transactionCode, status };
  }

  // Indication / affiliate sale — ignore (regra Celetus)
  const hasAffiliate = affiliates.some((a) => txt(a.name, a.affiliate_code));
  if (hasAffiliate) {
    return { kind: "ignored", reason: "affiliate sale", transactionCode };
  }

  const status = statusFromEvent(event);
  const saleDate = toISODate(
    purchase.approved_date ?? purchase.order_date ?? purchase.date_next_charge,
  );


  const currency = String(
    price.currency_value ?? record(purchase.full_price)?.currency_value ?? "BRL",
  )
    .toUpperCase()
    .trim();
  const fxRate = currency && currency !== "BRL" ? 5 : 1;

  const grossValue = num(price.value ?? (record(purchase.full_price)?.value)) * fxRate;
  // Producer commission: prefer source === PRODUCER
  let producerCommission = 0;
  for (const c of commissions) {
    const src = String(c.source ?? "").toUpperCase();
    const v = num((record(c.value) as AnyRecord | null)?.value ?? c.value);
    if (src === "PRODUCER" || src === "MARKETPLACE_PRODUCER") {
      producerCommission += v;
    }
  }
  if (producerCommission === 0) {
    // fallback: total - fees
    const totalCommission = commissions.reduce((s, c) => {
      const v = num((record(c.value) as AnyRecord | null)?.value ?? c.value);
      return s + v;
    }, 0);
    producerCommission = totalCommission || (grossValue / fxRate);
  }
  producerCommission = producerCommission * fxRate;

  const orderBump = record(purchase.order_bump) ?? {};
  const parentTransactionCode = txt(orderBump.parent_purchase_transaction) || null;
  const isOrderBump = Boolean(parentTransactionCode);
  const kindLabel: "Principal" | "Orderbump" = isOrderBump ? "Orderbump" : "Principal";

  const productId = txt(product.id, product.ucode, product.code);
  const storedSrc = productId ? `hotmart-${productId}` : `hotmart-${transactionCode}`;
  const productName = txt(product.name);
  const offerName = txt(offer.code, offer.key);
  const lineItemCode = [kindLabel, productName || storedSrc, offerName]
    .filter(Boolean)
    .join(":")
    .slice(0, 240);

  const candidate: SaleCandidate = {
    productCandidates: [storedSrc, productId].filter(Boolean),
    storedSrc,
    transactionCode,
    productName: productName || null,
    row: {
      transaction_code: transactionCode,
      buyer_name: txt(buyer.name) || null,
      buyer_email: txt(buyer.email) || null,
      buyer_phone: txt(buyer.checkout_phone, buyer.phone) || null,
      buyer_document: txt(buyer.document) || null,
      src: storedSrc,
      line_item_code: lineItemCode,
      product_name: productName || null,
      offer_name: offerName || null,
      kind: kindLabel,
      status,
      doc_type: txt(purchase.recurrency_number) ? "Assinatura" : "Pedido",
      payment_method: paymentLabel(payment.type),
      commission_value: Math.round(producerCommission * 100) / 100,
      sale_date: saleDate,
      quantity: Math.max(1, Math.trunc(num(purchase.quantity ?? 1, 1))),
      gross_value: grossValue || null,
      net_value: producerCommission || null,
      fees: Math.max(0, Math.round((grossValue - producerCommission) * 100) / 100) || null,
      recipient: "Produtor",
      recipient_company: txt(record(data.producer)?.name) || null,
      recipient_type: "Produtor",
      item_type: kindLabel,
      src_tag: txt(origin.sck) || null,
      utm_source: txt(origin.src, origin.utm_source) || null,
      utm_status: null,
      campaign_id: txt(origin.xcod, origin.utm_campaign) || null,
      adset_id: txt(origin.utm_medium) || null,
      ad_id: txt(origin.utm_content) || null,
      original_currency: currency || "BRL",
      fx_rate: fxRate,
      raw: payload,
    },
  };

  return { kind: "ok", candidates: [candidate], transactionCode, parentTransactionCode };
}
