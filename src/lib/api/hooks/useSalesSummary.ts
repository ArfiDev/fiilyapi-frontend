import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-P8 T1 · Satış Yönetimi (SY) KPI şeridinin + "Yaklaşan Tahsilatlar"
// kartının TEK kaynağı: `GET /projects/{project_id}/sales/summary`.
export type SalesSummaryResponse = DeepScale<components["schemas"]["SalesSummaryResponse"]>;
export type SoldKpi = DeepScale<components["schemas"]["SoldKpi"]>;
export type ReservedKpi = DeepScale<components["schemas"]["ReservedKpi"]>;
export type AvailableUnitsKpi = DeepScale<components["schemas"]["AvailableUnitsKpi"]>;
export type CollectionKpi = DeepScale<components["schemas"]["CollectionKpi"]>;
export type OverdueKpi = DeepScale<components["schemas"]["OverdueKpi"]>;
export type UpcomingCollection = DeepScale<components["schemas"]["UpcomingCollection"]>;
export type ExpiredReservation = DeepScale<components["schemas"]["ExpiredReservation"]>;

export const SALES_SUMMARY_QUERY_KEY = "sales-summary";

/**
 * ✅ SPEC K4 ÇÖZÜLDÜ — KPI'lar GERÇEKTİR, pending zarfa DÜŞÜLMEZ.
 *
 * Bu tek uç SY'nin BEŞ KPI kutusunun da kaynağını taşır (openapi
 * `SalesSummaryResponse.required` ile doğrulandı):
 *   · `sold`            → Satılan sayı + `deed_transferred_count` + `amount`
 *   · `reserved`        → Rezerve sayı + `expired_count` + `amount`
 *   · `available_units` → **Boş ünite sayısı + `list_price_total`** (SY 54-60'ın
 *     "Boş" kutusu; ünite özeti için AYRI bir uca gitmeye GEREK YOKTUR —
 *     `GET /projects/{id}/units` çağrılmaz)
 *   · `collection`      → Tahsil Edilen tutar + sözleşme tutarı + **yüzde
 *     SUNUCUDAN** (`collection_pct`; istemci `collected/contracted` bölmesi
 *     YAPMAZ, `contracted_amount` 0 iken sunucu `null` verir)
 *   · `overdue`         → Vadesi Geçen taksit sayısı + tutar + `late_fee_amount`
 *
 * `upcoming_collections[]` "Yaklaşan Tahsilatlar" kartını (SY 223-231) besler;
 * `is_overdue` / `days_overdue` / `late_fee_amount` alanları P8 kararı gereği
 * SUNUCU TÜREVİ GÖSTERİMDİR (tahakkuk yok) — istemci gecikme faizi HESAPLAMAZ.
 * `expired_reservations[]` "rezervasyon süresi doldu" gösterimidir; otomatik
 * iptal YOKTUR.
 *
 * `pending_modules` zarfı yanıtta durur ama bu dilimde KPI'ların hiçbiri ona
 * bağlı değildir — ekran onu pending rozeti olarak basmaz (uydurma KPI yasağı).
 */
export function useSalesSummary(projectId: string): UseQueryResult<SalesSummaryResponse, Error> {
  return useQuery({
    enabled: projectId.length > 0,
    queryKey: [SALES_SUMMARY_QUERY_KEY, projectId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/projects/{project_id}/sales/summary", {
          params: { path: { project_id: projectId } },
        }),
      ),
  });
}
