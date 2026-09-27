import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-ST T1 · Stok & Depo — malzeme KARTI (katalog künyesi) sorgusu.
// `usePersonnel.ts` deseniyle AYNI: tipler `pnpm gen:api` çıktısından takma ad
// olarak alınır, elle arayüz yazmak yasak.
//
// ⚠️ Bu uç BAKİYE ve DURUM TAŞIMAZ (backend spec §3: ikisi de hareketlerden
// türevdir ve `StockItemResponse`da bilerek yoktur). E3 katalog TABLOSU bu
// hook'la DEĞİL `useStockSummary` ile çizilir; burası kart seçicileri
// (SG kalem satırı) ve künye listeleri içindir.
export type StockItemListResponse = DeepScale<components["schemas"]["StockItemListResponse"]>;
export type StockItemResponse = DeepScale<components["schemas"]["StockItemResponse"]>;
export type StockCategory = components["schemas"]["StockCategory"];
export type StockStatus = components["schemas"]["StockStatus"];

export const STOCK_ITEMS_QUERY_KEY = "stock-items";

/**
 * Stok liste uçlarının ORTAK `limit` tavanı (openapi.json: `maximum: 200`).
 * Üstünü istemek 422 döndürür — "hepsini çek" MÜMKÜN DEĞİLDİR.
 *
 * ⚠️ TUZAK (TB3/F-TH dersi): sunucu varsayılanı `limit=50`. Açık `limit`
 * göndermeyen çağıran SESSİZCE ilk 50 kaydı alır ve 51. malzemeyi kaybeder.
 * Bu yüzden stok listelerini tüketen her ekran `limit`i AÇIKÇA gönderir ve
 * yanıttaki `total` ile kırpılmayı `buildListTruncation` üzerinden GÖRÜNÜR
 * kılar (`src/lib/list-truncation.ts` — tek kaynak, kopya cümle yazılmaz).
 */
export const STOCK_LIST_MAX_LIMIT = 200;

/** `GET /stock/items` süzgeçleri (openapi.json query parametreleri). */
export interface StockItemListFilter {
  category?: StockCategory;
  q?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export function useStockItems(
  filter: StockItemListFilter = {},
): UseQueryResult<StockItemListResponse, Error> {
  return useQuery({
    queryKey: [
      STOCK_ITEMS_QUERY_KEY,
      filter.category ?? null,
      filter.q ?? null,
      filter.isActive ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/stock/items", {
          params: {
            query: {
              ...(filter.category !== undefined ? { category: filter.category } : {}),
              ...(filter.q ? { q: filter.q } : {}),
              ...(filter.isActive !== undefined ? { is_active: filter.isActive } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}
