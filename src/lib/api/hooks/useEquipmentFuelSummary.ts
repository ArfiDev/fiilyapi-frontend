import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MK T4 · M3'ün BEŞİNCİ KPI kartı ("Yakıt Tüketimi", 100-104) yakıt
// özetinden beslenir — çalışma özetinde böyle bir alan YOKTUR. Mockup öğesi
// silinmediği için (F-TH kalıcı kuralı) bu uç burada bağlanır; M4 ekranı
// (T5) AYNI hook'u yeniden kullanır, ikinci kopya yazılmaz.
export type FuelSummaryResponse = components["schemas"]["FuelSummaryResponse"];
export type FuelSummaryRow = DeepScale<components["schemas"]["FuelSummaryRow"]>;

export const EQUIPMENT_FUEL_SUMMARY_QUERY_KEY = "equipment-fuel-summary";

/** `GET /equipment/fuel-summary` süzgeçleri (openapi query parametreleri). */
export interface EquipmentFuelSummaryFilter {
  year: number;
  month: number;
  equipmentId?: string;
}

/**
 * `total_liters`/`total_amount` satırlardan türer (MK-1 K15); `lt_per_hour_avg`
 * ve `avg_unit_price` payda 0 iken `null`dur (K16) — 0 BASILMAZ.
 */
export function useEquipmentFuelSummary(
  filter: EquipmentFuelSummaryFilter,
): UseQueryResult<FuelSummaryResponse, Error> {
  return useQuery({
    queryKey: [
      EQUIPMENT_FUEL_SUMMARY_QUERY_KEY,
      filter.year,
      filter.month,
      filter.equipmentId ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/equipment/fuel-summary", {
          params: {
            query: {
              year: filter.year,
              month: filter.month,
              ...(filter.equipmentId ? { equipment_id: filter.equipmentId } : {}),
            },
          },
        }),
      ),
  });
}
