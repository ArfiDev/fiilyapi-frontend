import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type {
  WorkDisciplineRead,
  WorkItemCreate,
  WorkItemRead,
  WorkItemUpdate,
} from "@/lib/api/models";

import {
  CATALOG_DISCIPLINES_QUERY_KEY,
  CATALOG_ITEMS_QUERY_KEY,
  EV_CATALOG_QUERY_KEY,
  EV_DISCIPLINES_QUERY_KEY,
} from "./catalog-query-keys";

/**
 * TKL-F1.2 · Çekirdek İş Kalemi Kataloğu (`/catalog/*`) — FİYATLI, `contracts` kapısı.
 *
 * KAT (`/earned-value/catalog`, `useEvCatalog`) AYNI kayıtları fiyatsız gösterir:
 * bir ekrandaki yazma diğerinin önbelleğini bayatlatır → yazma sonrası İKİ anahtar
 * da tazelenir. Ters yön (KAT yazması → `catalog-items`) `useEvCatalog` /
 * `useEvDisciplines` içindedir ve yalnız bu dosyanın anahtar SABİTİNİ ithal eder.
 *
 * 🔴 `poz_no` gövdede ASLA yoktur (sunucu üretir; `WorkItemCreate/Update` tipi taşımaz,
 * backend `extra="forbid"` → 422). PATCH gövdesi çağıranca (F1.3 gövde kurucusu)
 * yalnız DEĞİŞEN alanlarla kurulur; hook gövdeyi olduğu gibi gönderir.
 */
export { CATALOG_DISCIPLINES_QUERY_KEY, CATALOG_ITEMS_QUERY_KEY };

/**
 * Katalog listesi ~1,5 MB / ~1 sn (canlı 1.657 kalem, KAT-F0): ekranlar ve seçiciler AYNI anahtarı paylaşır, taze
 * veri varken yeniden çekilmez. Genel 30 sn yerine 5 dk: katalog nadiren değişir.
 *
 * Tazelik `invalidateQueries` ile korunur (staleTime beklenmez). `last_price` SOKETİNİ besleyen kaynaklar (backend
 * `app/core/last_price` sağlayıcıları) ve onların yazımları:
 *   · SZL — işveren sözleşme kalemi: toplu ekleme (`useBulkCreateEmployerContractItems`), birim fiyat PATCH (`useUpdateEmployerContractItem`)
 *   · HK — ONAYLI/ÖDENMİŞ işveren hakedişi satırı: onayla / onayı geri al / fiyatları tazele / sil (`useProgressPaymentMutations`)
 *   · TKL — KAZANILAN teklif maliyet B.F.: kazanma (`useOfferMutations`) ve teklif seçicisi her açılışta
 * Taşeron hakedişi/sözleşmesi kaynak DEĞİLDİR. Katalog yazımları da (`invalidateCatalogViews`, EV katalog) tazeler.
 * Başka kullanıcının değişikliği en geç 5 dk sonra (ya da sayfa yenilenince) görünür; eski veri anında gösterilip arkada tazelenir.
 */
export const CATALOG_ITEMS_STALE_MS = 5 * 60_000;

/** Tüm liste tek istekte; süzgeç/arama istemcide (KAT deseni). */
export function useCatalogItems(): UseQueryResult<WorkItemRead[], Error> {
  return useQuery({
    queryKey: [CATALOG_ITEMS_QUERY_KEY],
    staleTime: CATALOG_ITEMS_STALE_MS,
    queryFn: async () => unwrap(await backendClient.GET("/catalog/items", {})).items,
  });
}

/** Disiplin seçici/çipler (`contracts:view`) — `useEvDisciplines` DEĞİL (§2.5 sınırı). */
export function useCatalogDisciplines(): UseQueryResult<WorkDisciplineRead[], Error> {
  return useQuery({
    queryKey: [CATALOG_DISCIPLINES_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/catalog/disciplines", {})).items,
  });
}

/**
 * Aynı satır KAT'ta da görünür → iki ekranın önbelleği birlikte tazelenir. KAT disiplin
 * listesi `used_by_item_count` taşır (ÜS-13b kod uyarısı) → o da tazelenir.
 */
function invalidateCatalogViews(qc: QueryClient): Promise<unknown> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: [CATALOG_ITEMS_QUERY_KEY] }),
    qc.invalidateQueries({ queryKey: [EV_CATALOG_QUERY_KEY] }),
    qc.invalidateQueries({ queryKey: [EV_DISCIPLINES_QUERY_KEY] }),
  ]);
}

export function useCreateCatalogItem(): UseMutationResult<WorkItemRead, Error, WorkItemCreate> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: WorkItemCreate) =>
      unwrap(await backendClient.POST("/catalog/items", { body })),
    onSuccess: () => invalidateCatalogViews(qc),
  });
}

export interface UpdateCatalogItemVars {
  id: string;
  body: WorkItemUpdate;
}

export function useUpdateCatalogItem(): UseMutationResult<
  WorkItemRead,
  Error,
  UpdateCatalogItemVars
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: UpdateCatalogItemVars) =>
      unwrap(
        await backendClient.PATCH("/catalog/items/{item_id}", {
          params: { path: { item_id: id } },
          body,
        }),
      ),
    onSuccess: () => invalidateCatalogViews(qc),
  });
}
