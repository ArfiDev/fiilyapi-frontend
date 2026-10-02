import { describe, expect, it } from "vitest";

import { buildOfferItemCreateBody, type OfferItemDraft } from "./offer-item-body";

const BASE: OfferItemDraft = {
  catalogItemId: "cat-1",
  groupId: "grp-1",
  quantity: "12,5",
  cost: { kind: "suggest" },
};

describe("buildOfferItemCreateBody — `cost_unit_price` ÜÇ hâli (SO-6 / T38)", () => {
  it("DOKUNULMAMIŞ (suggest): alan gövdede YOK → sunucu katalogdan önerir", () => {
    const body = buildOfferItemCreateBody(BASE);
    expect(Object.hasOwn(body, "cost_unit_price")).toBe(false);
    expect(JSON.stringify(body)).not.toContain("cost_unit_price");
  });

  it("BİLİNÇLİ BOŞ (empty): açık null — öneri son fiyat/referansa RAĞMEN boş kalır", () => {
    const body = buildOfferItemCreateBody({ ...BASE, cost: { kind: "empty" } });
    expect(Object.hasOwn(body, "cost_unit_price")).toBe(true);
    expect(body.cost_unit_price).toBeNull();
    expect(JSON.stringify(body)).toContain('"cost_unit_price":null');
  });

  it("DEĞER (value): metin olarak gider, sayıya ÇEVRİLMEZ", () => {
    const body = buildOfferItemCreateBody({ ...BASE, cost: { kind: "value", value: "77.50" } });
    expect(body.cost_unit_price).toBe("77.50");
    expect(typeof body.cost_unit_price).toBe("string");
  });

  it("`0` bir DEĞERDİR (boş DEĞİL): '0.00' gövdeye girer", () => {
    expect(buildOfferItemCreateBody({ ...BASE, cost: { kind: "value", value: "0.00" } }).cost_unit_price).toBe("0.00");
  });
});

describe("buildOfferItemCreateBody — diğer alanlar", () => {
  it("zorunlular: katalog kalemi, grup, miktar (metin)", () => {
    expect(buildOfferItemCreateBody(BASE)).toEqual({
      catalog_item_id: "cat-1",
      group_id: "grp-1",
      quantity: "12,5",
    });
  });

  it("verilmeyen isteğe bağlı alanlar gövdeye GİRMEZ (a-s katalogdan, sıra sunucudan)", () => {
    const body = buildOfferItemCreateBody(BASE);
    for (const key of ["unit_mhr", "sort_order", "overhead_pct", "profit_pct", "offer_unit_price"]) {
      expect(Object.hasOwn(body, key), key).toBe(false);
    }
  });

  it("verilen isteğe bağlı alanlar aynen gider; sıra 0 da bir DEĞERDİR", () => {
    const body = buildOfferItemCreateBody({
      ...BASE,
      cost: { kind: "value", value: "100.00" },
      overheadPct: "5",
      profitPct: "10",
      offerUnitPrice: "140.00",
      unitMhr: "0.85",
      sortOrder: 0,
    });
    expect(body).toEqual({
      catalog_item_id: "cat-1",
      group_id: "grp-1",
      quantity: "12,5",
      cost_unit_price: "100.00",
      overhead_pct: "5",
      profit_pct: "10",
      offer_unit_price: "140.00",
      unit_mhr: "0.85",
      sort_order: 0,
    });
  });

  it("girdiyi DEĞİŞTİRMEZ (immutability)", () => {
    const draft: OfferItemDraft = Object.freeze({ ...BASE, cost: Object.freeze({ kind: "empty" as const }) });
    expect(() => buildOfferItemCreateBody(draft)).not.toThrow();
  });
});
