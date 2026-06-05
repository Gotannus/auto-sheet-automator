// Helpers shared between webhook and server functions.

const PAID = new Set([
  "pago",
  "paid",
  "approved",
  "aprovado",
  "complete",
  "completed",
  "approvedpurchase",
  "subscriptionactive",
  "subscriptioncompleted",
]);
const PRINCIPAL = new Set(["principal", "main"]);
const ORDERBUMP = new Set(["orderbump", "order_bump", "bump", "order bump"]);
const PRODUCER = new Set(["produtor", "producer"]);
const INDICATION_RE =
  /\b(indicacao|indicacoes|indicado|indicada|indicador|afiliado|afiliada|afiliados|afiliadas|affiliate|affiliated|referral|referencia|referido|referida|parceiro|parceira|partner)\b/;

export const norm = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

export const isPaid = (status: unknown) => PAID.has(norm(status));
export const isPrincipal = (kind: unknown) => PRINCIPAL.has(norm(kind));
export const isOrderbump = (kind: unknown) => ORDERBUMP.has(norm(kind));
export const isProducer = (recipient: unknown) => PRODUCER.has(norm(recipient));
export const isIndicationText = (value: unknown): boolean =>
  INDICATION_RE.test(norm(value).replace(/[^a-z0-9]+/g, " "));

export function hasIndicationMarker(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const row = value as Record<string, unknown>;
  const commission = asRecord(row.commission);
  const lostSaleData = asRecord(row.lostSaleData) ?? asRecord(row.lost_sale_data);
  const tracking =
    asRecord(row.trackingParameters) ?? asRecord(row.tracking_parameters) ?? asRecord(row.tracking);

  if (
    hasFilledValue(row.affiliate) ||
    hasFilledValue(row.affiliated) ||
    hasFilledValue(row.affiliates) ||
    hasFilledValue(row.affiliateName) ||
    hasFilledValue(row.affiliate_name) ||
    hasFilledValue(commission?.affiliated) ||
    hasFilledValue(commission?.affiliate) ||
    hasFilledValue(commission?.affiliates) ||
    hasFilledValue(lostSaleData?.Affialted) ||
    hasFilledValue(lostSaleData?.Affiliated) ||
    hasFilledValue(lostSaleData?.Affiliate)
  ) {
    return true;
  }

  return [
    row.src,
    row.srcTag,
    row.src_tag,
    row.utmSource,
    row.utm_source,
    row.utmCampaign,
    row.utm_campaign,
    row.utmMedium,
    row.utm_medium,
    row.utmContent,
    row.utm_content,
    row.campaignId,
    row.campaign_id,
    tracking?.src,
    tracking?.sck,
    tracking?.utm_source,
    tracking?.utm_campaign,
    tracking?.utm_medium,
    tracking?.utm_content,
  ].some(isIndicationText);
}

export const kindLabel = (kind: unknown): "Principal" | "Orderbump" | "Outro" =>
  isPrincipal(kind) ? "Principal" : isOrderbump(kind) ? "Orderbump" : "Outro";

// Try to parse Celetus dates: "04/06/2026 22:26:20" or ISO.
export function parseCeletusDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (!s) return null;
  // dd/MM/yyyy [HH:mm:ss]
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, dd, mm, yyyy, hh = "0", mi = "0", ss = "0"] = m;
    // Treat as local BRT; store as UTC after offset
    const iso = `${yyyy}-${mm}-${dd}T${hh.padStart(2, "0")}:${mi.padStart(2, "0")}:${ss.padStart(2, "0")}-03:00`;
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasFilledValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;

  const text = norm(value);
  return Boolean(text && text !== "null" && text !== "undefined" && text !== "0");
}
