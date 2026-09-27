import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";

import { QUOTES_QUERY_KEY, type PurchaseQuoteResponse } from "./useQuotes";
import {
  PURCHASE_REQUESTS_QUERY_KEY,
  PURCHASE_REQUEST_QUERY_KEY,
} from "./usePurchaseRequests";
import { PURCHASE_ORDERS_QUERY_KEY } from "./usePurchaseOrders";
import { PURCHASING_SUMMARY_QUERY_KEY } from "./usePurchasingSummary";
import type { DeepScale } from "@/lib/api/scale";

// F-SA T1 · Teklif yazma yüzeyi — TEK ekranının teklif GİRİŞİ türetilmiş
// diyaloğu (spec K5, ONAYLI SAPMA) + "Sipariş Ver"/"Seç" düğmesi.
export type PurchaseQuoteCreate = DeepScale<components["schemas"]["PurchaseQuoteCreate"]>;
export type PurchaseQuoteUpdate = DeepScale<components["schemas"]["PurchaseQuoteUpdate"]>;
export type PurchaseOrderResponse = DeepScale<components["schemas"]["PurchaseOrderResponse"]>;

/**
 * Teklif YAZILDIĞINDA bayatlayan iki şey: o talebin teklif listesi (kartlar +
 * "EN İYİ FİYAT" rozeti SUNUCU türevidir, yeni teklif rozeti başka karta
 * taşıyabilir) ve SAT tablosu (talebin durumu/teklif bağlamı).
 */
function useInvalidateQuotes(): (requestId: string) => void {
  const queryClient = useQueryClient();
  return (requestId: string) => {
    queryClient.invalidateQueries({ queryKey: [QUOTES_QUERY_KEY, requestId] });
    queryClient.invalidateQueries({ queryKey: [PURCHASE_REQUESTS_QUERY_KEY] });
    queryClient.invalidateQueries({ queryKey: [PURCHASE_REQUEST_QUERY_KEY, requestId] });
  };
}

/**
 * `POST /purchase-requests/{request_id}/quotes` — teklif girişi.
 * Zorunlu alanlar: `supplier_id` · `unit_price` · `delivery_time` ·
 * `payment_terms`. `shipping_included` şemada varsayılanlıdır ama üretilmiş
 * tipte ZORUNLU görünür (F-ST "üretilmiş tip tuzağı") → açıkça verilir.
 *
 * ⚠️ `total_cost` GÖVDEDE YOKTUR ve istemci hesaplamaz: sunucu
 * `unit_price × talebin toplam miktarı (+ hariçse nakliye)` olarak türetir.
 */
export function useCreateQuote(
  requestId: string,
): UseMutationResult<PurchaseQuoteResponse, Error, PurchaseQuoteCreate> {
  const invalidate = useInvalidateQuotes();
  return useMutation({
    mutationFn: async (body) =>
      unwrap(
        await backendClient.POST("/purchase-requests/{request_id}/quotes", {
          params: { path: { request_id: requestId } },
          body,
        }),
      ),
    onSuccess: () => invalidate(requestId),
  });
}

/**
 * `PATCH /purchase-requests/{request_id}/quotes/{quote_id}` — KISMİ günceller.
 * F-PT2 kararı 5: gövdede YALNIZ gerçekten değişen anahtarlar bulunur.
 */
export function useUpdateQuote(
  requestId: string,
): UseMutationResult<
  PurchaseQuoteResponse,
  Error,
  { quoteId: string; body: PurchaseQuoteUpdate }
> {
  const invalidate = useInvalidateQuotes();
  return useMutation({
    mutationFn: async ({ quoteId, body }) =>
      unwrap(
        await backendClient.PATCH("/purchase-requests/{request_id}/quotes/{quote_id}", {
          params: { path: { request_id: requestId, quote_id: quoteId } },
          body,
        }),
      ),
    onSuccess: () => invalidate(requestId),
  });
}

/**
 * `DELETE /purchase-requests/{request_id}/quotes/{quote_id}` — 204 döner
 * (gövdesiz). Seçilmiş teklifin silinmesi sunucuda 409'dur; hata YUTULMAZ,
 * `BackendError` çağırana aynen iletilir.
 */
export function useDeleteQuote(requestId: string): UseMutationResult<void, Error, string> {
  const invalidate = useInvalidateQuotes();
  return useMutation({
    mutationFn: async (quoteId) => {
      unwrap(
        await backendClient.DELETE("/purchase-requests/{request_id}/quotes/{quote_id}", {
          params: { path: { request_id: requestId, quote_id: quoteId } },
        }),
      );
    },
    onSuccess: () => invalidate(requestId),
  });
}

/**
 * "Sipariş Ver" / "Seç"
 * (`POST /purchase-requests/{id}/quotes/{quote_id}/select-and-order`) —
 * GÖVDESİZDİR ve TEK çağrıda İKİ şey yapar: teklifi seçili işaretler ve
 * SİPARİŞİ DOĞURUR (201 + `PurchaseOrderResponse`). Talep aynı işlemde
 * `ordered`a geçer.
 *
 * ⚠️ İstemci ARDINDAN `POST /purchase-orders` ÇAĞIRMAZ: doğrudan sipariş ucu
 * `request_id` KABUL ETMEZ (SA kararı) — talebe bağlı siparişin TEK yolu
 * budur. İkinci bir çağrı ikinci bir sipariş doğururdu.
 *
 * Bu tek uç DÖRT sorguyu birden bayatlatır: teklifler (seçim rozeti), SAT
 * tablosu + talep detayı (durum `ordered`), SİPARİŞ listesi (yeni satır) ve
 * KPI şeridi (açık talep/aktif sipariş sayaçları).
 */
export function useSelectQuoteAndOrder(
  requestId: string,
): UseMutationResult<PurchaseOrderResponse, Error, string> {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateQuotes();
  return useMutation({
    mutationFn: async (quoteId) =>
      unwrap(
        await backendClient.POST(
          "/purchase-requests/{request_id}/quotes/{quote_id}/select-and-order",
          { params: { path: { request_id: requestId, quote_id: quoteId } } },
        ),
      ),
    onSuccess: () => {
      invalidate(requestId);
      queryClient.invalidateQueries({ queryKey: [PURCHASE_ORDERS_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [PURCHASING_SUMMARY_QUERY_KEY] });
    },
  });
}
