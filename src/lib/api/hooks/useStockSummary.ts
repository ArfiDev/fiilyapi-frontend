import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import { STOCK_ITEMS_QUERY_KEY, type StockCategory, type StockStatus } from "./useStockItems";
import type { DeepScale } from "@/lib/api/scale";

// F-ST T1 · Stok & Depo — E3 genel ekranının TEK okuma kaynağı: katalog
// tablosu (künye + bakiye + durum + depo kırılımı) ve KPI şeridi aynı yanıtta
// gelir. `useSiteDiary.ts`/`usePersonnel.ts` deseniyle aynı.
export type StockSummaryResponse = DeepScale<components["schemas"]["StockSummaryResponse"]>;
export type StockSummaryRow = DeepScale<components["schemas"]["StockSummaryRow"]>;
export type StockSummaryKpis = DeepScale<components["schemas"]["StockSummaryKpis"]>;
export type StockWarehouseBalance = DeepScale<components["schemas"]["StockWarehouseBalance"]>;

export const STOCK_SUMMARY_QUERY_KEY = "stock-summary";

/**
 * `GET /stock/summary` süzgeçleri (openapi.json query parametreleri).
 *
 * ⚠️ `status` bir SÜZGEÇTİR, hesaplanan bir alan DEĞİL. Durum formülü
 * SUNUCUDADIR (backend spec §3): istemci `balance`/`min_stock` karşılaştırıp
 * rozeti YENİDEN ÜRETMEZ, satırın `status` alanını olduğu gibi taşır.
 * `min_stock` yoksa `status` `null` gelir ve hücre "—" basılır.
 *
 * KPI'lar SÜZÜLEN kümenin özetidir, sayfanın değil — süzgeç değişince KPI'lar
 * da değişir (backend kararı; ekran bunu yeniden hesaplamaz).
 */
export interface StockSummaryFilter {
  status?: StockStatus;
  category?: StockCategory;
  q?: string;
  limit?: number;
  offset?: number;
}

export function useStockSummary(
  filter: StockSummaryFilter = {},
): UseQueryResult<StockSummaryResponse, Error> {
  return useQuery({
    queryKey: [
      STOCK_SUMMARY_QUERY_KEY,
      filter.status ?? null,
      filter.category ?? null,
      filter.q ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/stock/summary", {
          params: {
            query: {
              ...(filter.status !== undefined ? { status: filter.status } : {}),
              ...(filter.category !== undefined ? { category: filter.category } : {}),
              ...(filter.q ? { q: filter.q } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}

/**
 * Bakiye/durum türevleri hareketlerden gelir: bir stok hareketi yazıldığında
 * hem özet hem künye listesi bayatlar. Mutasyonlar bu iki anahtarı birlikte
 * geçersiz kılar — tek yerde tutulur ki çağıranlar birini unutmasın.
 */
export const STOCK_DERIVED_QUERY_KEYS = [STOCK_SUMMARY_QUERY_KEY, STOCK_ITEMS_QUERY_KEY] as const;
