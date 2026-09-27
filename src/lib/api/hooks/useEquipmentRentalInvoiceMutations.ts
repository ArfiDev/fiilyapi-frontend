import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import {
  EQUIPMENT_RENTAL_INVOICES_QUERY_KEY,
  EQUIPMENT_RENTAL_INVOICE_QUERY_KEY,
  type RentalInvoiceDetailResponse,
  type RentalInvoiceLineResponse,
  type RentalInvoiceResponse,
} from "./useEquipmentRentalInvoices";
import { EQUIPMENT_DETAIL_SCREEN_QUERY_KEY } from "./useEquipmentDetailScreen";
import type { DeepScale } from "@/lib/api/scale";

// F-KIRA T-A · yazma/aksiyon uçları (`useSubcontractorProgressPaymentMutations`
// deseniyle AYNI). Sekiz kapsanan operasyondan ALTISI burada; `POST …/reload` ve
// `DELETE …/rental-invoice-lines/{id}` mockup'ta ÇİZİLMEMİŞTİR ve K2 gereği bu
// dilimde BASILMAZ — hook'ları da yazılmaz (çağıranı olmayan hook, ekranda
// olmayan bir yeteneği varmış gibi gösterir).
export type RentalInvoiceCreate = DeepScale<components["schemas"]["RentalInvoiceCreate"]>;
export type RentalInvoiceUpdate = DeepScale<components["schemas"]["RentalInvoiceUpdate"]>;
export type RentalInvoiceLineUpdate = DeepScale<components["schemas"]["RentalInvoiceLineUpdate"]>;

/**
 * Ortak geçersiz kılma: liste (filtre varyantları dahil, prefix eşleşme) +
 * tekil detay. Satır PATCH'i de detayı tazeler çünkü `totals` ve
 * `site_distribution` satırlardan TÜREVDİR.
 */
function useRentalInvoiceInvalidator() {
  const queryClient = useQueryClient();
  return (invoiceId?: string) => {
    queryClient.invalidateQueries({ queryKey: [EQUIPMENT_RENTAL_INVOICES_QUERY_KEY] });
    // MK-4 detay ekranının `rental.cumulative_paid`i `status = paid`
    // hakedişlerin TÜREVİDİR → her hakediş yazımı onu da bayatlatır. KÖK
    // anahtar: bir hakedişin satırları BİRDEN ÇOK ekipmana dokunabilir.
    queryClient.invalidateQueries({ queryKey: [EQUIPMENT_DETAIL_SCREEN_QUERY_KEY] });
    if (invoiceId) {
      queryClient.invalidateQueries({
        queryKey: [EQUIPMENT_RENTAL_INVOICE_QUERY_KEY, invoiceId],
      });
    }
  };
}

/**
 * Hakediş oluşturma — sunucu durumu `draft` damgalar.
 *
 * Gövde `lines[]` TAŞIMAZ: satırlar çalışma kaydından sunucuda kurulur
 * (M5:83 "Çalışma kaydından otomatik yüklendi"). İstemci saat gönderebilseydi
 * doğrulamanın iki bağımsız tarafı tek kaynağa çökerdi.
 */
export function useCreateRentalInvoice(): UseMutationResult<
  RentalInvoiceDetailResponse,
  Error,
  RentalInvoiceCreate
> {
  const invalidate = useRentalInvoiceInvalidator();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(await backendClient.POST("/equipment/rental-invoices", { body })),
    onSuccess: (data) => invalidate(data.id),
  });
}

/**
 * Başlık güncelleme — yalnız `draft`/`pending_verification` (K5, ötesi 409).
 *
 * 🔴 Gönderilmeyen alan ile `null` gönderilen alan FARKLIDIR
 * (`model_fields_set`, F-İK "touched" dersi): çağıran, kullanıcının
 * DOKUNMADIĞI alanı gövdeye HİÇ koymaz, `null` koymaz.
 */
export function useUpdateRentalInvoice(): UseMutationResult<
  RentalInvoiceDetailResponse,
  Error,
  { invoiceId: string; body: RentalInvoiceUpdate }
> {
  const invalidate = useRentalInvoiceInvalidator();
  return useMutation({
    mutationFn: async ({ invoiceId, body }) =>
      unwrap(
        await backendClient.PATCH("/equipment/rental-invoices/{invoice_id}", {
          params: { path: { invoice_id: invoiceId } },
          body,
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}

/**
 * Satır güncelleme — gövde YALNIZ `rate_amount` + `invoiced_hours` alır
 * (`extra="forbid"`, başka alan 422). `worked_hours` gövdeden yazılabilseydi
 * K2 snapshot'ı bir PATCH ile delinirdi.
 *
 * Yanıt SATIRDIR, fatura değil: `invoiceId` geçersiz kılma için AYRICA verilir.
 */
export function useUpdateRentalInvoiceLine(): UseMutationResult<
  RentalInvoiceLineResponse,
  Error,
  { invoiceId: string; lineId: string; body: RentalInvoiceLineUpdate }
> {
  const invalidate = useRentalInvoiceInvalidator();
  return useMutation({
    mutationFn: async ({ lineId, body }) =>
      unwrap(
        await backendClient.PATCH("/equipment/rental-invoice-lines/{line_id}", {
          params: { path: { line_id: lineId } },
          body,
        }),
      ),
    onSuccess: (_data, { invoiceId }) => invalidate(invoiceId),
  });
}

/**
 * İLERİ ADIM — zinciri TEK ADIM ilerletir
 * (`draft → pending_verification → approved`). Etiket duruma göre değişir,
 * bkz. `rentalForwardActionLabel`. Ödeme damgası bu uçtan BASILMAZ.
 */
export function useApproveRentalInvoice(): UseMutationResult<RentalInvoiceResponse, Error, string> {
  const invalidate = useRentalInvoiceInvalidator();
  return useMutation({
    mutationFn: async (invoiceId) =>
      unwrap(
        await backendClient.POST("/equipment/rental-invoices/{invoice_id}/approve", {
          params: { path: { invoice_id: invoiceId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}

/** ÖDENDİ damgası (`approved → paid`). `paid` bir UÇ DURUMDUR: ikinci çağrı 409. */
export function usePayRentalInvoice(): UseMutationResult<RentalInvoiceResponse, Error, string> {
  const invalidate = useRentalInvoiceInvalidator();
  return useMutation({
    mutationFn: async (invoiceId) =>
      unwrap(
        await backendClient.POST("/equipment/rental-invoices/{invoice_id}/pay", {
          params: { path: { invoice_id: invoiceId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}

/**
 * ONAYIN GERİ ALINMASI (`approved → pending_verification`). Ayrı bir `rejected`
 * durumu YOKTUR; fatura "doğrulama bekleyen" listesine geri döner ve yeniden
 * düzenlenebilir hâle gelir. Gövde ALMAZ (emsal `SubcontractorRejectBody`den
 * FARKLI: kira ucunda gerekçe alanı yoktur).
 */
export function useRejectRentalInvoice(): UseMutationResult<RentalInvoiceResponse, Error, string> {
  const invalidate = useRentalInvoiceInvalidator();
  return useMutation({
    mutationFn: async (invoiceId) =>
      unwrap(
        await backendClient.POST("/equipment/rental-invoices/{invoice_id}/reject", {
          params: { path: { invoice_id: invoiceId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}
