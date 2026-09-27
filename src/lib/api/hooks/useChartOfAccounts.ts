import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-MU1 T2 · hesap planı katalogu. PAYLAŞILAN hook: E8'in hesap süzgeci
// (T2) ve Hesap Planı ekranı (T3) AYNI kaynağı kullanır — ikinci bir kopya
// yazılırsa iki ekran aynı katalog için farklı sorgu üretirdi.
export type ChartAccountListResponse = DeepScale<components["schemas"]["ChartAccountListResponse"]>;
export type ChartAccountResponse = DeepScale<components["schemas"]["ChartAccountResponse"]>;
export type ChartAccountType = components["schemas"]["ChartAccountType"];

export const CHART_OF_ACCOUNTS_QUERY_KEY = "chart-of-accounts";

/** `limit` tavanı 200, aşım **422** (kırpma DEĞİL) — openapi: `maximum: 200`. */
export const CHART_ACCOUNTS_MAX_LIMIT = 200;

/** `GET /chart-of-accounts` süzgeçleri — openapi query parametrelerinin BİREBİR kopyası. */
export interface ChartAccountFilter {
  /** HP:47 — **kod ve ad** üzerinde arar. */
  q?: string;
  accountType?: ChartAccountType;
  isActive?: boolean;
  limit?: number;
  offset?: number;
  /**
   * 🔴 `true` ⇒ katalogun TAMAMI toplanır: `limit` SAYFA BOYU olur ve `total`
   * bitene kadar sayfa sayfa istenir. Tavan 200'dür ve aşımı 422'dir, yani
   * "limit'i büyüt" bir çözüm DEĞİLDİR.
   *
   * Kimin ihtiyacı var: YAPRAK KURALI (`isLeafChartAccount`) kırpılmış kümede
   * YANLIŞ cevap verir — çocuğu ikinci sayfada kalan bir grup yaprak sanılır.
   * Sayfalanmış liste ekranı (`ChartOfAccountsView`) bunu istemez: orada
   * kırpma GÖRÜNÜR bir bant + arama kutusuyla kullanıcıya söylenir.
   */
  allPages?: boolean;
  /** `false` ⇒ ağa çıkılmaz. */
  enabled?: boolean;
}

/**
 * 🔴 Proje/şantiye kapsam süzgeci YOKTUR (şema notu): hesap planı şirket
 * geneli bir katalogtur, erişimi `accounting` izni denetler.
 *
 * `isActive: false` MEŞRU bir süzgeçtir (kaldırılmış hesaplar) — "verilmemiş"
 * sayılıp düşürülmez; `q: ""` ise süzgeç DEĞİLDİR ve hiç gönderilmez.
 */
export function useChartOfAccounts(
  filter: ChartAccountFilter = {},
): UseQueryResult<ChartAccountListResponse, Error> {
  return useQuery({
    enabled: filter.enabled ?? true,
    queryKey: [
      CHART_OF_ACCOUNTS_QUERY_KEY,
      filter.q ?? null,
      filter.accountType ?? null,
      filter.isActive ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
      filter.allPages ?? false,
    ],
    queryFn: async () => {
      // `allPages` KATALOGUN TAMAMI demektir: sayım 0'dan başlar, çağıranın
      // `offset`i burada anlamsızdır (ikisi birlikte verilirse sayfa sayacı
      // `total` ile tutmazdı).
      if (filter.allPages !== true) return await fetchChartAccountPage(filter, filter.offset);
      const first = await fetchChartAccountPage(filter, 0);

      // Sayfa sayfa toplanır; her tur EN AZ bir satır eklediği için döngü
      // `total` ile SINIRLIDIR. Boş sayfa (eşzamanlı silme) durdurucu olur,
      // aksi hâlde `items.length < total` sonsuza kilitlenirdi.
      const items = [...first.items];
      while (items.length < first.total) {
        const next = await fetchChartAccountPage(filter, items.length);
        if (next.items.length === 0) break;
        items.push(...next.items);
      }
      // Dönen pencere ARTIK katalogun tamamıdır; zarf bunu dürüstçe söyler.
      return { ...first, items, limit: items.length, offset: 0 };
    },
  });
}

async function fetchChartAccountPage(
  filter: ChartAccountFilter,
  offset: number | undefined,
): Promise<ChartAccountListResponse> {
  return unwrap(
    await backendClient.GET("/chart-of-accounts", {
      params: {
        query: {
          ...(filter.q ? { q: filter.q } : {}),
          ...(filter.accountType ? { account_type: filter.accountType } : {}),
          ...(filter.isActive !== undefined ? { is_active: filter.isActive } : {}),
          ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
          ...(offset !== undefined ? { offset } : {}),
        },
      },
    }),
  );
}
