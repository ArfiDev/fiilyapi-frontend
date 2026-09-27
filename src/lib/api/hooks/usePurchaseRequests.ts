import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-SA T1 · Satınalma — talep listesi (SAT tablosu) + talep detayı (TEK
// ekranının özet şeridi ve FST'nin okuması). `useStockSummary.ts` /
// `useSales.ts` deseniyle aynı: tipler `pnpm gen:api` çıktısından takma ad
// olarak alınır, elle arayüz yazmak yasak.
export type PurchaseRequestListResponse = DeepScale<components["schemas"]["PurchaseRequestListResponse"]>;
export type PurchaseRequestListRow = DeepScale<components["schemas"]["PurchaseRequestListRow"]>;
export type PurchaseRequestResponse = DeepScale<components["schemas"]["PurchaseRequestResponse"]>;
export type PurchaseRequestLineResponse = DeepScale<components["schemas"]["PurchaseRequestLineResponse"]>;
export type PurchaseRequestStatus = components["schemas"]["PurchaseRequestStatus"];
export type PurchasePriority = components["schemas"]["PurchasePriority"];

export const PURCHASE_REQUESTS_QUERY_KEY = "purchase-requests";
export const PURCHASE_REQUEST_QUERY_KEY = "purchase-request";

/**
 * `GET /purchase-requests` süzgeçleri — HEPSİ SUNUCUDA vardır (openapi.json
 * `parameters`: `status` · `project_id` · `priority` · `q` · `limit` ·
 * `offset`). Spec §1'in SAT yüzeyinde istenen üç süzgecin üçü de sunucuya
 * düşer, istemcide süzülen HİÇBİR ŞEY YOKTUR:
 *   · sekme şeridi (SAT 89-94)  → `status` (K3: "Teklifler" sekmesi =
 *     `status=quote_wait`; talep-bağımsız teklif listesi İCAT EDİLMEZ),
 *   · proje süzgeci             → `project_id`,
 *   · arama                     → `q`.
 * `priority` süzgeci mockup'ta YOKTUR ama uç destekler — arayüzde açık
 * bırakılır, ekran kullanmazsa gönderilmez (undefined alan query'ye KONMAZ;
 * uydurma parametre 422 üretirdi, boş string ise sunucuda "boş arama" değil
 * GERÇEK bir süzgeç sayılabilir).
 *
 * ⚠️ SAYFALIDIR: `limit` varsayılanı 50, tavanı 200 ve yanıt `total` taşır →
 * `items.length < total` ise elde TAM liste yoktur. Kırpılma korkuluğu
 * (`src/lib/list-truncation.ts`) bu uçta UYGULANIR (T2'nin işi).
 */
export interface PurchaseRequestListFilter {
  status?: PurchaseRequestStatus;
  projectId?: string;
  priority?: PurchasePriority;
  q?: string;
  limit?: number;
  offset?: number;
}

export function usePurchaseRequests(
  filter: PurchaseRequestListFilter = {},
): UseQueryResult<PurchaseRequestListResponse, Error> {
  return useQuery({
    queryKey: [
      PURCHASE_REQUESTS_QUERY_KEY,
      filter.status ?? null,
      filter.projectId ?? null,
      filter.priority ?? null,
      filter.q ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/purchase-requests", {
          params: {
            query: {
              ...(filter.status !== undefined ? { status: filter.status } : {}),
              ...(filter.projectId ? { project_id: filter.projectId } : {}),
              ...(filter.priority !== undefined ? { priority: filter.priority } : {}),
              ...(filter.q ? { q: filter.q } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}

/**
 * Tek talep (`GET /purchase-requests/{request_id}`) — liste satırından FARKLI
 * bir gövdedir: `PurchaseRequestListRow` KALEM TAŞIMAZ (şema açıklaması:
 * "SAT tablosunun bir satiri — KALEMLERI TASIMAZ"), yalnız `line_count`
 * verir. Kalem adı/miktarı/`current_stock` gereken her yüzey (TEK'in talep
 * özeti şeridi, FST'nin okuması) BU ucu çağırmak ZORUNDADIR; liste
 * satırından türetmeye çalışmak veri uydurmaktır.
 */
export function usePurchaseRequest(
  requestId: string,
): UseQueryResult<PurchaseRequestResponse, Error> {
  return useQuery({
    // `useSale`/`useBoq` deseni: boş id ile ağa çıkılmaz.
    enabled: requestId.length > 0,
    queryKey: [PURCHASE_REQUEST_QUERY_KEY, requestId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/purchase-requests/{request_id}", {
          params: { path: { request_id: requestId } },
        }),
      ),
  });
}
