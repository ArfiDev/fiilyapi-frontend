import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-SA T1 · Satınalma — sipariş listesi (SIP 45-125).
export type PurchaseOrderListResponse = DeepScale<components["schemas"]["PurchaseOrderListResponse"]>;
export type PurchaseOrderResponse = DeepScale<components["schemas"]["PurchaseOrderResponse"]>;
export type PurchaseOrderStatus = components["schemas"]["PurchaseOrderStatus"];

export const PURCHASE_ORDERS_QUERY_KEY = "purchase-orders";

/**
 * `GET /purchase-orders` süzgeçleri — HEPSİ SUNUCUDA (openapi `parameters`:
 * `status` · `project_id` · `supplier_id` · `q` · `limit` · `offset`).
 * SIP 34'ün filtre seçicisi bunlardan biriyle karşılanır; istemcide süzülen
 * hiçbir şey YOKTUR.
 *
 * ⚠️ TESLİMAT TARİHİ RENGİ (SIP tablosu) İSTEMCİ TÜREVİDİR (spec §1) —
 * sunucu `expected_delivery` tarihini verir, "gecikti/yaklaşıyor" sınıfını
 * ekran hesaplar. Bu bir süzgeç DEĞİLDİR: uydurma bir `overdue` query
 * parametresi 422 üretir.
 *
 * SAYFALIDIR (`limit` 50/200 + yanıtta `total`) → kırpılma korkuluğu
 * (`src/lib/list-truncation.ts`) burada UYGULANIR (T3'ün işi).
 */
export interface PurchaseOrderListFilter {
  status?: PurchaseOrderStatus;
  projectId?: string;
  supplierId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function usePurchaseOrders(
  filter: PurchaseOrderListFilter = {},
): UseQueryResult<PurchaseOrderListResponse, Error> {
  return useQuery({
    queryKey: [
      PURCHASE_ORDERS_QUERY_KEY,
      filter.status ?? null,
      filter.projectId ?? null,
      filter.supplierId ?? null,
      filter.q ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/purchase-orders", {
          params: {
            query: {
              ...(filter.status !== undefined ? { status: filter.status } : {}),
              ...(filter.projectId ? { project_id: filter.projectId } : {}),
              ...(filter.supplierId ? { supplier_id: filter.supplierId } : {}),
              ...(filter.q ? { q: filter.q } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}
