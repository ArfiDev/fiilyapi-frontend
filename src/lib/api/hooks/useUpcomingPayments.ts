import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-HZ T2 · Hazine (E9:109-125) — yaklaşan ödemeler kartının TEK kaynağı.
export type UpcomingPaymentsResponse = DeepScale<components["schemas"]["UpcomingPaymentsResponse"]>;
export type UpcomingPaymentItem = DeepScale<components["schemas"]["UpcomingPaymentItem"]>;
export type UpcomingSourceType = components["schemas"]["UpcomingSourceType"];

export const UPCOMING_PAYMENTS_QUERY_KEY = "treasury-upcoming-payments";

/**
 * `GET /treasury/upcoming-payments` — `days` GÖNDERİLMEZ, sunucu varsayılanı
 * (7) kullanılır ve yanıttaki `days` ECHO'su başlığa basılır (E9:110 "Yaklaşan
 * Ödemeler (7 Gün)"). Sayı ekrana SABİT yazılsaydı, varsayılan değiştiğinde
 * başlık listeyle çelişirdi.
 *
 * Sayfalama YOKTUR (şema notu): pencere `days` ile zaten sınırlıdır.
 */
export function useUpcomingPayments(): UseQueryResult<UpcomingPaymentsResponse, Error> {
  return useQuery({
    queryKey: [UPCOMING_PAYMENTS_QUERY_KEY],
    queryFn: async () => unwrap(await backendClient.GET("/treasury/upcoming-payments", {})),
  });
}
