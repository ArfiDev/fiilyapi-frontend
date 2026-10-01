import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// GKS-F1.2a · Günlük kayıt ÖNİZLEMESİ — kayıt açılmadan iş kalemi iskeleti
// (`GET /sites/{site_id}/diary/skeleton`, kural A). `useSiteDiary.ts` ile
// AYNI desen; AYRI dosyadır: `useSiteDiary`yi kapalı fabrikayla taklit eden
// ekran testleri bu hook yüzünden kırılmasın.
export type SiteDiarySkeleton = DeepScale<components["schemas"]["SiteDiarySkeleton"]>;
export type SiteDiarySkeletonLine = DeepScale<components["schemas"]["SiteDiarySkeletonLine"]>;

export const SITE_DIARY_SKELETON_QUERY_KEY = "site-diary-skeleton";

/** Tek anahtar üretici: şantiye + gün + bölüm (`""` = bölüm seçilmedi). */
export function siteDiarySkeletonQueryKey(siteId: string, entryDate: string, sectionId: string): readonly unknown[] {
  return [SITE_DIARY_SKELETON_QUERY_KEY, siteId, entryDate, sectionId];
}

export interface SiteDiarySkeletonOptions {
  /**
   * Varsayılan `true`. Çağıran yalnız "gün için liste eşleşmesi YOKKEN" açar;
   * `skipToken` KULLANILMAZ (gözlemcisi paylaşılan sorgu seçeneklerini ezer).
   */
  enabled?: boolean;
}

/**
 * Kayıtsız günün iskeleti. `sectionId` boşsa `section_id` parametresi
 * GÖNDERİLMEZ (bölüm seçilmedi → şantiye geneli kural A iskeleti).
 */
export function useSiteDiarySkeleton(
  siteId: string,
  entryDate: string,
  sectionId: string,
  options: SiteDiarySkeletonOptions = {},
): UseQueryResult<SiteDiarySkeleton, Error> {
  const { enabled = true } = options;
  return useQuery({
    enabled: enabled && siteId.length > 0 && entryDate.length > 0,
    queryKey: siteDiarySkeletonQueryKey(siteId, entryDate, sectionId),
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sites/{site_id}/diary/skeleton", {
          params: {
            path: { site_id: siteId },
            query: { entry_date: entryDate, ...(sectionId !== "" ? { section_id: sectionId } : {}) },
          },
        }),
      ),
  });
}
