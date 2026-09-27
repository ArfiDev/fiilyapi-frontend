import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import {
  SITE_PLAN_QUERY_KEY,
  type SitePlanSprintRead,
  type SitePlanWeek,
} from "./useSitePlan";
import { SITE_PLAN_DAY_SUMMARY_QUERY_KEY } from "./useSitePlanDaySummary";
import type { DeepScale } from "@/lib/api/scale";

// F-PL T1 · Şantiye Planlama — dort DEGISTIRME (replace) ucu.
// ⚠️ Sema adlari `…Save` / `…Input` diye ayrisir; takma adlar `pnpm gen:api`
// ciktisindan BIREBIR alinir, "duz ad vardir" varsayilmaz.
export type SitePlanRowsSave = DeepScale<components["schemas"]["SitePlanRowsSave"]>;
export type SitePlanRowInput = DeepScale<components["schemas"]["SitePlanRowInput"]>;
export type SitePlanRowsResult = DeepScale<components["schemas"]["SitePlanRowsResult"]>;
export type SitePlanRowSaved = DeepScale<components["schemas"]["SitePlanRowSaved"]>;
export type SitePlanCellsSave = DeepScale<components["schemas"]["SitePlanCellsSave"]>;
export type SitePlanCellInput = DeepScale<components["schemas"]["SitePlanCellInput"]>;
export type SitePlanGoalsSave = DeepScale<components["schemas"]["SitePlanGoalsSave"]>;
export type SitePlanGoalInput = DeepScale<components["schemas"]["SitePlanGoalInput"]>;
export type SitePlanSprintSave = DeepScale<components["schemas"]["SitePlanSprintSave"]>;

/**
 * Her yazmadan sonra SANTIYENIN tum hafta varyantlari tazelenir (prefix
 * eslesme): satir kaydetme haftadan bagimsizdir ve gecmis/gelecek haftalarin
 * izgarasini da degistirir — yalniz aktif haftayi tazelemek diger haftalari
 * bayat birakirdi.
 */
function useSitePlanInvalidator() {
  const queryClient = useQueryClient();
  return (siteId: string) => {
    queryClient.invalidateQueries({ queryKey: [SITE_PLAN_QUERY_KEY, siteId] });
    // KAYIT 320: `useSitePlanDaySummary` AYRI bir kök anahtar kullanır
    // ("site-plan-day-summary") — `[SITE_PLAN_QUERY_KEY, siteId]` önek
    // eşleşmesi bunu YAKALAMAZ. Şantiye Günlüğü'ndeki gömülü "Planlama"
    // özeti bu yüzden kaydettikten sonra `staleTime` boyunca bayat kalırdı.
    queryClient.invalidateQueries({ queryKey: [SITE_PLAN_DAY_SUMMARY_QUERY_KEY, siteId] });
  };
}

/**
 * Izgara satirlarini kaydetme (`PUT /sites/{site_id}/plan/rows`).
 *
 * `week_start` YOKTUR: govde SANTIYENIN satir kumesinin TAMAMIDIR, gecmeyen
 * satir SILINIR ve hucreleri CASCADE ile gider. `id` tasiyan satir kimligini
 * (dolayisiyla hucrelerini) korur; `id`siz satir yeni acilir.
 *
 * Yanit haftalik izgara DEGIL `SitePlanRowsResult`tir — ekran yeni satir
 * kimliklerini buradan alir, izgarayi `useSitePlan` tazelemesinden okur.
 */
export function useSaveSitePlanRows(
  siteId: string,
): UseMutationResult<SitePlanRowsResult, Error, SitePlanRowsSave> {
  const invalidate = useSitePlanInvalidator();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PUT("/sites/{site_id}/plan/rows", {
          params: { path: { site_id: siteId } },
          body,
        }),
      ),
    onSuccess: () => invalidate(siteId),
  });
}

/**
 * Izgara hucrelerini kaydetme (`PUT /sites/{site_id}/plan/cells`).
 *
 * Kapsam `week_start` HAFTASI + o santiyedir: govdede gecmeyen hucre SILINIR,
 * baska haftaya DOKUNULMAZ. Bos `text` tasiyan hucre yazilmaz (hucre yoklugu =
 * plan yok), yani hucre bosaltmanin yolu onu govdede bos metinle gondermektir.
 */
export function useSaveSitePlanCells(
  siteId: string,
  weekStart: string,
): UseMutationResult<SitePlanWeek, Error, SitePlanCellsSave> {
  const invalidate = useSitePlanInvalidator();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PUT("/sites/{site_id}/plan/cells", {
          params: { path: { site_id: siteId }, query: { week_start: weekStart } },
          body,
        }),
      ),
    onSuccess: () => invalidate(siteId),
  });
}

/**
 * Haftalik hedefleri kaydetme (`PUT /sites/{site_id}/plan/goals`).
 *
 * Kapsam `week_start` HAFTASI + o santiyedir; gecmeyen hedef SILINIR.
 * `is_done` ile `status` AYRI alanlardir, biri digerinden TURETILMEZ.
 */
export function useSaveSitePlanGoals(
  siteId: string,
  weekStart: string,
): UseMutationResult<SitePlanWeek, Error, SitePlanGoalsSave> {
  const invalidate = useSitePlanInvalidator();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PUT("/sites/{site_id}/plan/goals", {
          params: { path: { site_id: siteId }, query: { week_start: weekStart } },
          body,
        }),
      ),
    onSuccess: () => invalidate(siteId),
  });
}

/**
 * Aktif sprint adini kaydetme (`PUT /sites/{site_id}/plan/sprint`).
 *
 * `week_start` YOKTUR — sprint santiye kapsamlidir. Bos/`null` ad aktif
 * sprinti KAPATIR (kayit silinmez, `is_active` duser) ve yanit `null` olur;
 * cagiran ekran bu iki durumu ayirt etmelidir.
 */
export function useSaveSitePlanSprint(
  siteId: string,
): UseMutationResult<SitePlanSprintRead | null, Error, SitePlanSprintSave> {
  const invalidate = useSitePlanInvalidator();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PUT("/sites/{site_id}/plan/sprint", {
          params: { path: { site_id: siteId } },
          body,
        }),
      ),
    onSuccess: () => invalidate(siteId),
  });
}
