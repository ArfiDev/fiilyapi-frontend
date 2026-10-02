/**
 * TKL-F5.2 · dönüştürme modeli test fikstürü (yalnız testlerden içe alınır; `vitest` İMPORT ETMEZ).
 * Kazanılmış (won) son revizyon: KABA İNŞAAT (beton fiyatlı · demir FİYATSIZ) + İNCE İŞLER (sıva) + boş "BOŞ GRUP".
 */
import type { OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import { makeRevision } from "@/components/offers/offer-detail-fixtures";
import { makeGroup, makeItem, makeUnpricedItem } from "@/components/offers/offer-item-fixtures";
import { BETON, DEMIR, SIVA } from "@/components/work-item-catalog/work-item-fixtures";

import type { ConvertForm } from "./convert-types";

export const D_KAB_ID = "d-kab";
export const D_DUV_ID = "d-duv";

/** catalog_item_id → disiplin (karışık grup tespiti için katalog haritası). */
export const DISCIPLINE_BY_CATALOG: ReadonlyMap<string, string> = new Map([
  [BETON.id, D_KAB_ID],
  [DEMIR.id, D_KAB_ID],
  [SIVA.id, D_DUV_ID],
]);

export function makeWonRevision(over: Partial<OfferRevisionRead> = {}): OfferRevisionRead {
  const siva = makeItem({
    id: "it-3",
    catalog_item_id: SIVA.id,
    poz_no: SIVA.poz_no,
    description: SIVA.name,
    unit: SIVA.uom,
    quantity: "100.000",
    customer: { unit_price: "50.00", amount: "5000.00" },
  });
  const groups = [
    makeGroup("g-kaba", "KABA İNŞAAT", 0, [makeItem({ id: "it-1" }), makeUnpricedItem({ id: "it-2", sort_order: 1 })]),
    makeGroup("g-ince", "İNCE İŞLER", 1, [siva]),
    makeGroup("g-bos", "BOŞ GRUP", 2, []),
  ];
  const base = makeRevision({ rev_no: 2 });
  return {
    ...base,
    status: "won",
    is_latest: true,
    is_editable: false,
    groups,
    totals: { ...base.totals, unpriced_count: 1, customer: { net: "6288.00", vat: "1257.60", gross: "7545.60" } },
    ...over,
  };
}

export function makeForm(over: Partial<ConvertForm> = {}): ConvertForm {
  return {
    projectName: "Güneşkent Konut Kompleksi",
    city: "İstanbul / Kadıköy",
    contractNo: "SZL-2026-011",
    signatureDate: "2026-10-02",
    startDate: "2026-10-02",
    endDate: "2027-11-25",
    hasPriceEscalation: false,
    indexType: "",
    baseIndexValue: "",
    openSite: false,
    siteName: "",
    ...over,
  };
}

export { BETON, DEMIR, SIVA };
