import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MU2 T3 · KDV:53-143 beyanname ekranı. Tipler `pnpm gen:api` çıktısından
// TAKMA AD olarak alınır — elle arayüz yazmak yasak (`useJournalSummary.ts`).
export type VatReturnResponse = DeepScale<components["schemas"]["VatReturnResponse"]>;
export type VatTaxableRow = DeepScale<components["schemas"]["VatTaxableRow"]>;
export type VatDeductionRow = DeepScale<components["schemas"]["VatDeductionRow"]>;

export const VAT_RETURN_QUERY_KEY = "vat-return";

/**
 * `GET /vat-return?year&month` — 🔴 TEK AY (mizanın BİRİKİMLİ penceresinden
 * FARKLI; KDV:45 `Haziran 2026` tek ay yazar).
 *
 * 🔴 Uç YALNIZ GET tanımlar: `schema.d.ts`te bu yolun `put`/`post`/`delete`/
 * `patch` alanları `never`dır. Ekran salt-okurdur; "GİB'e Gönder" bir yazma
 * ucu DEĞİL, açılmamış bir entegrasyondur.
 *
 * Sayfalama YOKTUR (mizanla aynı gerekçe) ⇒ `buildListTruncation` çağrılmaz.
 */
export function useVatReturn(
  year: number,
  month: number,
): UseQueryResult<VatReturnResponse, Error> {
  return useQuery({
    queryKey: [VAT_RETURN_QUERY_KEY, year, month],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/vat-return", {
          params: { query: { year, month } },
        }),
      ),
  });
}
