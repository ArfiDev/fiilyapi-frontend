import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MT T3 · NA:65-140 nakit akış tablosu + aylık nakit grafiği. Tipler
// `pnpm gen:api` çıktısından TAKMA AD olarak alınır — elle arayüz yazmak
// yasak (`useBalanceSheet.ts` kanonu).
export type CashFlowStatementResponse = DeepScale<components["schemas"]["CashFlowStatementResponse"]>;
export type CashFlowStatementSection = DeepScale<components["schemas"]["CashFlowStatementSection"]>;
export type CashFlowStatementLine = DeepScale<components["schemas"]["CashFlowStatementLine"]>;
export type MonthlyCashPoint = DeepScale<components["schemas"]["MonthlyCashPoint"]>;

export const CASH_FLOW_STATEMENT_QUERY_KEY = "cash-flow-statement";

/**
 * `GET /cash-flow-statement?year&month` — 🔴 **BİRİKİMLİ**, tek ay DEĞİL:
 * pencere "1 Ocak → seçilen ayın son günü"dür (mizanla AYNI semantik). NA:37
 * başlığı (`Ocak–Temmuz 2026`) bunun görünen hâlidir.
 *
 * 🔴 **`useCashFlow` İLE KARIŞTIRILMAZ** (K10). `src/lib/api/hooks/useCashFlow.ts`
 * ZATEN VARDIR ve BAŞKA bir uca (`/treasury/cash-flow`) bakar: o,
 * `payments`+`invoices`ten türeyen GÜNLÜK giriş/çıkış serisidir (F-HZ hazine
 * paneli). Bu uç ise YEVMİYEDEN türeyen işletme/yatırım/finansman tablosudur
 * (KK-2). İkisi farklı sayı basar ve bu bir kusur DEĞİLDİR — bu yüzden ad da,
 * sorgu anahtarı da AYRIDIR; hazine hook'u BU dilimde değiştirilmez.
 *
 * 🔴 `year`/`month` ZORUNLUDUR: sunucu "bugün"ü HİÇ okumaz, varsayılan dönem
 * kararı FRONTEND'indir (`defaultCashFlowPeriod`).
 *
 * 🔴 Sayfalama YOKTUR (yanıt `items/total/limit/offset` TAŞIMAZ; üç bölüm +
 * kalemleri SABİTtir) ⇒ `buildListTruncation` ÇAĞRILMAZ.
 */
export function useCashFlowStatement(
  year: number,
  month: number,
): UseQueryResult<CashFlowStatementResponse, Error> {
  return useQuery({
    queryKey: [CASH_FLOW_STATEMENT_QUERY_KEY, year, month],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/cash-flow-statement", {
          params: { query: { year, month } },
        }),
      ),
  });
}
