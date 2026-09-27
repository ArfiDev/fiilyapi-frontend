import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { backendClient } from "@/lib/api/client";
import { unwrap } from "@/lib/api/unwrap";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

// F-KIRA T-A · M5 (`Makine - Kira Hakedişi.dc.html`) okuma uçları.
// Tipler `pnpm gen:api` çıktısından TAKMA AD olarak alınır; elle arayüz yazmak
// yasak (F-TH T1 kanonu) — sunucu şeması değişirse derleme kırılır.
export type RentalInvoiceListResponse = components["schemas"]["RentalInvoiceListResponse"];
export type RentalInvoiceResponse = DeepScale<components["schemas"]["RentalInvoiceResponse"]>;
export type RentalInvoiceDetailResponse = DeepScale<components["schemas"]["RentalInvoiceDetailResponse"]>;
export type RentalInvoiceLineResponse = DeepScale<components["schemas"]["RentalInvoiceLineResponse"]>;
export type RentalInvoiceTotals = DeepScale<components["schemas"]["RentalInvoiceTotals"]>;
export type RentalInvoiceStatus = components["schemas"]["RentalInvoiceStatus"];
export type RentalLineKind = components["schemas"]["RentalLineKind"];
export type VarianceStatus = components["schemas"]["VarianceStatus"];
export type EquipmentRatePeriod = components["schemas"]["EquipmentRatePeriod"];
export type RentalSiteDistributionEntry = components["schemas"]["RentalSiteDistributionEntry"];
export type RentalSiteDistributionEquipment =
  components["schemas"]["RentalSiteDistributionEquipment"];

export const EQUIPMENT_RENTAL_INVOICES_QUERY_KEY = "equipment-rental-invoices";
export const EQUIPMENT_RENTAL_INVOICE_QUERY_KEY = "equipment-rental-invoice";

/**
 * `GET /equipment/rental-invoices` `limit` tavanı (openapi: `maximum: 200`).
 * TB3 sayfalama kanonu: sunucu varsayılanı 50'dir, her çağıran `limit`i
 * AÇIKÇA gönderir.
 */
export const EQUIPMENT_RENTAL_INVOICES_MAX_LIMIT = 200;

/**
 * `GET /equipment/rental-invoices` süzgeçleri (openapi query parametreleri).
 *
 * ⚠️ ARAMA VE SIRALAMA PARAMETRESİ YOKTUR: uç yalnız bu beş süzgeci + sayfalamayı
 * tanır. Ekran bir arama kutusu basacaksa süzgeç sunucuda değil, listenin
 * üstünde başka bir çözümle yapılır — uydurma bir `q` parametresi 422 alır.
 */
export interface EquipmentRentalInvoicesFilter {
  supplierId?: string;
  siteId?: string;
  /**
   * F-MKD · `equipment_id` — uçta ZATEN VARDI ama bu filtre onu TAŞIMIYORDU;
   * eksikliği sessizdi çünkü fazladan alan göndermeyen bir istemci hiçbir
   * hata almaz, yalnız FİLONUN TAMAMINI görürdü.
   *
   * 🔴 Bu süzgeç NEYİN kümesidir (sorgu gövdesinden —
   * `rental_repository._filtered`): `equipment_id` BAŞLIKTA DEĞİL SATIRDADIR,
   * bu yüzden süzgeç bir `EXISTS`tir, JOIN değil. Yani küme = "bu ekipmanın
   * EN AZ BİR satırını taşıyan hakedişler" — satırın türü (`rented`/`owned`/
   * `breakdown`) ve hakedişin durumu FARK ETMEZ, ve fatura listede yalnız
   * BİR KEZ görünür (JOIN olsaydı iki satırlı fatura iki kez sayılırdı).
   */
  equipmentId?: string;
  status?: RentalInvoiceStatus;
  periodYear?: number;
  periodMonth?: number;
  limit?: number;
  offset?: number;
}

/** Kira hakedişi listesi (M5'e giden liste ekranı). */
export function useEquipmentRentalInvoices(
  filter: EquipmentRentalInvoicesFilter = {},
): UseQueryResult<RentalInvoiceListResponse, Error> {
  return useQuery({
    queryKey: [
      EQUIPMENT_RENTAL_INVOICES_QUERY_KEY,
      filter.supplierId ?? null,
      filter.siteId ?? null,
      filter.equipmentId ?? null,
      filter.status ?? null,
      filter.periodYear ?? null,
      filter.periodMonth ?? null,
      filter.limit ?? null,
      filter.offset ?? null,
    ],
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/equipment/rental-invoices", {
          params: {
            query: {
              ...(filter.supplierId ? { supplier_id: filter.supplierId } : {}),
              ...(filter.siteId ? { site_id: filter.siteId } : {}),
              ...(filter.equipmentId ? { equipment_id: filter.equipmentId } : {}),
              ...(filter.status ? { status: filter.status } : {}),
              ...(filter.periodYear !== undefined ? { period_year: filter.periodYear } : {}),
              ...(filter.periodMonth !== undefined ? { period_month: filter.periodMonth } : {}),
              ...(filter.limit !== undefined ? { limit: filter.limit } : {}),
              ...(filter.offset !== undefined ? { offset: filter.offset } : {}),
            },
          },
        }),
      ),
  });
}

/**
 * M5'in TAMAMI tek istekte: başlık + `lines[]` + `totals` + `site_distribution[]`.
 * Üç ayrı uca bölünseydi ekran üç farklı anın fotoğrafını yan yana basardı
 * (`RentalInvoiceDetailResponse` docstring'i).
 */
export function useEquipmentRentalInvoice(
  invoiceId: string,
): UseQueryResult<RentalInvoiceDetailResponse, Error> {
  return useQuery({
    queryKey: [EQUIPMENT_RENTAL_INVOICE_QUERY_KEY, invoiceId],
    enabled: invoiceId.length > 0,
    queryFn: async () =>
      unwrap(
        await backendClient.GET("/equipment/rental-invoices/{invoice_id}", {
          params: { path: { invoice_id: invoiceId } },
        }),
      ),
  });
}
