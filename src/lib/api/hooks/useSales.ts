import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-P8 T1 · Satış Yönetimi (SY) — satış listesi (`GET /projects/{id}/sales`).
// Tipler `pnpm gen:api` çıktısından takma ad olarak alınır; elle arayüz yazmak
// yasak.
export type UnitSaleListResponse = DeepScale<components["schemas"]["UnitSaleListResponse"]>;
export type UnitSaleResponse = DeepScale<components["schemas"]["UnitSaleResponse"]>;
export type UnitSaleTotals = DeepScale<components["schemas"]["UnitSaleTotals"]>;
export type UnitSaleStatus = components["schemas"]["UnitSaleStatus"];
export type SaleType = components["schemas"]["SaleType"];
export type PaymentPlanType = components["schemas"]["PaymentPlanType"];
export type DeedCondition = components["schemas"]["DeedCondition"];

export const SALES_QUERY_KEY = "sales";
export const SALE_QUERY_KEY = "sale";

/**
 * ⚠️ BU UÇ SÜZGEÇ ALMAZ VE SAYFASIZDIR — openapi'de `GET
 * /projects/{project_id}/sales` yolunun query parametresi HİÇ YOKTUR
 * (`parameters` yalnız `project_id` path'idir) ve `UnitSaleListResponse`
 * `total`/`limit`/`offset` TAŞIMAZ; `totals` bir SAYFALAMA alanı değil,
 * tablonun `tfoot` toplamıdır (`count` · `sale_price_total` · `paid_total` ·
 * `remaining_total`).
 *
 * İki sonucu vardır:
 * 1. **Kırpılma korkuluğu (`src/lib/list-truncation.ts`) UYGULANMAZ** — sayfalı
 *    uç yok, kırpılma diye bir olgu yok. `tfoot` toplamları sunucudan geldiği
 *    için `items`ten yeniden toplanmaz.
 * 2. **SY'nin durum süzgeci (mockup 146) İSTEMCİ TARAFINDADIR.** Uydurma bir
 *    `status` query parametresi gönderilirse backend 422 verir. Süzgeci ekran
 *    `items` üzerinde uygular; `totals` ise SÜZÜLMEMİŞ kümenin toplamıdır —
 *    süzgeç açıkken `tfoot` sunucu toplamıyla BASILMAZ (T2'nin işi).
 */
export function useSales(projectId: string): UseQueryResult<UnitSaleListResponse, Error> {
  return useQuery({
    // `useBoq`/`useProgressPayment` deseni: boş id ile ağa çıkılmaz.
    enabled: projectId.length > 0,
    queryKey: [SALES_QUERY_KEY, projectId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/sales", {
          params: { path: { project_id: projectId } },
        }),
      ),
  });
}

/**
 * Tek satış kaydı (`GET /sales/{sale_id}`). DS formu `?unit=`/satış bağlamıyla
 * açıldığında ve plan üretimi sonrası satışın sunucu türevlerini (`paid_amount`,
 * `remaining_amount`, `unit_cost`, `sale_profit`) tazelemek için kullanılır.
 */
export function useSale(saleId: string): UseQueryResult<UnitSaleResponse, Error> {
  return useQuery({
    enabled: saleId.length > 0,
    queryKey: [SALE_QUERY_KEY, saleId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sales/{sale_id}", {
          params: { path: { sale_id: saleId } },
        }),
      ),
  });
}
