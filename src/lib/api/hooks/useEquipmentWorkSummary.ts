import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MK T4 · M3 (Çalışma Kaydı) — ekranın ANA veri kaynağı. Tipler `pnpm
// gen:api` çıktısından takma ad olarak alınır, elle arayüz YAZILMAZ
// (`useEquipmentSummary.ts` deseni).
export type WorkSummaryResponse = components["schemas"]["WorkSummaryResponse"];
export type WorkSummaryRow = DeepScale<components["schemas"]["WorkSummaryRow"]>;
export type WorkSummaryTotals = DeepScale<components["schemas"]["WorkSummaryTotals"]>;
export type WorkSummaryWeek = components["schemas"]["WorkSummaryWeek"];

export const EQUIPMENT_WORK_SUMMARY_QUERY_KEY = "equipment-work-summary";

/** `GET /equipment/work-summary` süzgeçleri (openapi query parametreleri). */
export interface EquipmentWorkSummaryFilter {
  year: number;
  month: number;
  /** Şantiye süzgeci; `undefined` ⇒ tüm şantiyeler. */
  siteId?: string;
}

/**
 * 🔴 Sunucu HEM satırları HEM toplamları (`totals`) HEM haftalık kovaları
 * (`weeks`) verir. Toplamlar SATIRLARDAN türer (MK-1 K15) ve ekran bunları
 * OLDUĞU GİBİ basar — mockup'ın kendi tfoot sabitleri (428 saat / ₺124.800)
 * satırlarıyla tutarsızdır ve KOPYALANMAZ (F-MK spec §0).
 *
 * `usage_pct` / `cost` / `usage_pct_avg` `null` olabilir (MK-1 K16 fail-closed);
 * istemci bunları 0'a ÇEVİRMEZ, "—" basar (spec K3).
 */
export function useEquipmentWorkSummary(
  filter: EquipmentWorkSummaryFilter,
): UseQueryResult<WorkSummaryResponse, Error> {
  return useQuery({
    queryKey: [
      EQUIPMENT_WORK_SUMMARY_QUERY_KEY,
      filter.year,
      filter.month,
      filter.siteId ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/equipment/work-summary", {
          params: {
            query: {
              year: filter.year,
              month: filter.month,
              ...(filter.siteId ? { site_id: filter.siteId } : {}),
            },
          },
        }),
      ),
  });
}
