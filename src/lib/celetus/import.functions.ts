import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveCompany } from "@/lib/celetus/workspaces";
import {
  hasIndicationMarker,
  isIndicationText,
  kindLabel,
  norm,
  parseCeletusDate,
} from "@/lib/celetus/normalize";

type AnyRecord = Record<string, unknown>;

type ProductRow = { id: string; src: string; name: string };

const PAID_STATUSES = new Set(["pago", "paid", "aprovado", "approved", "complete", "completed"]);

export const importCeletusReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        company_slug: z.string().optional(),
        // base64-encoded xlsx
        file_b64: z.string().min(1),
        file_name: z.string().max(255).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const userId = resolveCompany(data.company_slug).userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const logImport = async (entry: {
      status: "ok" | "error" | "ignored";
      rows_read?: number;
      rows_upserted?: number;
      rows_ignored?: number;
      products_created?: number;
      error_message?: string | null;
    }) => {
      try {
        await supabaseAdmin.from("webhook_events").insert({
          user_id: userId,
          kind: "import",
          status: entry.status,
          file_name: data.file_name ?? null,
          rows_read: entry.rows_read ?? null,
          rows_upserted: entry.rows_upserted ?? null,
          rows_ignored: entry.rows_ignored ?? null,
          products_created: entry.products_created ?? null,
          error_message: entry.error_message ?? null,
        });
      } catch (logErr) {
        console.error("[import] failed to write webhook_events log", logErr);
      }
    };

    try {
      const XLSX = await import("xlsx");
      const buf = Buffer.from(data.file_b64, "base64");
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("Planilha vazia");
      const rows = XLSX.utils.sheet_to_json<AnyRecord>(sheet, { defval: null });

      // Preload existing products
      const { data: products, error: prodErr } = await supabaseAdmin
        .from("products")
        .select("id, src, name")
        .eq("user_id", userId);
      if (prodErr) throw new Error(prodErr.message);
      const productList = (products ?? []) as ProductRow[];

      let read = 0;
      let ignored = 0;
      let productsCreated = 0;
      const toUpsert: AnyRecord[] = [];

      for (const row of rows) {
        read += 1;
        const transactionCode = pickText(row, ["Id", "id", "TransactionCode", "transaction_code"]);
        if (!transactionCode) {
          ignored += 1;
          continue;
        }

        const productName = pickText(row, ["ProductName", "Product Name", "product_name"]);
        const productPriceCodeId = pickText(row, [
          "ProductPriceCodeId",
          "Product Price Code Id",
          "product_price_code_id",
        ]);
        const srcCol = pickText(row, ["SRC", "src", "Src"]);
        const sckCol = pickText(row, ["SCK", "sck"]);
        const utmSource = pickText(row, ["UTM_SOURCE", "utm_source"]);
        const utmCampaign = pickText(row, ["UTM_CAMPAIGN", "utm_campaign"]);
        const utmMedium = pickText(row, ["UTM_MEDIUM", "utm_medium"]);
        const utmContent = pickText(row, ["UTM_CONTENT", "utm_content"]);

        // Indication / affiliate filter
        const indicationLike =
          hasIndicationMarker(row) ||
          [srcCol, sckCol, utmSource, utmCampaign, utmMedium, utmContent].some(isIndicationText);
        if (indicationLike) {
          ignored += 1;
          continue;
        }

        const productTypeRaw = pickText(row, ["ProductType", "product_type", "ItemTypeSale"]);
        const kind = kindLabel(productTypeRaw);
        if (kind === "Outro") {
          ignored += 1;
          continue;
        }

        const storedSrc = srcCol || `sem-src-${slug(productName || transactionCode)}`;

        // Resolve / create product
        let product = productList.find((p) => norm(p.src) === norm(storedSrc));
        if (!product && productName) {
          product = productList.find((p) => norm(p.name) === norm(productName));
        }
        if (!product) {
          const { data: created, error } = await supabaseAdmin
            .from("products")
            .upsert(
              { user_id: userId, src: storedSrc, name: productName || storedSrc },
              { onConflict: "user_id,src" },
            )
            .select("id, src, name")
            .single();
          if (error) throw new Error(error.message);
          product = created as ProductRow;
          productList.push(product);
          productsCreated += 1;
        }

        const statusRaw = pickText(row, ["Status", "status"]);
        const status = mapStatus(statusRaw);
        const paymentMethod = pickText(row, ["PaymentyMethod", "PaymentMethod", "payment_method"]);
        const createdDate =
          parseCeletusDate(pickText(row, ["CreatedDate", "created_date", "Date"])) ?? new Date();
        const value = pickNumber(row, ["Value", "value"]);
        const commissionValue = pickNumber(row, ["CommissionValue", "commission_value"]);
        const totalAmountPaid = pickNumber(row, ["TotalAmountPaid", "total_amount_paid", "Amount"]);
        const processingFee = pickNumber(row, ["ProcessingFee", "processing_fee"]);
        const sellerName = pickText(row, ["SellerName", "seller_name"]);
        const sellerType = pickText(row, ["SellerType", "seller_type"]);
        const mainProduct = pickText(row, ["MainProduct", "main_product"]);
        const offerName = pickText(row, ["OfferName", "offer_name"]);

        const lineItemCode = buildLineItemCode(productName, kind, offerName, storedSrc);

        toUpsert.push({
          user_id: userId,
          product_id: product.id,
          transaction_code: transactionCode,
          line_item_code: lineItemCode,
          src: storedSrc,
          product_name: productName || null,
          offer_name: offerName || null,
          kind,
          status,
          doc_type:
            norm(pickText(row, ["ItemTypeSale", "item_type_sale"])).includes("assinatura") ||
            norm(pickText(row, ["Frequency", "frequency"])).length > 0
              ? "Assinatura"
              : "Pedido",
          payment_method: paymentMethod || null,
          commission_value: value ?? 0,
          sale_date: createdDate.toISOString(),
          quantity: 1,
          gross_value: totalAmountPaid ?? null,
          net_value: commissionValue ?? null,
          fees: processingFee ?? null,
          recipient: "Produtor",
          recipient_company: sellerName || null,
          recipient_type: sellerType || "Produtor",
          item_type: mainProduct || kind,
          src_tag: sckCol || null,
          utm_source: utmSource || null,
          utm_status: null,
          campaign_id: utmCampaign || null,
          adset_id: utmMedium || null,
          ad_id: utmContent || null,
          buyer_name: pickText(row, ["Name", "BuyerName", "buyer_name"]) || null,
          buyer_email: pickText(row, ["Email", "BuyerEmail", "buyer_email"]) || null,
          buyer_phone: pickText(row, ["Phone", "BuyerPhone", "buyer_phone"]) || null,
          buyer_document: pickText(row, ["CpfCnpj", "BuyerDocument", "buyer_document"]) || null,
          raw: row,
        });
      }

      // Deduplicate inside the same file (last row wins) so a single upsert batch
      // doesn't trip the unique constraint with duplicate (tx, line) pairs.
      const dedup = new Map<string, AnyRecord>();
      for (const r of toUpsert) {
        dedup.set(`${r.transaction_code}|${r.line_item_code}`, r);
      }
      const finalRows = Array.from(dedup.values());

      let upserted = 0;
      const CHUNK = 400;
      for (let i = 0; i < finalRows.length; i += CHUNK) {
        const batch = finalRows.slice(i, i + CHUNK);
        const { error } = await supabaseAdmin
          .from("celetus_sales")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .upsert(batch as any, { onConflict: "user_id,transaction_code,line_item_code" });
        if (error) throw new Error(error.message);
        upserted += batch.length;
      }

      await logImport({
        status: "ok",
        rows_read: read,
        rows_upserted: upserted,
        rows_ignored: ignored,
        products_created: productsCreated,
      });

      return {
        ok: true,
        rows_read: read,
        rows_ignored: ignored,
        rows_upserted: upserted,
        products_created: productsCreated,
        paid_count: finalRows.filter((r) => PAID_STATUSES.has(norm(r.status))).length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logImport({ status: "error", error_message: message });
      throw err;
    }
  });


