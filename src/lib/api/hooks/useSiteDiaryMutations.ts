import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import {
  SITE_DIARY_ENTRIES_QUERY_KEY,
  SITE_DIARY_ENTRY_QUERY_KEY,
  SITE_DIARY_SUMMARY_QUERY_KEY,
  type SiteDiaryEntryDetail,
} from "./useSiteDiary";
import type { DeepScale } from "@/lib/api/scale";

// F-SD T1 · Şantiye Günlüğü — yazma/durum uclari. Tipler `pnpm gen:api`
// ciktisindan takma ad olarak alinir; elle arayuz yazmak yasak.
export type SiteDiaryEntryCreate = DeepScale<components["schemas"]["SiteDiaryEntryCreate"]>;
export type SiteDiaryEntryUpdate = DeepScale<components["schemas"]["SiteDiaryEntryUpdate"]>;
export type SiteDiaryLinesSave = DeepScale<components["schemas"]["SiteDiaryLinesSave"]>;
export type SiteDiaryLineInput = DeepScale<components["schemas"]["SiteDiaryLineInput"]>;
export type SiteDiaryWorkerCountInput = DeepScale<components["schemas"]["SiteDiaryWorkerCountInput"]>;

/**
 * Tum yazma/durum hook'lari sonrasi ortak gecersiz kilma
 * (`useProgressPaymentMutations` deseni):
 * - liste anahtari SANTIYE bazinda prefix eslesmeyle (yil/ay/sayfalama
 *   varyantlarinin hepsi tazelenir),
 * - tekil detay anahtari,
 * - poz bazli aylik ozet: `submit`/`reopen` bir günü ozete SOKAR ya da
 *   ondan CIKARIR, `lines` ise gonderilmis kaydin toplamini degistirebilir —
 *   bu yuzden her yazmada birlikte tazelenir.
 */
function useSiteDiaryInvalidator() {
  const queryClient = useQueryClient();
  return (siteId: string, entryId?: string) => {
    queryClient.invalidateQueries({ queryKey: [SITE_DIARY_ENTRIES_QUERY_KEY, siteId] });
    queryClient.invalidateQueries({ queryKey: [SITE_DIARY_SUMMARY_QUERY_KEY, siteId] });
    if (entryId) {
      queryClient.invalidateQueries({ queryKey: [SITE_DIARY_ENTRY_QUERY_KEY, entryId] });
    }
  };
}

/**
 * Günlük kayit acma (`POST /sites/{site_id}/diary`). Kayit her zaman `draft`
 * dogar; govde `status`/`worker_counts[]` TASIMAZ. GKS-F1.2a: `lines[]`
 * ONIZLEMEDE girilen satirlari tasiyabilir (sunucu BIRLESTIRIR, silmez —
 * iskelet yine BOQ pozlarindan sunucuda kurulur). Ayni güne ikinci kayit
 * backend'de 409 doner — cagiran ekran bu hatayi Türkçe mesaja cevirir.
 */
export function useCreateSiteDiaryEntry(
  siteId: string,
): UseMutationResult<SiteDiaryEntryDetail, Error, SiteDiaryEntryCreate> {
  const invalidate = useSiteDiaryInvalidator();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/sites/{site_id}/diary", {
          params: { path: { site_id: siteId } },
          body,
        }),
      ),
    onSuccess: (data) => invalidate(siteId, data.id),
  });
}

async function patchSiteDiaryEntry(entryId: string, body: SiteDiaryEntryUpdate): Promise<SiteDiaryEntryDetail> {
  return unwrap(
    await backendClient.PATCH("/diary/{entry_id}", {
      params: { path: { entry_id: entryId } },
      body,
    }),
  );
}

/**
 * Baslik alanlari + isci kirilimi guncelleme (`PATCH /diary/{entry_id}`) —
 * backend YALNIZ `draft` kayitta kabul eder. Hangi santiyenin gecersiz
 * kilinacagi yanittan turetilir (caller'dan ayrica istenmez).
 */
