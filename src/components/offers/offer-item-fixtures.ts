/**
 * TKL-F3.6 · teklif kalem tablosu test fikstürü (yalnız testlerden içe alınır; `vitest` İMPORT ETMEZ).
 * Sayılar `calc.py` kuralıyla ELLE hesaplanmıştır (c100, GG %12, kâr %15 → B.F. 128,80; ×10 = 1.288,00;
 * maliyet 1.000 + GG 120 + kâr 168 = 1.288).
 */
import type { OfferGroupRead, OfferItemRead, OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import { BETON, DEMIR, SIVA } from "@/components/work-item-catalog/work-item-fixtures";

import { makeRevision } from "./offer-detail-fixtures";

/** Genel oranlarla fiyatlı kalem: BETON, 10 m³, maliyet 100,00. */
export function makeItem(over: Partial<OfferItemRead> & Pick<OfferItemRead, "id">): OfferItemRead {
  return {
    catalog_item_id: BETON.id,
    cost_unit_price: "100.00",
    customer: { unit_price: "128.80", amount: "1288.00" },
    description: BETON.name,
    group_id: "g-a",
    internal: { cost: "1000.00", man_hours: "18.0000", overhead: "120.00", profit: "168.00", profit_pct: "15.00" },
    offer_unit_price: null,
    overhead_pct: null,
    poz_no: BETON.poz_no,
    priced: true,
    profit_pct: null,
    quantified: over.quantity === undefined ? true : over.quantity !== null,
    quantity: "10.000",
    sort_order: 0,
    unit: BETON.uom,
    unit_mhr: "1.8000",
    ...over,
  };
}

/** Maliyeti girilmemiş kalem (fiyatsız): para alanları null, adam-saat DOLU. */
export function makeUnpricedItem(over: Partial<OfferItemRead> & Pick<OfferItemRead, "id">): OfferItemRead {
  return makeItem({
    catalog_item_id: DEMIR.id,
    description: DEMIR.name,
    poz_no: DEMIR.poz_no,
    unit: DEMIR.uom,
    unit_mhr: "11.5000",
    quantity: "2.000",
    cost_unit_price: null,
    customer: null,
    priced: false,
    internal: { cost: null, man_hours: "23.0000", overhead: null, profit: null, profit_pct: null },
    ...over,
  });
}

/** Miktarı girilmemiş FİYATLI kalem (SO-21): B.F. dolu; tutar/maliyet/GG/kâr/adam-saat null (`calc.py`). */
export function makeUnquantifiedItem(over: Partial<OfferItemRead> & Pick<OfferItemRead, "id">): OfferItemRead {
  return makeItem({
    quantity: null,
    customer: { unit_price: "128.80", amount: null },
    internal: { cost: null, man_hours: null, overhead: null, profit: null, profit_pct: "15.00" },
    ...over,
  });
}

/** Elle teklif B.F. 150,00 (maliyet 100, GG %12 → türev kâr %33,93). */
export function makeManualItem(over: Partial<OfferItemRead> & Pick<OfferItemRead, "id">): OfferItemRead {
  return makeItem({
    offer_unit_price: "150.00",
    customer: { unit_price: "150.00", amount: "1500.00" },
    internal: { cost: "1000.00", man_hours: "18.0000", overhead: "120.00", profit: "380.00", profit_pct: "33.93" },
    ...over,
  });
}

export function makeGroup(
  id: string,
  name: string,
  sortOrder: number,
  items: OfferItemRead[],
): OfferGroupRead {
  return { id, name, sort_order: sortOrder, items: items.map((item) => ({ ...item, group_id: id })) };
}

/** Taslak (düzenlenebilir) Rev.2: A grubu (beton + fiyatsız demir) ve boş B grubu. */
export function makeRevisionWithItems(groups?: OfferGroupRead[], over: Partial<OfferRevisionRead> = {}): OfferRevisionRead {
  const defaultGroups = [
    makeGroup("g-a", "KABA İNŞAAT", 0, [makeItem({ id: "it-1" }), makeUnpricedItem({ id: "it-2", sort_order: 1 })]),
    makeGroup("g-b", "İNCE İŞLER", 1, []),
  ];
  const base = makeRevision({ rev_no: 2 });
  return { ...base, groups: groups ?? defaultGroups, totals: { ...base.totals, unpriced_count: 1 }, ...over };
}

export { BETON, DEMIR, SIVA };