function pickText(row: AnyRecord, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v === null || v === undefined) continue;
    const text = String(v).trim();
    if (text) return text;
  }
  return "";
}

function pickNumber(row: AnyRecord, keys: string[]): number | null {
  for (const k of keys) {
    const v = row[k];
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "number" && !Number.isNaN(v)) return v;
    const text = String(v)
      .trim()
      .replace(/[^\d,.-]/g, "");
    const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
    const n = Number(normalized);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function mapStatus(raw: string): string {
  const n = norm(raw).replace(/[^a-z0-9]/g, "");
  if (
    ["pago", "paid", "approved", "aprovado", "complete", "completed", "approvedpurchase"].includes(
      n,
    )
  )
    return "Pago";
  if (["pending", "pendente", "waitingpayment", "pixgenerated", "boletogenerated"].includes(n))
    return "Pendente";
  if (["refunded", "refundclaimed", "reembolso"].includes(n)) return "Reembolso";
  if (n === "chargeback") return "Chargeback";
  if (["canceled", "cancelled", "cancelado"].includes(n)) return "Cancelado";
  if (["expired", "expiredpurchase", "overdue", "expirado"].includes(n)) return "Expirado";
  if (["failed", "purchasedeclined", "nofunds", "recusado"].includes(n)) return "Recusado";
  if (["abandoned", "abandonedcheckout", "abandonado"].includes(n)) return "Abandonado";
  return raw || "desconhecido";
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

function buildLineItemCode(
  productName: string,
  kind: string,
  offerName: string,
  storedSrc: string,
) {
  return uniqueTexts([kind, productName || storedSrc, offerName])
    .join(":")
    .slice(0, 240);
}

function uniqueTexts(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
