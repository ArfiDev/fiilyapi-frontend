import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale, WithPlainProgressPct } from "@/lib/api/scale";

// 🔴 `DashboardSummary.projects[]`in İÇİNDEKİ `progress_pct` bu sarmalayıcıya
// GİRMEZ (yalnız düz `DashboardProjectCard` takma adı elle düzeltildi) —
// `scale.ts` `WithPlainProgressPct` notu bunu KALAN KORUMASIZ YER işaretler.
export type DashboardSummary = DeepScale<components["schemas"]["DashboardSummaryResponse"]>;
export type DashboardProjectCard = WithPlainProgressPct<
  DeepScale<components["schemas"]["DashboardProjectCard"]>
>;

export const DASHBOARD_SUMMARY_QUERY_KEY = "dashboard-summary";

export function useDashboardSummary(): UseQueryResult<DashboardSummary, Error> {
  return useQuery({
    queryKey: [DASHBOARD_SUMMARY_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/dashboard/summary", {})),
  });
}
