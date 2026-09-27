import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-SA T1 · Satınalma — TEK ekranının teklif kartları (TEK 53-116) +
// karşılaştırma özeti (119-127).
export type PurchaseQuoteListResponse = DeepScale<components["schemas"]["PurchaseQuoteListResponse"]>;
export type PurchaseQuoteCard = DeepScale<components["schemas"]["PurchaseQuoteCard"]>;
export type PurchaseQuoteResponse = DeepScale<components["schemas"]["PurchaseQuoteResponse"]>;

export const QUOTES_QUERY_KEY = "purchase-quotes";

/**
 * `GET /purchase-requests/{request_id}/quotes` — SÜZGEÇSİZ ve SAYFASIZDIR:
 * openapi'de tek parametre `request_id` path'idir, yanıt `limit`/`offset`
 * TAŞIMAZ (teklifler bir TALEBİN altındadır, sayıları tek hanelidir).
 * Kırpılma korkuluğu bu uçta UYGULANMAZ — kırpılma diye bir olgu yok.
 *
 * ⚠️ İKİ ROZETİN KAYNAĞI FARKLIDIR (spec §1 "istemci türevi" ifadesini
 * ŞEMANIN yendiği yer):
 *   · **"EN İYİ FİYAT" SUNUCUDAN gelir** — `is_best_price` kartın alanıdır ve
 *     `total_cost` (= birim fiyat × talebin toplam miktarı + hariç nakliye)
 *     üzerinden hesaplanır. İstemci `unit_price`lara bakıp bunu YENİDEN
 *     ÜRETMEZ: nakliyesi hariç ucuz görünen teklif yanlışlıkla rozetlenirdi
 *     (TEK 90'ın tam senaryosu). Beraberlikte HEPSİ rozetlidir.
 *   · **"EN HIZLI" rozetinin sunucu karşılığı YOKTUR ve uydurulamaz** —
 *     `delivery_time` SERBEST METİNDİR ("Yarın sabah" ile "3 iş günü"
 *     sıralanamaz). Mockup'ta rozet vardır; T3 bunu ya sağlam bir metin
 *     yorumuyla ya da pending olarak basar, sunucudan bekleyemez.
 *
 * `request_quantity_total` yanıtta durur çünkü `total_cost`un çarpanıdır —
 * ekran tabanı gösterebilsin diye.
 */
export function useQuotes(requestId: string): UseQueryResult<PurchaseQuoteListResponse, Error> {
  return useQuery({
    // `usePurchaseRequest` deseni: boş id ile ağa çıkılmaz.
    enabled: requestId.length > 0,
    queryKey: [QUOTES_QUERY_KEY, requestId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/purchase-requests/{request_id}/quotes", {
          params: { path: { request_id: requestId } },
        }),
      ),
  });
}
