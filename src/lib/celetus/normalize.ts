// Helpers shared between webhook and server functions.

const PAID = new Set(["pago", "paid", "approved", "aprovado", "completed"]);
const PRINCIPAL = new Set(["principal", "main"]);
const ORDERBUMP = new Set(["orderbump", "order_bump", "bump", "order bump"]);
const PRODUCER = new Set(["produtor", "producer"]);

export const norm = (v: unknown): string =>
  String(v ?? "").trim().toLowerCase();

export const isPaid = (status: unknown) => PAID.has(norm(status));
export const isPrincipal = (kind: unknown) => PRINCIPAL.has(norm(kind));
export const isOrderbump = (kind: unknown) => ORDERBUMP.has(norm(kind));
export const isProducer = (recipient: unknown) => PRODUCER.has(norm(recipient));

export const kindLabel = (kind: unknown): "Principal" | "Orderbump" | "Outro" =>
  isPrincipal(kind) ? "Principal" : isOrderbump(kind) ? "Orderbump" : "Outro";

// Try to parse Celetus dates: "04/06/2026 22:26:20" or ISO.
export function parseCeletusDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (!s) return null;
  // dd/MM/yyyy [HH:mm:ss]
  const m = s.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
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
