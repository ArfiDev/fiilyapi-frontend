import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

export type DashboardSummary = components["schemas"]["DashboardSummaryResponse"];
export type DashboardProjectCard = DeepScale<components["schemas"]["DashboardProjectCard"]>;

export const DASHBOARD_SUMMARY_QUERY_KEY = "dashboard-summary";

export function useDashboardSummary(): UseQueryResult<DashboardSummary, Error> {
  return useQuery({
    queryKey: [DASHBOARD_SUMMARY_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/dashboard/summary", {})),
  });
}
