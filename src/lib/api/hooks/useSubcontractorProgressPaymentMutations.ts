import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import {
  SUBCONTRACTOR_PROGRESS_PAYMENTS_QUERY_KEY,
  SUBCONTRACTOR_PROGRESS_PAYMENT_QUERY_KEY,
  SUBCONTRACTOR_PROGRESS_PAYMENT_SUMMARY_QUERY_KEY,
  type SubcontractorProgressPaymentDetail,
} from "./useSubcontractorProgressPayments";
import type { DeepScale } from "@/lib/api/scale";

// F-TH T1 · Taşeron Hakedişi ekranları — yazma/aksiyon uçları.
// `useProgressPaymentMutations.ts` deseniyle AYNI. Tipler `pnpm gen:api`
// çıktısından takma ad olarak alınır; elle arayüz yazmak yasak.
export type SubcontractorProgressPaymentCreate =
  DeepScale<components["schemas"]["SubcontractorProgressPaymentCreate"]>;
export type SubcontractorProgressPaymentUpdate =
  DeepScale<components["schemas"]["SubcontractorProgressPaymentUpdate"]>;
export type SubcontractorProgressPaymentLinesSave =
  DeepScale<components["schemas"]["SubcontractorProgressPaymentLinesSave"]>;
// 2026-08-03 openapi devri: backend bu şemayı Input/Output olarak İKİYE ayırıp
// üretiyor (`-Input` / `-Output`); düz ad kalktı. Burada `PUT …/lines` İSTEK
// gövdesi üretildiği için `-Input` varyantı kullanılır (işveren tarafındaki
// `ProgressPaymentLineInput` ile aynı taşıma).
export type SubcontractorProgressPaymentLineInput =
  components["schemas"]["SubcontractorProgressPaymentLineInput-Input"];
export type SubcontractorRejectBody = DeepScale<components["schemas"]["SubcontractorRejectBody"]>;
export type SubcontractorRefreshPricesResponse =
  DeepScale<components["schemas"]["SubcontractorRefreshPricesResponse"]>;

// Tum yazma/aksiyon hook'lari sonrasi ortak gecersiz kilma: liste (filtre
// varyantlari dahil, prefix eslesme), tekil detay ve ozet (filtre varyantlari
// dahil, prefix eslesme). İşveren `useProgressPaymentInvalidator`'dan FARKLI:
// ozet tek `project_id`ye degil, listeyle ayni cok-alanli filtre kumesine
// bagli oldugundan ozet HER ZAMAN prefix ile gecersiz kilinir (tek bir
// projectId parametresiyle daraltmak bazi filtre varyantlarini kacirirdi).
function useSubcontractorProgressPaymentInvalidator() {
  const queryClient = useQueryClient();
  return (paymentId?: string) => {
    queryClient.invalidateQueries({ queryKey: [SUBCONTRACTOR_PROGRESS_PAYMENTS_QUERY_KEY] });
    if (paymentId) {
      queryClient.invalidateQueries({ queryKey: [SUBCONTRACTOR_PROGRESS_PAYMENT_QUERY_KEY, paymentId] });
    }
    queryClient.invalidateQueries({ queryKey: [SUBCONTRACTOR_PROGRESS_PAYMENT_SUMMARY_QUERY_KEY] });
  };
}

/**
 * Hakediş oluşturma. İşveren şemasından FARKLI: gövde `lines[]` TAŞIMAZ
 * (satırlar sözleşme kalemlerinden otomatik yüklenir, miktarlar ayrıca
 * `PUT …/lines` ile girilir).
 */
export function useCreateSubcontractorProgressPayment(): UseMutationResult<
  SubcontractorProgressPaymentDetail,
  Error,
  { contractId: string; body: SubcontractorProgressPaymentCreate }
