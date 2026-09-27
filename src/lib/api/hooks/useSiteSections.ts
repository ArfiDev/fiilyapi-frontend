import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-PL T5 · Planlama ızgarasında satır açarken bölüm SEÇİLEBİLİR olmalı
// (spec §3). Grupları yalnız mevcut satırlardan türeten okuma ucu, henüz satırı
// olmayan bölümü hiç göstermez; bu hook o boşluğu kapatır: şantiyenin TÜM
// bölümleri buradan gelir.
//
// `useSites`/`useSection` deseniyle aynı: tipler `pnpm gen:api` çıktısından
// takma ad olarak alınır, elle arayüz yazılmaz. BFF kökü `sites` — zaten
// izinlidir (`/sites/{site_id}/sections`), yeni kök eklenmez.
export type SectionListResponse = DeepScale<components["schemas"]["SectionListResponse"]>;
export type SectionListItem = DeepScale<components["schemas"]["SectionResponse"]>;

export const SITE_SECTIONS_QUERY_KEY = "site-sections";

/**
 * Şantiyenin bölüm listesi (`GET /sites/{site_id}/sections`).
 *
 * Boş `siteId` ile ağa ÇIKILMAZ: drill kabuğu şantiye seviyesinde değilken bu
 * hook boş id ile çağrılabilir (hook'lar koşullu çağrılamaz).
 */
export function useSiteSections(siteId: string): UseQueryResult<SectionListResponse, Error> {
  return useQuery({
    enabled: siteId.length > 0,
    queryKey: [SITE_SECTIONS_QUERY_KEY, siteId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sites/{site_id}/sections", {
          params: { path: { site_id: siteId } },
        }),
      ),
  });
}
