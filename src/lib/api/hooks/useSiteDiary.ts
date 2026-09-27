import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-SD T1 · Şantiye Günlüğü — okuma sorgulari. `useProgressPayments.ts` /
// `useSubcontractorProgressPayments.ts` deseniyle AYNI: tipler `pnpm gen:api`
// ciktisindan takma ad olarak alinir, elle arayuz yazmak yasak.
export type SiteDiaryEntryDetail = components["schemas"]["SiteDiaryEntryDetail"];
export type SiteDiaryEntryListItem = components["schemas"]["SiteDiaryEntryListItem"];
export type SiteDiaryEntryListResponse = components["schemas"]["SiteDiaryEntryListResponse"];
export type SiteDiaryLineRead = components["schemas"]["SiteDiaryLineRead"];
export type SiteDiaryWorkerCountRead = components["schemas"]["SiteDiaryWorkerCountRead"];
/** PLN-F2.1b · G12 — kendi ekip, puantajdan TÜRETİLİR (salt okunur; kayıt yanıtı). */
export type OwnCrewFromTimesheet = components["schemas"]["OwnCrewFromTimesheet"];
// TYPE-F1 SPIKE EK (2026-09-27): DeepScale — `completion_ratio` (fraction)
// otomatik marka'lanır (FIX-F1 Kusur 2 mutantının derleyici karşılığını ölçmek için).
export type SiteDiarySummary = DeepScale<components["schemas"]["SiteDiarySummary"]>;
export type SiteDiarySummaryItem = DeepScale<components["schemas"]["SiteDiarySummaryItem"]>;
export type DiaryStatus = components["schemas"]["DiaryStatus"];
export type Weather = components["schemas"]["Weather"];
export type WorkerSource = components["schemas"]["WorkerSource"];

/** Backend tavanı (`site_diary/router.py` `Query(ge=1, le=200)`); varsayılan
 *  50'dir — kalan-4 #281: tavan AÇIKÇA gönderilmezse 51. kayıt SESSİZCE
 *  düşer (TB3/F-TH kırpılma dersi). */
export const SITE_DIARY_LIST_MAX_LIMIT = 200;

export const SITE_DIARY_ENTRIES_QUERY_KEY = "site-diary-entries";
export const SITE_DIARY_ENTRY_QUERY_KEY = "site-diary-entry";
export const SITE_DIARY_SUMMARY_QUERY_KEY = "site-diary-summary";

/**
 * `GET /sites/{site_id}/diary` filtreleri (openapi.json query parametreleri).
 * `limit` tavani 200, `offset` sayfalama icindir — liste yaniti `total`
 * tasir, sayfalama ekranda ondan turetilir.
 */
export interface SiteDiaryListFilter {
  year?: number;
  month?: number;
  limit?: number;
  offset?: number;
  /**
   * DET-1.1 · Kural A — sunucu süzgeci (`?section_id=`): başlığı bu bölüm
   * olan gün ∪ bu bölüme miktar satırı yazılmış gün. VERİLİP BOŞSA ("")
   * sorgu ağa ÇIKMAZ: bölüm kimliği henüz çözülmemiştir ve süzgeçsiz çağrı
   * şantiyenin TAMAMINI bölüm listesi gibi basardı.
   */
  sectionId?: string;
}

/** `GET /sites/{site_id}/diary/summary` — YALNIZ ay/yil suzmesi alir. */
export interface SiteDiaryPeriodFilter {
  year?: number;
  month?: number;
}

function periodQuery(filter: SiteDiaryPeriodFilter): Record<string, number> {
  return {
    ...(filter.year !== undefined ? { year: filter.year } : {}),
    ...(filter.month !== undefined ? { month: filter.month } : {}),
  };
}

/**
 * Günlük kayit listesi (GK sag panel "Son Kayitlar" + Hakediş Özeti ay
 * gezinmesi). Bos `siteId` ile aga cikilmaz (`useBoq` deseni).
 */
export function useSiteDiaryEntries(
  siteId: string,
  filter: SiteDiaryListFilter = {},
): UseQueryResult<SiteDiaryEntryListResponse, Error> {
  return useQuery({
    enabled: siteId.length > 0 && filter.sectionId !== "",
    // Bölüm süzgeci anahtarın SONUNA eklenir: süzgeçsiz çağıranların anahtarı
    // (ve `[KEY, siteId]` önekli geçersizleştirmeler) DEĞİŞMEZ.
    queryKey: [
      SITE_DIARY_ENTRIES_QUERY_KEY,
      siteId,
      filter.year ?? null,
      filter.month ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
      ...(filter.sectionId !== undefined ? [filter.sectionId] : []),
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sites/{site_id}/diary", {
          params: {
            path: { site_id: siteId },
            query: {
              ...periodQuery(filter),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
              ...(filter.sectionId !== undefined ? { section_id: filter.sectionId } : {}),
            },
          },
        }),
      ),
  });
}

/**
 * Tek günlük kaydin detayi — satirlar (`lines`), isci kirilimi
 * (`worker_counts`) ve turevler (`lines_total`/`worker_total`) bu yanittan
 * gelir; ekran ikinci istek atmaz.
 */
export interface SiteDiaryEntryOptions {
  /**
   * DET-1.1 — bölüm bağlamı (`?section_id=`): `prev_id`/`next_id` bu
   * bölümün Kural A kümesine göre döner. Verilmezse şantiye geneli.
   */
  sectionId?: string;
  /** Varsayılan `true`; bölüm kimliği çözülmeden istek atmamak için. */
  enabled?: boolean;
}

/**
 * Tekil kaydın önbellek anahtarı — TEK üretici. Kırıntı (`useCrumbNames`)
 * aynı anahtara `skipToken` ile bağlanır; elle kopyalansaydı anahtar bir gün
 * ayrıştığında kırıntı sessizce iskelette kalırdı. Bölümsüz çağrının anahtarı
 * BUGÜNKÜYLE aynıdır (`[KEY, id]`).
 */
export function siteDiaryEntryQueryKey(entryId: string, sectionId?: string): readonly unknown[] {
  return sectionId === undefined
    ? [SITE_DIARY_ENTRY_QUERY_KEY, entryId]
    : [SITE_DIARY_ENTRY_QUERY_KEY, entryId, sectionId];
}

export function useSiteDiaryEntry(
  entryId: string,
  options: SiteDiaryEntryOptions = {},
): UseQueryResult<SiteDiaryEntryDetail, Error> {
  const { sectionId, enabled = true } = options;
  return useQuery({
    enabled: enabled && entryId.length > 0,
    queryKey: siteDiaryEntryQueryKey(entryId, sectionId),
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/diary/{entry_id}", {
          params: {
            path: { entry_id: entryId },
            ...(sectionId !== undefined ? { query: { section_id: sectionId } } : {}),
          },
        }),
      ),
  });
}

/**
 * Poz bazli aylik birikim (Hakediş Özeti tablosu). Backend YALNIZ
 * `submitted` günleri toplar — taslak günler bu ucta GORUNMEZ.
 */
export function useSiteDiarySummary(
  siteId: string,
  filter: SiteDiaryPeriodFilter = {},
): UseQueryResult<SiteDiarySummary, Error> {
  return useQuery({
    enabled: siteId.length > 0,
    queryKey: [SITE_DIARY_SUMMARY_QUERY_KEY, siteId, filter.year ?? null, filter.month ?? null],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sites/{site_id}/diary/summary", {
          params: { path: { site_id: siteId }, query: periodQuery(filter) },
        }),
      ),
  });
}
