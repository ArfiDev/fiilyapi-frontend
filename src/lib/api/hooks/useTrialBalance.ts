import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MU2 T2 · MZ:59-173 mizan tablosu. Tipler `pnpm gen:api` çıktısından TAKMA
// AD olarak alınır — elle arayüz yazmak yasak (`useJournalSummary.ts` kanonu).
export type TrialBalanceResponse = DeepScale<components["schemas"]["TrialBalanceResponse"]>;
export type TrialBalanceRow = DeepScale<components["schemas"]["TrialBalanceRow"]>;
export type TrialBalanceTotals = DeepScale<components["schemas"]["TrialBalanceTotals"]>;

export const TRIAL_BALANCE_QUERY_KEY = "trial-balance";

/**
 * `GET /trial-balance?year&month` — 🔴 **BİRİKİMLİ**, tek ay DEĞİL.
 *
 * Uç `year`+`month` alır ama anlamı "1 Ocak → seçilen ayın son günü"dür; MZ:45
 * başlığı (`Ocak–Temmuz 2026`) bunun görünen hâlidir. Bu yüzden dönem etiketi
 * `PeriodPicker`e AÇIKÇA geçilir — varsayılan tek-ay etiketi burada YALAN
 * söylerdi.
 *
 * 🔴 `include_empty` GÖNDERİLMEZ: mockup böyle bir kontrol ÇİZMİYOR ve sunucu
 * varsayılanı `false`tır (hareketsiz hesaplar elenir). Parametreyi açıkça
 * `false` geçmek de aynı sonucu verirdi ama VARSAYILAN YOLU test dışı
 * bırakırdı (MU-2 T6 dersi: her çağrı bayrağı açıkça geçerse varsayılan yol
 * bekçisizdir) — atlanması BİLİNÇLİdir.
 *
 * 🔴 Sayfalama YOKTUR (`TrialBalanceResponse` `items/total/limit/offset`
 * TAŞIMAZ, `rows`/`totals` taşır) ⇒ `buildListTruncation` ÇAĞRILMAZ.
 */
export function useTrialBalance(
  year: number,
  month: number,
): UseQueryResult<TrialBalanceResponse, Error> {
  return useQuery({
    queryKey: [TRIAL_BALANCE_QUERY_KEY, year, month],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/trial-balance", {
          params: { query: { year, month } },
        }),
      ),
  });
}
