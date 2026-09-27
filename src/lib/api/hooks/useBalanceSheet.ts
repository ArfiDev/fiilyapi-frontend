import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MT T2 · BL:42-88 bilanço kartları. Tipler `pnpm gen:api` çıktısından TAKMA
// AD olarak alınır — elle arayüz yazmak yasak (`useTrialBalance.ts` kanonu).
export type BalanceSheetResponse = DeepScale<components["schemas"]["BalanceSheetResponse"]>;
export type BalanceSheetSide = DeepScale<components["schemas"]["BalanceSheetSide"]>;
export type BalanceSheetSection = DeepScale<components["schemas"]["BalanceSheetSection"]>;
export type BalanceSheetLine = DeepScale<components["schemas"]["BalanceSheetLine"]>;

export const BALANCE_SHEET_QUERY_KEY = "balance-sheet";

/**
 * `GET /balance-sheet?as_of=YYYY-MM-DD` — 🔴 **NOKTA-ZAMAN**, mizanın birikimli
 * aralığından FARKLI.
 *
 * Gövde `entry_date <= as_of` kümülatif nettir; BL:37 üç ayrı **tek gün**
 * sunar (`31 Temmuz 2026` / `30 Haziran 2026` / `31 Aralık 2025`). Bu yüzden
 * imza `year`+`month` DEĞİL tek bir ISO gün alır — ay çifti burada YALAN
 * söylerdi (ayın hangi gününe kadar olduğunu taşımaz).
 *
 * 🔴 Sayfalama YOKTUR (şema açıklaması K7): yanıt `items/total/limit/offset`
 * TAŞIMAZ, iki taraf + 13 kalem SABİTtir ⇒ `buildListTruncation` ÇAĞRILMAZ.
 *
 * 🔴 Karşılaştırma (önceki dönem) sütunu YOKTUR (MT-K6): BL:37'deki
 * `31 Aralık 2025` bir sütun değil AYRI bir sorgudur — bu yüzden hook tek bir
 * `asOf` alır ve ikinci bir istek KURMAZ.
 */
export function useBalanceSheet(asOf: string): UseQueryResult<BalanceSheetResponse, Error> {
  return useQuery({
    queryKey: [BALANCE_SHEET_QUERY_KEY, asOf],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/balance-sheet", {
          params: { query: { as_of: asOf } },
        }),
      ),
  });
}
