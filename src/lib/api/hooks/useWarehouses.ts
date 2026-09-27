import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-ST T1 · Depo listesi (`GET /warehouses`). Stok giriş formunun (SG) depo
// alanı ve "+ Depo Ekle" diyalogu bu listeyi tüketir.
export type WarehouseListResponse = DeepScale<components["schemas"]["WarehouseListResponse"]>;
export type WarehouseResponse = DeepScale<components["schemas"]["WarehouseResponse"]>;

export const WAREHOUSES_QUERY_KEY = "warehouses";

/**
 * Uçta YALNIZ sayfalama vardır; `site_id` süzgeci YOKTUR (openapi.json).
 * Şantiye deposu ile merkez deposu ayrımı satırın `site_id` alanından
 * yapılır: `null` ⇒ MERKEZ DEPO (backend spec §7 S2b). Süzme İSTEMCİDE
 * yapılır ve uydurma bir sorgu parametresi gönderilmez.
 */
export interface WarehouseListFilter {
  limit?: number;
  offset?: number;
}

export function useWarehouses(
  filter: WarehouseListFilter = {},
): UseQueryResult<WarehouseListResponse, Error> {
  return useQuery({
    queryKey: [WAREHOUSES_QUERY_KEY, filter.limit ?? null, filter.offset ?? null],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/warehouses", {
          params: {
            query: {
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}
