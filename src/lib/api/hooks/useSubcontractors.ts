import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-PT T4 · Personel formunun "Bağlı Taşeron" seçicisi (mockup satır 95).
// Mockup'taki üç SABİT taşeron adı ("Akın İnşaat" vb.) örnek veridir —
// kopyalanmaz; liste GERÇEK `GET /subcontractors` ucundan gelir.
//
// BFF: `subcontractors` kökü izin listesinde ZATEN vardır
// (`src/app/api/backend/[...path]/route.ts`, F-TH T1'de eklendi) — yeni kök
// EKLENMEZ.
//
// ⚠️ Bu uçta sayfalama YOKTUR (`SubcontractorListResponse` yalnız `items`
// taşır) — `total`/`limit` kırpılma kavramı burada anlamsızdır.

export type SubcontractorListResponse = DeepScale<components["schemas"]["SubcontractorListResponse"]>;
export type SubcontractorListItem = DeepScale<components["schemas"]["SubcontractorResponse"]>;

export const SUBCONTRACTORS_QUERY_KEY = "subcontractors";

export interface SubcontractorsFilter {
  /** Varsayılan `true` (sunucu varsayılanı) — pasif taşeronlar listelenmez. */
  activeOnly?: boolean;
}

export function useSubcontractors(
  filter: SubcontractorsFilter = {},
): UseQueryResult<SubcontractorListResponse, Error> {
  return useQuery({
    queryKey: [SUBCONTRACTORS_QUERY_KEY, filter.activeOnly ?? null],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/subcontractors", {
          params: {
            query: {
              ...(filter.activeOnly !== undefined ? { active_only: filter.activeOnly } : {}),
            },
          },
        }),
      ),
  });
}
