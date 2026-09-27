import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// STOK-BOLUM · Bölüm Detay › "Malzeme" sekmesi — `GET /sections/{section_id}/stock`.
//
// ⚠️ BFF: ilk path segmenti "sites" DEĞİL "sections"tır ve o kök
// `ALLOWED_ROOTS`ta ZATEN VARDIR (`useSection` aynı kökten geçer) — yeni bir
// kök EKLENMEZ. Eksik olsaydı modül YALNIZ CANLIDA 404 alırdı, jsdom görmezdi.
//
// 🔴 BU UÇ BAKİYE DÖNMEZ ve bu bir eksiklik DEĞİL ürün kararıdır ("STOK DEPODA
// DURUR, BÖLÜM TÜKETİR"): bölüme ikinci bir bakiye kaynağı açmak, aynı malzeme
// için zamanla birbirinden sapan iki sayı üretirdi. Yerine (malzeme, poz) çifti
// başına ÜÇ miktar döner ve tanımları ÖRTÜŞMEZ:
//
//   assigned_quantity → atfedilmiş POZİTİF miktarlar ("bu bölüm için girdi")
//   issued_quantity   → NEGATİF miktarların MUTLAK toplamı ("sarf edildi")
//   net_quantity      → assigned − issued
//
// 🔴 SARF TOPLAMI `issued_quantity`DİR. İkisi tek toplama indirgenirse
// `+10 alım` ile `−4 sarf` birbirini götürür ve ekran 4 birimin harcandığını
// HİÇ söyleyemez. Ekran ikisini AYRI basar.
export type SectionStockResponse = DeepScale<components["schemas"]["SectionStockResponse"]>;
export type SectionStockRow = DeepScale<components["schemas"]["SectionStockRow"]>;
export type SectionStockKpis = DeepScale<components["schemas"]["SectionStockKpis"]>;

export const SECTION_STOCK_QUERY_KEY = "section-stock";

/**
 * Kayıt 255 — bölüm stok ucunun (`GET /sections/{section_id}/stock`) sayfalama
 * tavanı `useStockItems.ts::STOCK_LIST_MAX_LIMIT` (katalog ucu) ile PAYLAŞILMAZ:
 * ikisi BAĞIMSIZ uçlardır, bugün ikisi de backend `le=200` ile aynı olsa da
 * biri değişirse diğeri sessizce 422 ya da gereksiz kısıtlama alır.
 */
export const SECTION_STOCK_LIST_MAX_LIMIT = 200;

/**
 * Sayfalama DIŞINDA süzgeç YOKTUR (openapi.json `parameters`: `section_id`
 * path · `limit`/`offset` query). Uydurma parametre gönderilmez.
 */
export interface SectionStockFilter {
  limit?: number;
  offset?: number;
}

export function useSectionStock(
  sectionId: string,
  filter: SectionStockFilter = {},
): UseQueryResult<SectionStockResponse, Error> {
  return useQuery({
    enabled: sectionId.length > 0,
    queryKey: [SECTION_STOCK_QUERY_KEY, sectionId, filter.limit ?? null, filter.offset ?? null],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sections/{section_id}/stock", {
          params: {
            path: { section_id: sectionId },
            query: {
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}
