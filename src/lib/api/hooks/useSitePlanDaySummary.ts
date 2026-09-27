import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-SD T1 · GK'nin gomulu planlama blogu (SALT-OKUNUR turev, PL spec S2):
// `GET /sites/{site_id}/plan/day-summary`. Planlama EKRANI ayri dilimdir
// (F-PL); burada yalnizca "onumuzdeki N gun" penceresi okunur.
export type SitePlanDaySummary = DeepScale<components["schemas"]["SitePlanDaySummary"]>;
export type SitePlanDaySummaryRange = DeepScale<components["schemas"]["SitePlanDaySummaryRange"]>;

export const SITE_PLAN_DAY_SUMMARY_QUERY_KEY = "site-plan-day-summary";

/** Backend varsayilani (openapi.json `days` semasi): 5 gun, tavan 31. */
export const SITE_PLAN_DAY_SUMMARY_DEFAULT_DAYS = 5;

/**
 * Kayan pencere: `start` ZORUNLUDUR (ISO `YYYY-MM-DD`), pencere hafta
 * sinirini asabilir — bu haftalik izgara DEGIL "onumuzdeki N gun"dur.
 * Bos `siteId` ya da bos `start` ile aga cikilmaz.
 */
export function useSitePlanDaySummary(
  siteId: string,
  start: string,
  days: number = SITE_PLAN_DAY_SUMMARY_DEFAULT_DAYS,
): UseQueryResult<SitePlanDaySummaryRange, Error> {
  return useQuery({
    enabled: siteId.length > 0 && start.length > 0,
    queryKey: [SITE_PLAN_DAY_SUMMARY_QUERY_KEY, siteId, start, days],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sites/{site_id}/plan/day-summary", {
          params: { path: { site_id: siteId }, query: { start, days } },
        }),
      ),
  });
}
