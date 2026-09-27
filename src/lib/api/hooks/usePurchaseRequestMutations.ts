import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import {
  PURCHASE_REQUESTS_QUERY_KEY,
  PURCHASE_REQUEST_QUERY_KEY,
} from "./usePurchaseRequests";
import { PURCHASING_SUMMARY_QUERY_KEY } from "./usePurchasingSummary";
import type { DeepScale } from "@/lib/api/scale";

// F-SA T1 · Talep yazma yüzeyi — FST'nin "Taslak Kaydet" + "Onaya Gönder"
// düğmeleri (spec §1) buradan beslenir.
//
// ⚠️ KALICI KARAR (spec K6): `POST /purchase-requests/{id}/approve` ve
// `.../reject` uçlarına BU DOSYADA hook YAZILMAZ — onay/red EKRANI ayrı bir
// dilimdir ("Onay Kutusu"). Buraya onay/red hook'u eklemek = review bulgusu.
//
// ✅ F-OK T5 (2026-08-23): o dilim YAZILDI. İki ucun TEK evi
// `src/lib/api/hooks/useApprovals.ts`tir (`useApproveApprovalItem` /
// `useRejectApprovalItem`) ve orada üç evrak ailesini birlikte dağıtır —
// buraya bir KOPYA formül açılmaz.
//
// ⚠️ `DELETE /purchase-requests/{id}` de basılmaz: SAT tablosunda silme
// düğmesi yoktur (`can_delete` alanı yanıtta durur ama ekranı yoktur).
export type PurchaseRequestCreate = DeepScale<components["schemas"]["PurchaseRequestCreate"]>;
export type PurchaseRequestUpdate = DeepScale<components["schemas"]["PurchaseRequestUpdate"]>;
export type PurchaseRequestLineCreate = DeepScale<components["schemas"]["PurchaseRequestLineCreate"]>;
export type PurchaseRequestResponse = DeepScale<components["schemas"]["PurchaseRequestResponse"]>;

/**
 * Bir talep yazıldığında/durumu değiştiğinde BAYATLAYAN üç şey vardır: SAT
 * tablosu, o talebin detayı ve KPI şeridi (durum sayaçları taleplerden
 * türer). Üçü birlikte geçersiz kılınır — biri unutulursa ekran eski durumu
 * ya da eski sayacı basmaya devam eder.
 */
function useInvalidatePurchaseRequest(): (requestId?: string) => void {
  const queryClient = useQueryClient();
  return (requestId?: string) => {
    queryClient.invalidateQueries({ queryKey: [PURCHASE_REQUESTS_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [PURCHASING_SUMMARY_QUERY_KEY] });
    if (requestId) {
      queryClient.invalidateQueries({ queryKey: [PURCHASE_REQUEST_QUERY_KEY, requestId] });
    }
  };
}

/**
 * "Taslak Kaydet" (`POST /purchase-requests`) — başlık + kalemler TEK gövdede
 * yazılır, talep `draft` doğar. Zorunlu tek alan `project_id`dir.
 *
 * `request_no` GÖVDEDE YOKTUR: numarayı SUNUCU üretir (`SAT-YYYY-NNNN`) ve
 * FST 53'teki alan SALT-OKUNUR basılır — istemci numara uydurmaz.
 *
 * `lines[].sort_order` da gövdede yoktur; sunucu dizinin indeksinden üretir.
 */
export function useCreatePurchaseRequest(): UseMutationResult<
  PurchaseRequestResponse,
  Error,
  PurchaseRequestCreate
> {
  const invalidate = useInvalidatePurchaseRequest();
  return useMutation({
    mutationFn: async (body) => unwrap(await backendClient.POST("/purchase-requests", { body })),
    onSuccess: (data) => invalidate(data.id),
  });
}

/**
 * `PATCH /purchase-requests/{request_id}` — KISMİ günceller.
 *
 * ⚠️ `lines` KISMİ DEĞİL, TAM DEĞİŞTİRMEDİR: gövdeye konursa talebin kalem
 * listesi gönderilen diziyle YER DEĞİŞTİRİR. Formda tek satır düzenlenmiş
 * olsa bile dizinin TAMAMI gönderilir; yalnız değişen satırı yollamak diğer
 * kalemleri SİLER. Kalemler hiç değişmediyse anahtar gövdeye KONMAZ
 * (F-PT2 kararı 5: anahtarı atlamak da fazladan koymak da veri yalanıdır).
 */
export function useUpdatePurchaseRequest(
  requestId: string,
): UseMutationResult<PurchaseRequestResponse, Error, PurchaseRequestUpdate> {
  const invalidate = useInvalidatePurchaseRequest();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PATCH("/purchase-requests/{request_id}", {
          params: { path: { request_id: requestId } },
          body,
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}

/**
 * "Onaya Gönder" (`POST /purchase-requests/{request_id}/submit`) — talebi
 * `draft` → `pending_approval` yapar. GÖVDESİZDİR.
 *
 * Onay EŞİĞİ (₺500K) bir İSTEMCİ KURALI DEĞİLDİR: gönderim her zaman aynı
 * uçtan geçer, eşiği ve yetkiyi SUNUCU uygular. FST'nin onay akışı kutusu
 * yalnız bilgilendiricidir ve eşik metni TEK kaynaktan okunur (spec K6) —
 * iki ayrı yere hardcode edilmez.
 */
export function useSubmitPurchaseRequest(
  requestId: string,
): UseMutationResult<PurchaseRequestResponse, Error, void> {
  const invalidate = useInvalidatePurchaseRequest();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await backendClient.POST("/purchase-requests/{request_id}/submit", {
          params: { path: { request_id: requestId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.id),
  });
}
