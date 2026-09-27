import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MU1 T2 · E8:79-88 KPI şeridi. Tipler `pnpm gen:api` çıktısından takma ad
// olarak alınır — elle arayüz yazmak yasak (`useBoq.ts` deseni).
export type JournalSummaryResponse = DeepScale<components["schemas"]["JournalSummaryResponse"]>;

export const JOURNAL_SUMMARY_QUERY_KEY = "journal-summary";

/**
 * `GET /journal-entries/summary` — üç kart: Toplam Borç · Toplam Alacak ·
 * Net Bakiye (`net_balance = ALACAK − BORÇ`, şema notu).
 *
 * 🔴 **HESAP SÜZGECİ ALMAZ** (E8:72 — şerit tablonun ve filtre çubuğunun
 * DIŞINDADIR). Uç yalnız `year`/`month` tanımlar; uydurma bir `account_id`
 * göndermek 422 olurdu.
 */
export function useJournalSummary(
  year: number,
  month: number,
): UseQueryResult<JournalSummaryResponse, Error> {
  return useQuery({
    queryKey: [JOURNAL_SUMMARY_QUERY_KEY, year, month],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/journal-entries/summary", {
          params: { query: { year, month } },
        }),
      ),
  });
}
