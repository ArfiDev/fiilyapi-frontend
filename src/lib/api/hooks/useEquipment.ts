import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MK T2 · Makine & Ekipman — ekipman liste sorgusu. `useStockItems.ts` /
// `usePersonnel.ts` deseniyle AYNI: tipler `pnpm gen:api` çıktısından takma ad
// olarak alınır, elle arayüz yazılmaz.
export type EquipmentListResponse = components["schemas"]["EquipmentListResponse"];
export type EquipmentResponse = DeepScale<components["schemas"]["EquipmentResponse"]>;
export type EquipmentCategory = components["schemas"]["EquipmentCategory"];
export type EquipmentStatus = components["schemas"]["EquipmentStatus"];
export type EquipmentOwnership = components["schemas"]["EquipmentOwnership"];
// F-MK T5 · M4'ün norm birimi (Lt/saat · Lt/km) — `EquipmentResponse.norm_unit`.
export type EquipmentNormUnit = components["schemas"]["EquipmentNormUnit"];

export const EQUIPMENT_QUERY_KEY = "equipment";

/**
 * `GET /equipment` `limit` tavanı (openapi.json: `maximum: 200`). Sunucu
 * varsayılanı `50`dir — TB3/F-TH kırpma korkuluğu dersi: her çağıran `limit`i
 * AÇIKÇA gönderir, `total` ile kırpılma `buildListTruncation` üzerinden
 * GÖRÜNÜR kılınır (`src/lib/list-truncation.ts`).
 */
export const EQUIPMENT_LIST_MAX_LIMIT = 200;

/** `GET /equipment` süzgeçleri (openapi.json query parametreleri). */
export interface EquipmentListFilter {
  status?: EquipmentStatus;
  category?: EquipmentCategory;
  siteId?: string;
  ownership?: EquipmentOwnership;
  q?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export function useEquipment(
  filter: EquipmentListFilter = {},
): UseQueryResult<EquipmentListResponse, Error> {
  return useQuery({
    queryKey: [
      EQUIPMENT_QUERY_KEY,
      filter.status ?? null,
      filter.category ?? null,
      filter.siteId ?? null,
      filter.ownership ?? null,
      filter.q ?? null,
      filter.isActive ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/equipment", {
          params: {
            query: {
              ...(filter.status !== undefined ? { status: filter.status } : {}),
              ...(filter.category !== undefined ? { category: filter.category } : {}),
              ...(filter.siteId !== undefined ? { site_id: filter.siteId } : {}),
              ...(filter.ownership !== undefined ? { ownership: filter.ownership } : {}),
              ...(filter.q ? { q: filter.q } : {}),
              ...(filter.isActive !== undefined ? { is_active: filter.isActive } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}
