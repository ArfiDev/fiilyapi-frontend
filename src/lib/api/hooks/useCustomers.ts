import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-P8 T1 · Satış ekranları — müşteri okuma sorgusu (`GET /customers`).
// `usePersonnel.ts` / `useEmployers.ts` deseniyle AYNI: tipler `pnpm gen:api`
// çıktısından takma ad olarak alınır, elle arayüz yazmak yasak.
export type CustomerListResponse = DeepScale<components["schemas"]["CustomerListResponse"]>;
export type CustomerResponse = DeepScale<components["schemas"]["CustomerResponse"]>;
export type CustomerType = components["schemas"]["CustomerType"];

export const CUSTOMERS_QUERY_KEY = "customers";

/**
 * `GET /customers` SAYFASIZDIR — openapi'de TEK query parametresi `q` vardır,
 * `limit`/`offset` YOKTUR ve yanıt (`CustomerListResponse`) yalnız `items`
 * taşır, `total` YOKTUR. Bu yüzden kırpılma (truncation) korkuluğu
 * (`src/lib/list-truncation.ts`) bu uçta UYGULANMAZ — kırpılma diye bir olgu
 * yok. Uydurma `limit` göndermek 422 üretir.
 *
 * `q` sunucuda AD / TCKN / VKN üzerinde kısmi arar (P8 backend kararı).
 */
export interface CustomerListFilter {
  q?: string;
}

export function useCustomers(
  filter: CustomerListFilter = {},
): UseQueryResult<CustomerListResponse, Error> {
  return useQuery({
    queryKey: [CUSTOMERS_QUERY_KEY, filter.q ?? null],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/customers", {
          params: { query: { ...(filter.q ? { q: filter.q } : {}) } },
        }),
      ),
  });
}
