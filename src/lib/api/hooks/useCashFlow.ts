import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-HZ T2 · Hazine (E9:90-106) — nakit akışı kartının TEK kaynağı.
export type CashFlowResponse = DeepScale<components["schemas"]["CashFlowResponse"]>;
export type CashFlowBucket = DeepScale<components["schemas"]["CashFlowBucket"]>;

export const CASH_FLOW_QUERY_KEY = "treasury-cash-flow";

/**
 * `GET /treasury/cash-flow` — `year`/`month` GÖNDERİLMEZ.
 *
 * 🔴 Gerekçe: sunucu dönemi `DISPLAY_TIMEZONE`da hesaplar ve yanıtta ECHO eder
 * (`year`/`month`). İstemci kendi saatinden bir dönem üretseydi TR gecesi
 * 00:00-03:00 arasında (UTC'de hâlâ önceki gün/ay) YANLIŞ ayı isterdi — bu,
 * TB5 sınıfı kusurun sorgu-parametresi kardeşidir. Başlık da bu echo'dan
 * basılır, istemci saatinden DEĞİL.
 */
export function useCashFlow(): UseQueryResult<CashFlowResponse, Error> {
  return useQuery({
    queryKey: [CASH_FLOW_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/treasury/cash-flow", {})),
  });
}
