import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// P6 · Bölüm Detay ekranı tekil kaynağı (spec §5). `SectionResponse`ten
// TÜREYEN dar govdeden farkli olarak TUM P6 kolonlarini + 4 yer tutucuyu
// (progress_pct/boq_item_count/budget/worker_count) tasir.
export type SectionDetailResponse = DeepScale<components["schemas"]["SectionDetailResponse"]>;

export const SECTION_QUERY_KEY = "section";

// `useSite`/`useBoq` deseniyle ayni: sectionId bos oldugunda aga cikilmaz —
// drill kabugu henuz bir bolum secmediginde hook bos id ile cagrilabilir
// (hook'lar kosullu cagrilamaz).
/**
 * URL-3 · bölüm anahtarının KAPSAMI — İKİ BASAMAKLIDIR.
 *
 * `sections.slug` ŞANTİYE İÇİNDE tekildir; şantiye anahtarı da slug olabilir
 * ve O da PROJE İÇİNDE tekildir. Bu yüzden uç iki süzgeç birden alır
 * (`?site=` + `?project=`) ve belirsizlikte **fail-closed 404** verir.
 * Rotamız (`/projeler/<p>/santiyeler/<s>/bolumler/<b>`) üç basamağı da
 * taşıdığı için kapsam her zaman elimizdedir.
 */
export interface SectionScope {
  /** Şantiye kapsamı — slug VEYA UUID. */
  site?: string;
  /** Şantiye anahtarı slug ise ONU tekilleştiren proje kapsamı. */
  project?: string;
}

export function useSection(
  sectionId: string,
  scope: SectionScope = {},
): UseQueryResult<SectionDetailResponse, Error> {
  const site = scope.site ?? "";
  const project = scope.project ?? "";
  return useQuery({
    enabled: sectionId.length > 0,
    // Kapsam anahtarın ANLAMINI değiştirir → önbellek anahtarının parçası.
    queryKey: [SECTION_QUERY_KEY, sectionId, site, project],
    queryFn: async () => {
      const query = {
        ...(site.length > 0 ? { site } : {}),
        ...(project.length > 0 ? { project } : {}),
      };
      return unwrap(
        await backendClient.GET("/sections/{section_id}", {
          params: {
            path: { section_id: sectionId },
            ...(Object.keys(query).length > 0 ? { query } : {}),
          },
        }),
      );
    },
  });
}
