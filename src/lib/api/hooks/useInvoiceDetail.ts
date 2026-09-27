import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-FAT2 T2 · Fatura detayının (FGI/FGE) okuma sorguları.
export type InvoiceDetailResponse = DeepScale<components["schemas"]["InvoiceDetailResponse"]>;
export type InvoiceLineResponse = DeepScale<components["schemas"]["InvoiceLineResponse"]>;
export type PaymentListResponse = components["schemas"]["PaymentListResponse"];
export type PaymentResponse = components["schemas"]["PaymentResponse"];
export type PaymentMethodKind = components["schemas"]["PaymentMethodKind"];
export type RentalInvoiceDetailResponse =
  DeepScale<components["schemas"]["RentalInvoiceDetailResponse"]>;
export type RentalInvoiceLineResponse = DeepScale<components["schemas"]["RentalInvoiceLineResponse"]>;
export type VarianceStatus = components["schemas"]["VarianceStatus"];

export const INVOICE_DETAIL_QUERY_KEY = "invoice-detail";
export const INVOICE_PAYMENTS_QUERY_KEY = "invoice-payments";
export const INVOICE_RENTAL_MATCH_QUERY_KEY = "invoice-rental-match";

/** `GET /invoices/{id}/payments` `limit` tavanı (openapi.json: `maximum: 200`). */
export const INVOICE_PAYMENT_LIST_MAX_LIMIT = 200;

/**
 * `GET /invoices/{invoice_id}` — künye + kalemler + SAKLANAN toplamlar.
 *
 * Boş id ile ağa ÇIKILMAZ (`useEquipmentDetail` deseni): rota parametresi
 * çözülmeden bileşen bir kez render olabilir.
 */
export function useInvoiceDetail(
  invoiceId: string,
): UseQueryResult<InvoiceDetailResponse, Error> {
  return useQuery({
    enabled: invoiceId.length > 0,
    queryKey: [INVOICE_DETAIL_QUERY_KEY, invoiceId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/invoices/{invoice_id}", {
          params: { path: { invoice_id: invoiceId } },
        }),
      ),
  });
}

/**
 * `GET /invoices/{invoice_id}/payments` — satırlar + `paid_total` + `remaining`.
 *
 * 🔴 İki toplam TÜM satırlardan gelir, SAYFADAN DEĞİL (şema notu) — yani
 * kırpılma onları BOZMAZ. Kırpılma yalnız `items`i etkiler ve ekranda
 * `buildListTruncation` ile GÖRÜNÜR kılınır; tavan burada AÇIKÇA gönderilir.
 */
export function useInvoicePayments(
  invoiceId: string,
): UseQueryResult<PaymentListResponse, Error> {
  return useQuery({
    enabled: invoiceId.length > 0,
    queryKey: [INVOICE_PAYMENTS_QUERY_KEY, invoiceId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/invoices/{invoice_id}/payments", {
          params: {
            path: { invoice_id: invoiceId },
            query: { limit: INVOICE_PAYMENT_LIST_MAX_LIMIT },
          },
        }),
      ),
  });
}

/**
 * FGE:104-143 "Otomatik Eşleştirme Kontrolü" kartının GERÇEK kaynağı.
 *
 * 🔴 Mockup İKİ backend kaynağını tek sayfada karıştırır: eşleştirme tablosu
 * generik `/invoices/{id}`den GELMEZ — saat/fark bilgisi MK-2'nin makine kira
 * faturasındadır (`/equipment/rental-invoices/{id}`, `RentalInvoiceLineResponse.
 * invoiced_hours`/`hours_variance`/`variance_status`). Bu yüzden kart YALNIZ
 * `invoice.equipment_rental_invoice_id` DOLUYKEN çekilir; boşsa kart hiç
 * basılmaz (o fatura için anlamsız bir veridir — devre-dışı bant da değil).
 */
export function useInvoiceRentalMatch(
  rentalInvoiceId: string | null,
): UseQueryResult<RentalInvoiceDetailResponse, Error> {
  const id = rentalInvoiceId ?? "";
  return useQuery({
    enabled: id.length > 0,
    queryKey: [INVOICE_RENTAL_MATCH_QUERY_KEY, id],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/equipment/rental-invoices/{invoice_id}", {
          params: { path: { invoice_id: id } },
        }),
      ),
  });
}
