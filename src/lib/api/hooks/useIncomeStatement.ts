import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MT2 T2 · E11:87-147 gelir tablosu. Tipler `pnpm gen:api` çıktısından
// TAKMA AD olarak alınır — elle arayüz yazmak yasak (`useBalanceSheet.ts`
// kanonu; elle yazılan bir arayüz uç değiştiğinde SESSİZCE bayatlar).
export type IncomeStatementResponse = DeepScale<components["schemas"]["IncomeStatementResponse"]>;
export type IncomeStatementSection = DeepScale<components["schemas"]["IncomeStatementSection"]>;
export type IncomeStatementLine = DeepScale<components["schemas"]["IncomeStatementLine"]>;

export const INCOME_STATEMENT_QUERY_KEY = "income-statement";

/**
 * `GET /income-statement?year&month` — 🔴 **BİRİKİMLİ**, tek ay DEĞİL:
 * pencere "1 Ocak → seçilen ayın son günü"dür (nakit akışı ve mizanla AYNI
 * semantik). E11:79 başlığı (`Ocak–Temmuz 2026`) bunun görünen hâlidir ve
 * bilançonun `as_of` NOKTA-ZAMANIYLA karıştırılmaz.
 *
 * 🔴 `year`/`month` ZORUNLUDUR (ikisi de sorgu parametresi): sunucu "bugün"ü
 * HİÇ okumaz, varsayılan dönem kararı FRONTEND'indir
 * (`defaultIncomeStatementPeriod`).
 *
 * 🔴 Sayfalama YOKTUR (yanıt `items/total/limit/offset` TAŞIMAZ; küme SABİT:
 * 2 bölüm · 6 kalem · 2 ara toplam · 1 genel toplam) ⇒ `buildListTruncation`
 * ÇAĞRILMAZ.
 *
 * 🔴 Proje süzgeci YOKTUR: uç `project_id` parametresi ALMAZ (E11:82'nin
 * devre dışı kalma gerekçesi).
 */
export function useIncomeStatement(
  year: number,
  month: number,
): UseQueryResult<IncomeStatementResponse, Error> {
  return useQuery({
    queryKey: [INCOME_STATEMENT_QUERY_KEY, year, month],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/income-statement", {
          params: { query: { year, month } },
        }),
      ),
  });
}
