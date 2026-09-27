import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// Ekran 13 · Is Kalemleri (BOQ) — spec §6.2. Tipler `pnpm gen:api` ciktisindan
// takma ad olarak alinir; elle arayuz yazmak yasak.
export type BoqListResponse = components["schemas"]["BoqListResponse"];
export type BoqTotals = DeepScale<components["schemas"]["BoqTotals"]>;
export type BoqGroup = components["schemas"]["BoqGroupResponse"];
export type BoqItem = DeepScale<components["schemas"]["BoqItemResponse"]>;
export type BoqGroupCreate = components["schemas"]["BoqGroupCreate"];
export type BoqGroupUpdate = components["schemas"]["BoqGroupUpdate"];
export type BoqItemCreate = components["schemas"]["BoqItemCreate"];
export type BoqItemUpdate = components["schemas"]["BoqItemUpdate"];

export const BOQ_QUERY_KEY = "boq";

/**
 * BOQ-SEC-F T2 — sorgu anahtari.
 *
 * 🔴 Bolum suzgeci ANAHTARA GIRER. Girmezse suzgecli ve suzgecsiz yanitlar ayni
 * onbellek girdisini paylasir ve BIRBIRINI EZER: bolum detay sekmesi santiyenin
 * butun pozlarini, santiye ekrani da tek bolumun payini basar. Iki yanit ayni
 * sekle sahip oldugu icin hicbir tip hatasi vermez — sessizce yanlis sayi.
 *
 * Suzgecsiz anahtar BIREBIR eskisidir (`[boq, siteId]`): yazma hook'larinin
 * gecersiz kilmasi onek eslesmesiyle her iki girdiyi de kapsar.
 */
export function boqQueryKey(siteId: string, sectionId?: string): readonly unknown[] {
  return sectionId ? [BOQ_QUERY_KEY, siteId, sectionId] : [BOQ_QUERY_KEY, siteId];
}

/**
 * Ekranin tek okuma sorgusu (spec §6.1): tablo VE ust KPI seridi ayni yanittan
 * gelir, bu yuzden tek anahtar yeterlidir.
 *
 * `siteId` bossa aga cikilmaz (useSite deseni): drill kabugu santiye seviyesinde
 * olmadiginda bu hook bos id ile cagrilir (hook'lar kosullu cagrilamaz).
 *
 * 🔴 `sectionId` verilirse yanit BOLUM SUZGECLIDIR ve `quantity` alani O BOLUME
 * tahsis edilen miktara MASKELENIR (BOQ-SEC K5). Pozun gercek santiye kotasi
 * `siteQuotaOf()` ile okunur — `src/lib/boq-quota.ts`. Ayrica suzgecli yanitta
 * BOSALAN GRUPLAR listeden duser (backend `service.py:202`), bos grup basligi
 * beklenmez.
 */
export function useBoq(siteId: string, sectionId?: string): UseQueryResult<BoqListResponse, Error> {
  return useQuery({
    enabled: siteId.length > 0,
    queryKey: boqQueryKey(siteId, sectionId),
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/sites/{site_id}/boq", {
          params: {
            path: { site_id: siteId },
            // Suzgec YOKKEN `query` blogu HIC gonderilmez: `{ section_id:
            // undefined }` gecmek openapi-fetch'te bos bir sorgu dizesi
            // uretebilir ve eski davranistan sapardi.
            ...(sectionId ? { query: { section_id: sectionId } } : {}),
          },
        }),
      ),
  });
}
