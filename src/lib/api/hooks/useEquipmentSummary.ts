import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MK T2 · Makine & Ekipman — M1'in KPI şeridinin TEK kaynağı.
export type EquipmentSummaryResponse = DeepScale<components["schemas"]["EquipmentSummaryResponse"]>;

export const EQUIPMENT_SUMMARY_QUERY_KEY = "equipment-summary";

/**
 * `GET /equipment/summary` — sunucu DÖRT sayaç (`working`/`broken`/
 * `maintenance`/`idle`) + `monthly_cost` + `monthly_cost_unknown_count` verir
 * (spec K9/K21). Ekran yalnız ÜÇ sayacı basar (`idle` YAZILMAZ, mockup
 * kazanır — WORKFLOW §3); dördüncü değer burada okunabilir kalır, basılmaz.
 */
export function useEquipmentSummary(): UseQueryResult<EquipmentSummaryResponse, Error> {
  return useQuery({
    queryKey: [EQUIPMENT_SUMMARY_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/equipment/summary", {})),
  });
}