export function useUpdateSiteDiaryEntry(
  entryId: string,
): UseMutationResult<SiteDiaryEntryDetail, Error, SiteDiaryEntryUpdate> {
  const invalidate = useSiteDiaryInvalidator();
  return useMutation({
    mutationFn: (body) => patchSiteDiaryEntry(entryId, body),
    onSuccess: (data) => invalidate(data.site_id, data.id),
  });
}

/**
 * GKS-F1.5 · ayni PATCH, ama kayit kimligi CAGRI ANINDA verilir: kayit yokken
 * ilk "Taslak Kaydet" POST'tan hemen sonra (kimlik henuz ekranin `matchedId`sine
 * yansimadan) isci kirilimini ayni kayda yazar. Govde `useUpdateSiteDiaryEntry`
 * ile ayni `buildDiaryUpdateBody`dir.
 */
export function useUpdateCreatedSiteDiaryEntry(): UseMutationResult<
  SiteDiaryEntryDetail,
  Error,
  { entryId: string; body: SiteDiaryEntryUpdate }
> {
  const invalidate = useSiteDiaryInvalidator();
  return useMutation({
    mutationFn: ({ entryId, body }) => patchSiteDiaryEntry(entryId, body),
    onSuccess: (data) => invalidate(data.site_id, data.id),
  });
}

/**
 * İş Kalemi Girişi tablosunun kaydi (`PUT /diary/{entry_id}/lines`) —
 * DEGISTIRME semantigi: govdede gecmeyen satir SILINIR, bos liste tum
 * satirlari temizler. Kumulatif/₺ turevleri YANITTAN okunur, ekran hesaplamaz.
 *
 * PLN-F2.1: govde `site-diary-save-bodies.buildSiteDiaryLinesSave` ile KAYDIN
 * tam kumesinden kurulur (bolumlu + Bolumsuz); kismi kume = veri kaybi.
 */
export function useSaveSiteDiaryLines(
  entryId: string,
): UseMutationResult<SiteDiaryEntryDetail, Error, SiteDiaryLinesSave> {
  const invalidate = useSiteDiaryInvalidator();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PUT("/diary/{entry_id}/lines", {
          params: { path: { entry_id: entryId } },
          body,
        }),
      ),
    onSuccess: (data) => invalidate(data.site_id, data.id),
  });
}

/**
 * "Kaydet & Gönder" (`POST /diary/{entry_id}/submit`) — kaydi `submitted`
 * yapar ve poz bazli aylik ozete SOKAR. Govde YOKTUR.
 *
 * PLN-F2.1: EV'li santiyede on-kosul saglanmazsa 422 `{detail, reasons[]}`
 * doner — gerekce listesi `error-message.submitBlockedReasons(error)` ile okunur.
 */
export function useSubmitSiteDiaryEntry(
  entryId: string,
): UseMutationResult<SiteDiaryEntryDetail, Error, void> {
  const invalidate = useSiteDiaryInvalidator();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await backendClient.POST("/diary/{entry_id}/submit", {
          params: { path: { entry_id: entryId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.site_id, data.id),
  });
}

/**
 * "Yeniden Aç" (`POST /diary/{entry_id}/reopen`) — gonderilmis kaydi tekrar
 * `draft` yapar (yetki backend'de). Govde YOKTUR.
 */
export function useReopenSiteDiaryEntry(
  entryId: string,
): UseMutationResult<SiteDiaryEntryDetail, Error, void> {
  const invalidate = useSiteDiaryInvalidator();
  return useMutation({
    mutationFn: async () =>
      unwrap(
        await backendClient.POST("/diary/{entry_id}/reopen", {
          params: { path: { entry_id: entryId } },
        }),
      ),
    onSuccess: (data) => invalidate(data.site_id, data.id),
  });
}
