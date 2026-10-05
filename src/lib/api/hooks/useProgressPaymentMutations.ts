import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import {
  PROGRESS_PAYMENTS_QUERY_KEY,
  PROGRESS_PAYMENT_QUERY_KEY,
  PROGRESS_PAYMENT_SUMMARY_QUERY_KEY,
  type ProgressPaymentDetail,
} from "./useProgressPayments";
import type { DeepScale } from "@/lib/api/scale";
import { CATALOG_ITEMS_QUERY_KEY } from "./catalog-query-keys";

// P7 · İşveren Hakedişi ekranları — yazma/aksiyon uçları. Tipler `pnpm gen:api`
// çıktısından takma ad olarak alınır; elle arayüz yazmak yasak.
export type ProgressPaymentCreate = DeepScale<components["schemas"]["ProgressPaymentCreate"]>;
export type ProgressPaymentUpdate = DeepScale<components["schemas"]["ProgressPaymentUpdate"]>;
export type ProgressPaymentLinesSave = DeepScale<components["schemas"]["ProgressPaymentLinesSave"]>;
// P7 T5 eklemesi: `ProgressPaymentLineInput` şemada zaten üretilmişti
// (`ProgressPaymentCreate.lines[]` / `ProgressPaymentLinesSave.lines[]`
// içinde kullanılıyordu) ama takma ad olarak DIŞA AKTARILMAMIŞTI — hakediş
// formunun pivot modülü (`pivot.ts`) `PUT …/lines` gövdesini üretirken bu
// tipi tek satır şekli olarak kullanır.
// 2026-08-03 openapi devri: backend artık bu şemayı Input/Output olarak İKİYE
// ayırıp üretiyor (`ProgressPaymentLineInput-Input` / `-Output`); düz ad kalktı.
// Burada İSTEK gövdesi üretildiği için `-Input` varyantı kullanılır.
export type ProgressPaymentLineInput = components["schemas"]["ProgressPaymentLineInput-Input"];
export type RejectBody = DeepScale<components["schemas"]["RejectBody"]>;
export type RefreshPricesResponse = DeepScale<components["schemas"]["RefreshPricesResponse"]>;

// Tum yazma/aksiyon hook'lari sonrasi ortak gecersiz kilma: liste (filtre
// varyantlari dahil, prefix eslesme), tekil detay ve — govde `project_id`
// tasiyorsa — proje bazli ozet (spec §9.6, hakedis sayaclari degisir).
function useProgressPaymentInvalidator() {
  const queryClient = useQueryClient();
  /**
   * `affectsLastPrice`: katalog "son fiyat" kaynağı HK = YALNIZ onaylı/ödenmiş hakediş satırı
   * (backend `progress_payments/last_price_provider.py`). Onayı/silmeyi/satır fiyatını değiştiren yazımlar
   * `catalog-items`ı da bayatlatır (5 dk staleTime beklenmez); taslak düzenleme ve "ödendi" kaynak kümesini değiştirmez.
   */
  return (paymentId: string, projectId?: string, affectsLastPrice = false) => {
    if (affectsLastPrice) queryClient.invalidateQueries({ queryKey: [CATALOG_ITEMS_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [PROGRESS_PAYMENTS_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [PROGRESS_PAYMENT_QUERY_KEY, paymentId] });
    if (projectId) {
      queryClient.invalidateQueries({ queryKey: [PROGRESS_PAYMENT_SUMMARY_QUERY_KEY, projectId] });
    }
  };
}

/**
 * Hakediş oluşturma (Ekran 14 → oluştur formu). Yeni hakediş bir proje
 * altında açılır; başarıda o projenin özeti de gecersiz kilinir (sayim degisir).
 */
export function useCreateProgressPayment(): UseMutationResult<
  ProgressPaymentDetail,
  Error,
  { projectId: string; body: ProgressPaymentCreate }
> {
  const invalidate = useProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async ({ projectId, body }) =>
      unwrap(
        await backendClient.POST("/projects/{project_id}/progress-payments", {
          params: { path: { project_id: projectId } },
          body,
        }),
      ),
    onSuccess: (data) => invalidate(data.id, data.project_id),
  });
}

/**
 * Hakediş üst bilgi güncelleme (dönem, açıklama, varsayılan katsayı).
 * Satırlar bu uçtan GEÇMEZ — bkz. `useReplaceProgressPaymentLines`.
 */
export function useUpdateProgressPayment(): UseMutationResult<
  ProgressPaymentDetail,
  Error,
  { paymentId: string; body: ProgressPaymentUpdate }
> {
  const invalidate = useProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async ({ paymentId, body }) =>
      unwrap(
        await backendClient.PATCH("/progress-payments/{payment_id}", {
          params: { path: { payment_id: paymentId } },
          body,
        }),
      ),
    onSuccess: (data) => invalidate(data.id, data.project_id),
  });
}

/**
 * Hakediş satırlarını DEĞİŞTİRİR (PUT semantiği): gövdede geçmeyen her satır
 * SİLİNİR. İsimlendirme bilinçli — "update" değil "replace". Ekrandan
 * çağrılırken TÜM güncel satır listesi (kalıcı kalması gerekenler dahil)
 * gönderilmelidir; kısmi liste veri kaybına yol açar.
 */