> {
  const invalidate = useSubcontractorProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async ({ contractId, body }) =>
      unwrap(
        await backendClient.POST("/subcontractor-contracts/{contract_id}/progress-payments", {
          params: { path: { contract_id: contractId } },
          body,
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}

/**
 * Hakediş üst bilgi güncelleme (dönem, açıklama, varsayılan katsayı, bölüm).
 * Satırlar bu uçtan GEÇMEZ — bkz. `useReplaceSubcontractorProgressPaymentLines`.
 */
export function useUpdateSubcontractorProgressPayment(): UseMutationResult<
  SubcontractorProgressPaymentDetail,
  Error,
  { paymentId: string; body: SubcontractorProgressPaymentUpdate }
> {
  const invalidate = useSubcontractorProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async ({ paymentId, body }) =>
      unwrap(
        await backendClient.PATCH("/subcontractor-progress-payments/{payment_id}", {
          params: { path: { payment_id: paymentId } },
          body,
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}

/**
 * Hakediş satırlarını DEĞİŞTİRİR (PUT semantiği): gövdede geçmeyen her satır
 * SİLİNİR. İsimlendirme bilinçli — "update" değil "replace" (işveren
 * tarafıyla aynı sözleşme).
 */
export function useReplaceSubcontractorProgressPaymentLines(): UseMutationResult<
  SubcontractorProgressPaymentDetail,
  Error,
  { paymentId: string; body: SubcontractorProgressPaymentLinesSave }
> {
  const invalidate = useSubcontractorProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async ({ paymentId, body }) =>
      unwrap(
        await backendClient.PUT("/subcontractor-progress-payments/{payment_id}/lines", {
          params: { path: { payment_id: paymentId } },
          body,
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}

/**
 * Hakediş silme. Başarı `204 No Content` — `unwrap` yalnız `response.ok`'a
 * bakar.
 */
export function useDeleteSubcontractorProgressPayment(): UseMutationResult<void, Error, string> {
  const invalidate = useSubcontractorProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async (paymentId: string) => {
      unwrap(
        await backendClient.DELETE("/subcontractor-progress-payments/{payment_id}", {
          params: { path: { payment_id: paymentId } },
        }),
      );
    },
    onSuccess: (_data, paymentId) => invalidate(paymentId),
  });
}

// Durum aksiyonları — govde almazlar (reject harici), yalniz payment_id.
// İşveren dosyasındaki ayni gerekce ile ortak factory'ye sarilmiyor: dort
// ucun yolu literal string oldugundan dinamik yol olusturmak `as` ile tip
// zorlamayi gerektirirdi (yasak).

/** Taslak → beklemede. */
export function useSubmitSubcontractorProgressPayment(): UseMutationResult<
  SubcontractorProgressPaymentDetail,
  Error,
  string
> {
  const invalidate = useSubcontractorProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async (paymentId: string) =>
      unwrap(
        await backendClient.POST("/subcontractor-progress-payments/{payment_id}/submit", {
          params: { path: { payment_id: paymentId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}

/** Beklemede → onaylandı. */
export function useApproveSubcontractorProgressPayment(): UseMutationResult<
  SubcontractorProgressPaymentDetail,
  Error,
  string
> {
  const invalidate = useSubcontractorProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async (paymentId: string) =>
      unwrap(
        await backendClient.POST("/subcontractor-progress-payments/{payment_id}/approve", {
          params: { path: { payment_id: paymentId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}

/** Onaylandı → ödendi. */
export function useMarkSubcontractorProgressPaymentPaid(): UseMutationResult<
  SubcontractorProgressPaymentDetail,
  Error,
  string
> {
  const invalidate = useSubcontractorProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async (paymentId: string) =>
      unwrap(
        await backendClient.POST("/subcontractor-progress-payments/{payment_id}/mark-paid", {
          params: { path: { payment_id: paymentId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}

/** Onaylandı → beklemede (onay geri alma). */
export function useUnapproveSubcontractorProgressPayment(): UseMutationResult<
  SubcontractorProgressPaymentDetail,
  Error,
  string
> {
  const invalidate = useSubcontractorProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async (paymentId: string) =>
      unwrap(
        await backendClient.POST("/subcontractor-progress-payments/{payment_id}/unapprove", {
          params: { path: { payment_id: paymentId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}

/**
 * Beklemede → taslak + red gerekçesi. İşveren `RejectBody`den FARKLI:
 * `reason` ZORUNLUDUR (`SubcontractorRejectBody.reason` opsiyonel değil —
 * "Revize Gerekli" rozetinin açıklamasına yazılır).
 */
export function useRejectSubcontractorProgressPayment(): UseMutationResult<
  SubcontractorProgressPaymentDetail,
  Error,
  { paymentId: string; body: SubcontractorRejectBody }
> {
  const invalidate = useSubcontractorProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async ({ paymentId, body }) =>
      unwrap(
        await backendClient.POST("/subcontractor-progress-payments/{payment_id}/reject", {
          params: { path: { payment_id: paymentId } },
          body,
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}

/**
 * Fiyat/katsayı tazeleme — yalnız `draft`'ta. Yanıt YALNIZ
 * `{refreshed_count}` döner, güncel ekran ayrı bir detay sorgusuyla okunur.
 */
export function useRefreshSubcontractorProgressPaymentPrices(): UseMutationResult<
  SubcontractorRefreshPricesResponse,
  Error,
  string
> {
  const invalidate = useSubcontractorProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async (paymentId: string) =>
      unwrap(
        await backendClient.POST("/subcontractor-progress-payments/{payment_id}/refresh-prices", {
          params: { path: { payment_id: paymentId } },
        }),
      ),
    onSuccess: (_data, paymentId) => invalidate(paymentId),
  });
}
