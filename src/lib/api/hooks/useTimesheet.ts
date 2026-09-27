import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// PUAN-SAAT · Puantajin OKUMA sorgulari.
// Tipler `pnpm gen:api` ciktisindan takma ad olarak alinir; elle arayuz yazmak
// yasak (`useSitePlan.ts` deseni).
export type TimesheetMatrix = DeepScale<components["schemas"]["TimesheetMatrix"]>;
export type TimesheetMatrixRow = DeepScale<components["schemas"]["TimesheetMatrixRow"]>;
export type TimesheetCell = DeepScale<components["schemas"]["TimesheetCell"]>;
export type TimesheetDayTotal = DeepScale<components["schemas"]["TimesheetDayTotal"]>;
export type TimesheetCode = components["schemas"]["TimesheetCode"];
export type TimesheetWeek = DeepScale<components["schemas"]["TimesheetWeek"]>;
export type TimesheetWeekRow = DeepScale<components["schemas"]["TimesheetWeekRow"]>;
export type TimesheetWeekSummary = DeepScale<components["schemas"]["TimesheetWeekSummary"]>;
export type TimesheetRowTotals = DeepScale<components["schemas"]["TimesheetRowTotals"]>;

export const TIMESHEET_QUERY_KEY = "timesheet";
export const TIMESHEET_WEEK_QUERY_KEY = "timesheet-week";

/** `GET /sites/{site_id}/timesheet` — `year`/`month` ZORUNLU, bolum opsiyonel. */
export interface TimesheetPeriod {
  year: number;
  month: number;
}

/**
 * AYLIK matris (`GET /sites/{site_id}/timesheet`).
 *
 * 🔴 Bu uc artik YALNIZ OKUMADIR: yazma yolu haftalik uctur. Ekranlarda
 * kullanildigi tek yer Bolum Detay'in salt-okur puantaj sekmesi + Excel
 * disa aktarimi.
 *
 * Hucreler SEYREKTIR: girilmemis gun hucre URETMEZ, gun iskeleti cagiranin
 * takviminden kurulur.
 */
export function useTimesheet(
  siteId: string,
  period: TimesheetPeriod,
  sectionId?: string,
): UseQueryResult<TimesheetMatrix, Error> {
  return useQuery({
    enabled: siteId.length > 0,
    queryKey: [TIMESHEET_QUERY_KEY, siteId, period.year, period.month, sectionId ?? null],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sites/{site_id}/timesheet", {
          params: {
            path: { site_id: siteId },
            query: {
              year: period.year,
              month: period.month,
              ...(sectionId !== undefined ? { section_id: sectionId } : {}),
            },
          },
        }),
      ),
  });
}

/** `GET /sites/{site_id}/timesheet/week` — hafta ISO SAYILARIYLA taşınır. */
export interface TimesheetWeekParams {
  isoYear: number;
  isoWeek: number;
}

/**
 * Haftalık ekranın sorgu tarifi — hem `useTimesheetWeek` hem de "Önceki
 * Haftayı Kopyala" (`queryClient.fetchQuery`) AYNI tarifi kullanır, böylece
 * önbellek anahtarı iki yolda ayrışmaz.
 *
 * ⚠️ ŞEF KARARI K2: `section_id` BİLEREK GEÇİRİLMEZ — hafta HER ZAMAN
 * süzgeçsiz çekilir, bölüm filtresi yalnız görünüme uygulanır. Süzgeçli küme
 * kaydetme gövdesine sızarsa diğer bölümlerin o haftası SİLİNİR.
 */
export function timesheetWeekQuery(siteId: string, week: TimesheetWeekParams) {
  return {
    queryKey: [TIMESHEET_WEEK_QUERY_KEY, siteId, week.isoYear, week.isoWeek] as const,
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sites/{site_id}/timesheet/week", {
          params: {
            path: { site_id: siteId },
            query: { iso_year: week.isoYear, iso_week: week.isoWeek },
          },
        }),
      ),
  };
}

export function useTimesheetWeek(
  siteId: string,
  week: TimesheetWeekParams,
): UseQueryResult<TimesheetWeek, Error> {
  return useQuery({ enabled: siteId.length > 0, ...timesheetWeekQuery(siteId, week) });
}
