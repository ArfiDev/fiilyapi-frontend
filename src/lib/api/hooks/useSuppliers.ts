import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-SA T1 · Satınalma — tedarikçi kart ızgarası (TED 41-122) ve teklif
// diyaloğunun tedarikçi seçicisi aynı uçtan beslenir.
export type SupplierListResponse = DeepScale<components["schemas"]["SupplierListResponse"]>;
export type SupplierCard = DeepScale<components["schemas"]["SupplierCard"]>;
export type SupplierResponse = DeepScale<components["schemas"]["SupplierResponse"]>;
export type PaymentTerms = components["schemas"]["PaymentTerms"];

export const SUPPLIERS_QUERY_KEY = "suppliers";

/**
 * `GET /suppliers` süzgeçleri — HEPSİ SUNUCUDA (openapi `parameters`:
 * `q` · `category` · `is_active` · `limit` · `offset`). İstemcide süzülen
 * hiçbir şey yoktur.
 *
 * ⚠️ Kart tutarı (`orders_total_this_year`) ve sayacı SUNUCU TÜREVİDİR —
 * istemci sipariş listesinden yeniden toplamaz. Türev yalnız AKTÖRÜN GÖRDÜĞÜ
 * projelerin siparişlerini sayar (SA kararı) ve siparişsiz tedarikçide
 * `null` DEĞİL SIFIRDIR ("veri yok" ile "hiç sipariş verilmedi" ayrımı
 * sunucuda çözülmüştür; ekran ikisini ayırmak zorunda kalmaz).
 *
 * PUAN alanı ŞEMADA YOKTUR (backend kolonu bilinçli açılmadı, spec §1) —
 * TED'in yıldız satırı bu dilimde pending olarak basılır, istemci uydurmaz.
 *
 * SAYFALIDIR (`limit` 50/200 + yanıtta `total`): kırpılma korkuluğu
 * (`src/lib/list-truncation.ts`) burada UYGULANIR (T4'ün işi).
 */
export interface SupplierListFilter {
  q?: string;
  category?: string;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

export function useSuppliers(
  filter: SupplierListFilter = {},
): UseQueryResult<SupplierListResponse, Error> {
  return useQuery({
    queryKey: [
      SUPPLIERS_QUERY_KEY,
      filter.q ?? null,
      filter.category ?? null,
      filter.isActive ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/suppliers", {
          params: {
            query: {
              ...(filter.q ? { q: filter.q } : {}),
              ...(filter.category ? { category: filter.category } : {}),
              // `false` GEÇERLİ bir süzgeçtir ("pasif tedarikçiler") — bu
              // yüzden doğruluk değil `undefined` denetlenir.
              ...(filter.isActive !== undefined ? { is_active: filter.isActive } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}

export const SUPPLIER_QUERY_KEY = "supplier";

/**
 * F-MKD · `GET /suppliers/{supplier_id}` — TEK tedarikçinin künyesi.
 *
 * 🔴 Niçin listeden SÜZÜLMÜYOR: `GET /suppliers` SAYFALIDIR (sunucu varsayılanı
 * 50, tavan 200). Ekipmanın `supplier_id`si o sayfanın DIŞINDA kalsaydı ad
 * hiç bulunamaz ve ekran "Kiralayan Firma —" basardı; kırpılma sessizce bir
 * VERİ YOKLUĞUNA dönüşürdü (TB3/F-TH kırpılma dersinin bu ekrandaki hâli).
 * Tek kimlikli uç bu riski yapısal olarak ortadan kaldırır.
 *
 * Boş id ile ağa ÇIKILMAZ (`useEquipmentDetail` deseni).
 */
export function useSupplier(supplierId: string): UseQueryResult<SupplierCard, Error> {
  return useQuery({
    enabled: supplierId.length > 0,
    queryKey: [SUPPLIER_QUERY_KEY, supplierId],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/suppliers/{supplier_id}", {
          params: { path: { supplier_id: supplierId } },
        }),
      ),
  });
}
