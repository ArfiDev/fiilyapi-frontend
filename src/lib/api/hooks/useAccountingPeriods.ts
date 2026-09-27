import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-DKAP T2 · DK:57-92 dönem tablosu. Tipler `pnpm gen:api` çıktısından TAKMA
// AD olarak alınır — elle arayüz yazmak yasak (`useJournalSummary.ts` kanonu).
export type AccountingPeriodListItem = DeepScale<components["schemas"]["AccountingPeriodListItem"]>;
export type AccountingPeriodResponse = DeepScale<components["schemas"]["AccountingPeriodResponse"]>;
export type AccountingPeriodStatus = components["schemas"]["AccountingPeriodStatus"];

export const ACCOUNTING_PERIODS_QUERY_KEY = "accounting-periods";

/**
 * `GET /accounting-periods?year` — 🔴 **LİSTE EKSİK GÖRÜNEBİLİR VE BU
 * DOĞRUDUR** (backend docstring'i): dönem satırı proaktif açılmaz, yalnız bir
 * kapanış/yazma ona dokunduğunda doğar. Listede olmayan ay **AÇIKTIR** —
 * ekran bu olguyu K3'te türetir (`period-closing.ts`).
 *
 * `limit` GÖNDERİLMEZ: sunucu varsayılanı 50, bir yılın 12 ayı için fazlasıyla
 * yeter; sayfalama bu ekranda anlamsızdır (yıl zaten sınırlı bir küme).
 */
export function useAccountingPeriods(
  year: number,
): UseQueryResult<AccountingPeriodListItem[], Error> {
  return useQuery({
    queryKey: [ACCOUNTING_PERIODS_QUERY_KEY, year],
    queryFn: async () => {
      const response = unwrap(
        await backendClient.GET("/accounting-periods", {
          params: { query: { year } },
        }),
      );
      return response.items;
    },
  });
}
