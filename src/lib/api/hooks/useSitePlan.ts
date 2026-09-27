import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-PL T1 · Şantiye Planlama — haftalik izgaranin OKUMA sorgusu.
// `useSiteDiary.ts` deseniyle AYNI: tipler `pnpm gen:api` ciktisindan takma ad
// olarak alinir, elle arayuz yazmak yasak.
//
// NOT: GK'nin gomulu planlama blogu (`plan/day-summary`) AYRI hook'tadir
// (`useSitePlanDaySummary.ts`) — o kayan pencere, bu haftalik izgaradir.
export type SitePlanWeek = DeepScale<components["schemas"]["SitePlanWeek"]>;
export type SitePlanDay = DeepScale<components["schemas"]["SitePlanDay"]>;
export type SitePlanGroup = DeepScale<components["schemas"]["SitePlanGroup"]>;
export type SitePlanRowRead = DeepScale<components["schemas"]["SitePlanRowRead"]>;
export type SitePlanCellRead = DeepScale<components["schemas"]["SitePlanCellRead"]>;
export type SitePlanGoalRead = DeepScale<components["schemas"]["SitePlanGoalRead"]>;
export type SitePlanSprintRead = DeepScale<components["schemas"]["SitePlanSprintRead"]>;
export type PlanResourceKind = components["schemas"]["PlanResourceKind"];
export type PlanCellTag = components["schemas"]["PlanCellTag"];
export type PlanGoalStatus = components["schemas"]["PlanGoalStatus"];

export const SITE_PLAN_QUERY_KEY = "site-plan";

/**
 * Haftalik planlama izgarasi (`GET /sites/{site_id}/plan`).
 *
 * `week_start` ZORUNLUDUR (ISO `YYYY-MM-DD`, Pazartesi) — eksik gonderilirse
 * gercek backend 422 doner, bu yuzden bos `siteId`/`weekStart` ile aga
 * CIKILMAZ (`useSitePlanDaySummary` deseni).
 *
 * Yanit ekranin tamamini tasir: gun iskeleti (`days`), gruplu satirlar
 * (`groups`), haftanin hedefleri (`goals`) ve aktif sprint (`active_sprint`) —
 * ekran ikinci istek atmaz.
 */
export function useSitePlan(siteId: string, weekStart: string): UseQueryResult<SitePlanWeek, Error> {
  return useQuery({
    enabled: siteId.length > 0 && weekStart.length > 0,
    queryKey: [SITE_PLAN_QUERY_KEY, siteId, weekStart],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sites/{site_id}/plan", {
          params: { path: { site_id: siteId }, query: { week_start: weekStart } },
        }),
      ),
  });
}
