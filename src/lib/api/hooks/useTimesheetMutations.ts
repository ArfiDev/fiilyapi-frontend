import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import {
  TIMESHEET_QUERY_KEY,
  TIMESHEET_WEEK_QUERY_KEY,
  type TimesheetWeek,
  type TimesheetWeekParams,
} from "./useTimesheet";
import type { DeepScale } from "@/lib/api/scale";

// PUAN-SAAT · Puantaj kaydetme ucu (HAFTALIK).
export type TimesheetWeekSave = DeepScale<components["schemas"]["TimesheetWeekSave"]>;
export type TimesheetCellInput = DeepScale<components["schemas"]["TimesheetCellInput"]>;

/* ═══════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️  KAPSAM KURALI — BU DILIMIN EN KRITIK TUZAGI  ⚠️⚠️
 *
 * `PUT /sites/{site_id}/timesheet/week` DEGISTIRMEDIR (replace), ekleme DEGIL:
 * govde HAFTA (`iso_year`+`iso_week`) + SANTIYE kapsaminin TAM hucre kumesidir
 * ve GOVDEDE GECMEYEN HER HUCRE SILINIR.
 *
 * 🔴 KAPSAM AY DEGIL HAFTADIR: ayni ayin BASKA haftalarina ve baska santiyeye
 * DOKUNULMAZ (backend bekcisi
 * `test_hafta_kaydetmek_ayin_diger_haftasina_DOKUNMAZ`).
 *
 * Pratik sonuc: ekranda BOLUM FILTRESI AKTIFKEN BILE govde HER ZAMAN
 * santiyenin o HAFTAYA ait TAM hucre kumesidir. Filtre yalnizca GORUNUMU
 * suzer. Filtreli kume gonderilirse DIGER BOLUMLERIN o haftaki kayitlari
 * sessizce SILINIR.
 *
 * Bu yuzden hook'un imzasi bilinclidir:
 *   • `sectionId` ALMAZ — filtreli kumeyi kazara gondermeyi kolaylastirmasin.
 *   • Yanit GUNCEL TAM haftadir (bolum suzgeci UYGULANMAZ) — ekran
 *     kaydettiginin tamamini geri gorur.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Hafta + santiye kapsaminin TUM hucrelerini kaydeder.
 *
 * 409 (kisi ayni gun baska santiyede kayitli) burada YUTULMAZ — `BackendError`
 * olarak cagirana ulasir, ekran Turkce `detail` mesajini gosterir.
 */
export function useSaveTimesheetWeek(
  siteId: string,
  week: TimesheetWeekParams,
): UseMutationResult<TimesheetWeek, Error, TimesheetWeekSave> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.PUT("/sites/{site_id}/timesheet/week", {
          params: {
            path: { site_id: siteId },
            query: { iso_year: week.isoYear, iso_week: week.isoWeek },
          },
          body,
        }),
      ),
    // Prefix eslesme: santiyenin TUM hafta varyantlari tazelenir — ay seridinin
    // ("girilmedi" rozeti) ve aylik matrisin (bolum detay sekmesi) bayat
    // kalmamasi icin AYLIK anahtar da tazelenir.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [TIMESHEET_WEEK_QUERY_KEY, siteId] });
      void queryClient.invalidateQueries({ queryKey: [TIMESHEET_QUERY_KEY, siteId] });
    },
  });
}
