import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-ST T1 · Şantiye Stok sekmesi (ŞS) — `GET /sites/{site_id}/stock`.
//
// ⚠️ BFF: bu uç `stock` kökünden DEĞİL, ilk segmenti "sites" olduğu için
// MEVCUT `sites` kökünden geçer (bkz. route.ts F-ST notu).
//
// `balance` YALNIZ o şantiyenin depolarını kapsar; merkez depo (`site_id IS
// NULL`) hiçbir şantiyenin bakiyesine girmez (backend spec §3).
export type SiteStockResponse = DeepScale<components["schemas"]["SiteStockResponse"]>;
export type SiteStockRow = DeepScale<components["schemas"]["SiteStockRow"]>;
export type SiteStockKpis = DeepScale<components["schemas"]["SiteStockKpis"]>;

export const SITE_STOCK_QUERY_KEY = "site-stock";

/**
 * Kategori/arama/durum parametreleri bu uçta bilerek açılmamıştır — ŞS
 * mockup'ında süzgeç şeridi yok. Uydurma parametre gönderilmez.
 *
 * 🔴 STOK-BOLUM (backend `186ffe9`) — `section_id` AÇILDI ve ANLAMI DARDIR:
 * **SATIR KÜMESİNİ daraltır, `balance`ı DEĞİŞTİRMEZ.** Süzülmüş listedeki
 * bakiye hâlâ ŞANTİYE bakiyesidir; bölümün kendi miktarları DEĞİLDİR (onlar
 * `useSectionStock`tan gelir). Bu ayrımı ekran ETİKETLEMEK ZORUNDADIR —
 * "bölümün stoğu" diye basmak canlı bir yalan olurdu.
 */
export interface SiteStockFilter {
  limit?: number;
  offset?: number;
  /** Verilmezse süzgeç GÖNDERİLMEZ (anahtar hiç kurulmaz). */
  sectionId?: string;
}

export function useSiteStock(
  siteId: string,
  filter: SiteStockFilter = {},
): UseQueryResult<SiteStockResponse, Error> {
  return useQuery({
    enabled: siteId.length > 0,
    // 🔴 Süzgeç sorgu ANAHTARINDADIR: aksi hâlde süzülmüş yanıt süzgeçsiz
    // görünümün önbelleğini EZER ve kullanıcı "Tümü"ye dönünce eksik liste
    // görürdü (`useBoq` bölüm süzgeci emsali).
    queryKey: [
      SITE_STOCK_QUERY_KEY,
      siteId,
      filter.limit ?? null,
      filter.offset ?? null,
      filter.sectionId ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sites/{site_id}/stock", {
          params: {
            path: { site_id: siteId },
            query: {
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
              ...(filter.sectionId ? { section_id: filter.sectionId } : {}),
            },
          },
        }),
      ),
  });
}