export function useReplaceProgressPaymentLines(): UseMutationResult<
  ProgressPaymentDetail,
  Error,
  { paymentId: string; body: ProgressPaymentLinesSave }
> {
  const invalidate = useProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async ({ paymentId, body }) =>
      unwrap(
        await backendClient.PUT("/progress-payments/{payment_id}/lines", {
          params: { path: { payment_id: paymentId } },
          body,
        }),
      ),
    onSuccess: (data) => invalidate(data.id, data.project_id),
  });
}

// Durum aksiyonları (spec §7) — govde almazlar, yalniz payment_id. Dort ucun
// yolu literal string oldugundan (openapi-fetch tip cikarimi govde/parametre
// seklini uctan uca dogrular) ortak bir factory'ye sarilmiyor — dinamik yol
// olusturmak `as` ile tip zorlamayi gerektirirdi, bu da yasak (`as any` degil
// ama ayni riski tasir: yanlis uc adi calisma zamanina kadar yakalanmaz).

/** Taslak → beklemede (spec §7.1). */
export function useSubmitProgressPayment(): UseMutationResult<ProgressPaymentDetail, Error, string> {
  const invalidate = useProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async (paymentId: string) =>
      unwrap(
        await backendClient.POST("/progress-payments/{payment_id}/submit", {
          params: { path: { payment_id: paymentId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.id, data.project_id),
  });
}

/** Beklemede → onaylandı (spec §7.2). */
export function useApproveProgressPayment(): UseMutationResult<ProgressPaymentDetail, Error, string> {
  const invalidate = useProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async (paymentId: string) =>
      unwrap(
        await backendClient.POST("/progress-payments/{payment_id}/approve", {
          params: { path: { payment_id: paymentId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.id, data.project_id, true),
  });
}

/** Onaylandı → ödendi (spec §7.3). */
export function useMarkProgressPaymentPaid(): UseMutationResult<ProgressPaymentDetail, Error, string> {
  const invalidate = useProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async (paymentId: string) =>
      unwrap(
        await backendClient.POST("/progress-payments/{payment_id}/mark-paid", {
          params: { path: { payment_id: paymentId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.id, data.project_id),
  });
}

/** Onaylandı → beklemede (onay geri alma, spec §7.4). */
export function useUnapproveProgressPayment(): UseMutationResult<ProgressPaymentDetail, Error, string> {
  const invalidate = useProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async (paymentId: string) =>
      unwrap(
        await backendClient.POST("/progress-payments/{payment_id}/unapprove", {
          params: { path: { payment_id: paymentId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.id, data.project_id, true),
  });
}

/**
 * Beklemede → taslak + red gerekçesi (spec §7). Şemadaki alan adı `reason`'dır
 * (`RejectBody`).
 *
 * 🔴 GÖVDE VE `reason` ZORUNLUDUR — backend `d888591` (OK-1A K2) bunu KIRICI
 * biçimde değiştirdi; eskiden uç `RejectBody | None` kabul ediyordu ve bu hook
 * gerekçe verilmeyince `body: null` gönderiyordu. Artık gövdesiz ya da
 * boş/yalnız boşluktan oluşan gerekçeyle atılan istek 422 döner (kırpma tek
 * kopya `approvals.service.clean_reject_reason`tadır — `min_length` DEĞİL,
 * çünkü "   " üç karakterdir). Bu yüzden `body` isteğe bağlı DEĞİLDİR: boş
 * gerekçeyi tipin kendisi reddeder, çağıran ekran kırpılmış metni verir.
 *
 * DEĞİŞMEYEN: gerekçe bu ailede hiçbir kolona yazılmaz, tek kalıcı izi denetim
 * günlüğüdür (K2 gerekçenin ZORUNLULUĞUNU bağladı, DEPOLANDIĞI yeri değil).
 */
export function useRejectProgressPayment(): UseMutationResult<
  ProgressPaymentDetail,
  Error,
  { paymentId: string; body: RejectBody }
> {
  const invalidate = useProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async ({ paymentId, body }) =>
      unwrap(
        await backendClient.POST("/progress-payments/{payment_id}/reject", {
          params: { path: { payment_id: paymentId } },
          body,
        }),
      ),
    onSuccess: (data) => invalidate(data.id, data.project_id),
  });
}

/**
 * Fiyat/katsayı tazeleme (spec §5.1/§9.3): yalnız `draft`'ta, bağı kopmamış
 * satırların snapshot beşlisi + hakedişin yüzde üçlüsünü kalemden/sözleşmeden
 * tazeler. Yanıt YALNIZ `{refreshed_count}` döner — güncel ekran ayrı bir
 * detay sorgusuyla okunur, bu yüzden burada detay sorgusu gecersiz kilinir
 * (govde detay tipini tasimadigindan `data` yerine cagiranin verdigi id kullanilir).
 */
export function useRefreshProgressPaymentPrices(): UseMutationResult<
  RefreshPricesResponse,
  Error,
  string
> {
  const invalidate = useProgressPaymentInvalidator();
  return useMutation({
    mutationFn: async (paymentId: string) =>
      unwrap(
        await backendClient.POST("/progress-payments/{payment_id}/refresh-prices", {
          params: { path: { payment_id: paymentId } },
        }),
      ),
    onSuccess: (_data, paymentId) => invalidate(paymentId, undefined, true),
  });
}
