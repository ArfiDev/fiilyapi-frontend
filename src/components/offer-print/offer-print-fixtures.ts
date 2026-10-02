/**
 * TKL-F3.7 · Teklif yazdırma test fikstürü. Test-DIŞI adlıdır; `vitest` İMPORT ETMEZ.
 *
 * 🔴 SENTİNEL değerler: iç alanlara (maliyet, gider, kâr, adam-saat, düz B.F. alanları) AYIRT EDİCİ,
 * başka hiçbir yerde geçmeyen sayılar konur. İşveren çıktısında bu sayıların (ham ya da `tr-TR`
 * biçimli) görünmesi = SIZINTI. Fikstür bu yüzden `internal` nesnelerini ve düz iç alanları BİLEREK
 * doldurur: sızıntı bekçisi "alan boş olduğu için sızmadı" sahte-yeşiline düşemesin.
 */
import { makeDetail, makeRevision } from "@/components/offers/offer-detail-fixtures";
import type { OfferDetailRead, OfferItemRead, OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import type { CompanyRead } from "@/lib/api/models";

/** İç alanlara özel sentinel sayılar — ham değer → `tr-TR` gösterim (yalnız sızıntı testleri okur). */
export const LEAK_SENTINELS = {
  itemCostUnitPrice: { raw: "888888.88", shown: "888.888,88" },
  itemCost: { raw: "777777.77", shown: "777.777,77" },
  itemOverhead: { raw: "666666.66", shown: "666.666,66" },
  itemProfit: { raw: "555555.55", shown: "555.555,55" },
  itemManHours: { raw: "444444", shown: "444.444" },
  itemUnitMhr: { raw: "333.33", shown: "333,33" },
  itemOverheadPct: { raw: "11.11", shown: "11,11" },
  itemProfitPct: { raw: "22.22", shown: "22,22" },
  totalCost: { raw: "99999999.99", shown: "99.999.999,99" },
  totalOverhead: { raw: "88888888.88", shown: "88.888.888,88" },
  totalProfit: { raw: "77777777.77", shown: "77.777.777,77" },
  totalManHours: { raw: "555666", shown: "555.666" },
} as const;

export const PRICED_UNIT_PRICE = "128.80";
export const PRICED_AMOUNT = "12880.00";

interface ItemSpec {
  id: string;
  groupId: string;
  poz: string;
  description?: string;
  /** `null` → fiyatsız kalem. */
  unitPrice: string | null;
  quantity?: string;
}

export function makeItem(spec: ItemSpec): OfferItemRead {
  const priced = spec.unitPrice !== null;
  const quantity = spec.quantity ?? "100.000";
  return {
    id: spec.id,
    group_id: spec.groupId,
    sort_order: 0,
    catalog_item_id: `cat-${spec.id}`,
    poz_no: spec.poz,
    description: spec.description ?? `Tarif ${spec.poz}`,
    unit: "m3",
    quantity,
    unit_mhr: LEAK_SENTINELS.itemUnitMhr.raw,
    cost_unit_price: LEAK_SENTINELS.itemCostUnitPrice.raw,
    overhead_pct: LEAK_SENTINELS.itemOverheadPct.raw,
    profit_pct: LEAK_SENTINELS.itemProfitPct.raw,
    offer_unit_price: spec.unitPrice === null ? null : LEAK_SENTINELS.itemCostUnitPrice.raw,
    priced,
    customer: priced
      ? { unit_price: spec.unitPrice, amount: spec.unitPrice === "0" ? "0" : PRICED_AMOUNT }
      : null,
    internal: {
      cost: LEAK_SENTINELS.itemCost.raw,
      overhead: LEAK_SENTINELS.itemOverhead.raw,
      profit: LEAK_SENTINELS.itemProfit.raw,
      profit_pct: LEAK_SENTINELS.itemProfitPct.raw,
      man_hours: LEAK_SENTINELS.itemManHours.raw,
    },
  };
}

/** `n` kalemli grup (`prefix` kimlik öneki). Her kalem fiyatlı, B.F. 128,80 / tutar 12.880,00. */
export function makeGroup(id: string, name: string, itemCount: number, extra: ItemSpec[] = []) {
  const items = [
    ...Array.from({ length: itemCount }, (_, index) =>
      makeItem({ id: `${id}-i${index}`, groupId: id, poz: `${id.toUpperCase()}.${index + 1}`, unitPrice: PRICED_UNIT_PRICE }),
    ),
    ...extra.map((spec) => makeItem({ ...spec, groupId: id })),
  ];
  return { id, name, sort_order: 0, items };
}

/** Mockup TKL-2026-0014 · Rev.2: üç grup, ikisi fiyatsız kalem içerir. */
export function makePrintRevision(overrides: Partial<OfferRevisionRead> = {}): OfferRevisionRead {
  return {
    ...makeRevision({ rev_no: 2 }),
    groups: [
      makeGroup("g1", "Kaba İnşaat", 2),
      makeGroup("g2", "İnce İşler", 1, [
        { id: "g2-np", groupId: "g2", poz: "G2.NP", description: "Fiyatı girilmemiş kalem", unitPrice: null },
      ]),
    ],
    totals: {
      unpriced_count: 1,
      customer: { net: "73982140.00", vat: "14796428.00", gross: "88778568.00" },
      internal: {
        cost: LEAK_SENTINELS.totalCost.raw,
        overhead: LEAK_SENTINELS.totalOverhead.raw,
        profit: LEAK_SENTINELS.totalProfit.raw,
        profit_pct: LEAK_SENTINELS.itemProfitPct.raw,
        man_hours: LEAK_SENTINELS.totalManHours.raw,
      },
    },
    ...overrides,
  };
}

export function makePrintOffer(overrides: Partial<OfferDetailRead> = {}): OfferDetailRead {
  return makeDetail(overrides);
}

export function makeCompany(overrides: Partial<CompanyRead> = {}): CompanyRead {
  return {
    id: "company-1",
    name: "Fiil Yapı A.Ş.",
    address: "Atatürk Cad. No:12 Kadıköy / İstanbul",
    tax_number: "1234567890",
    tax_office: "Kadıköy",
    phone: "0216 555 00 00",
    email: "teklif@fiilyapi.example",
    website: "www.fiilyapi.example",
    has_logo: false,
    logo_url: null,
    brand_color: null,
    default_vat_rate: "20.00",
    auto_einvoice: false,
    earsiv_portal: null,
    gib_integration_code: null,
    kep_address: null,
    trade_registry_no: null,
    ...overrides,
  } as CompanyRead;
}
