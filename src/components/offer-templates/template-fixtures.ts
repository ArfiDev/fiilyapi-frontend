/**
 * TKL-F4.5 · Şablon ekranı test fikstürleri (mockup `Teklif - Sablonlar.dc.html` TS:163-171 verisi).
 * Test-DIŞI adlıdır; `vitest` İMPORT ETMEZ.
 */
import type {
  OfferTemplateDetail,
  OfferTemplateGroupRead,
  OfferTemplateItemRead,
  OfferTemplateListItem,
} from "@/lib/api/hooks/useOfferTemplates";

let seq = 0;

export function makeTemplateItem(catalogItemId: string, overrides: Partial<OfferTemplateItemRead> = {}): OfferTemplateItemRead {
  seq += 1;
  return {
    id: `titem-${seq}`,
    sort_order: 0,
    catalog_item_id: catalogItemId,
    poz_no: `03.00${seq}`,
    description: `Kalem ${catalogItemId}`,
    unit: "m³",
    ...overrides,
  };
}

export function makeTemplateGroup(
  name: string,
  catalogItemIds: readonly string[],
  overrides: Partial<OfferTemplateGroupRead> = {},
): OfferTemplateGroupRead {
  seq += 1;
  return {
    id: `tgroup-${seq}`,
    name,
    sort_order: 0,
    items: catalogItemIds.map((id, index) => makeTemplateItem(id, { sort_order: index })),
    ...overrides,
  };
}

export function makeTemplateDetail(overrides: Partial<OfferTemplateDetail> = {}): OfferTemplateDetail {
  const groups = overrides.groups ?? [makeTemplateGroup("Betonarme", ["cat-1", "cat-2"]), makeTemplateGroup("Kalıp", ["cat-3"])];
  return {
    id: "tpl-1",
    name: "Konut · kaba inşaat",
    description: "Temelden çatıya betonarme karkas",
    overhead_pct: "12.00",
    profit_pct: "15.00",
    is_default: true,
    group_count: groups.length,
    item_count: groups.reduce((sum, group) => sum + group.items.length, 0),
    usage_count: 7,
    created_at: "2026-09-01T08:00:00Z",
    updated_at: "2026-09-12T09:30:00Z",
    ...overrides,
    groups,
  };
}

export function makeTemplateListItem(overrides: Partial<OfferTemplateListItem> = {}): OfferTemplateListItem {
  return {
    id: "tpl-1",
    name: "Konut · kaba inşaat",
    description: "Temelden çatıya betonarme karkas",
    overhead_pct: "12.00",
    profit_pct: "15.00",
    is_default: true,
    group_count: 2,
    item_count: 3,
    usage_count: 7,
    updated_at: "2026-09-12T09:30:00Z",
    ...overrides,
  };
}
