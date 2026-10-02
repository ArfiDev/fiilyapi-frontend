import { describe, expect, it } from "vitest";

import { makeItem, makeUnpricedItem, makeUnquantifiedItem } from "./offer-item-fixtures";
import { quantityBasisOf } from "./offer-item-cells";
import { groupCode, groupTotals } from "./offer-items-model";

function basisFor(items: ReturnType<typeof makeItem>[], unquantified: number) {
  return [items, quantityBasisOf(items, unquantified)] as const;
}

describe("groupCode — kod harfi sıradan TÜREV (A, B, C…)", () => {
  it("A–Z sonra AA, AB…", () => {
    expect([0, 1, 2, 25].map(groupCode)).toEqual(["A", "B", "C", "Z"]);
    expect([26, 27, 51, 52].map(groupCode)).toEqual(["AA", "AB", "AZ", "BA"]);
  });
});

describe("groupTotals — istemci Σ kayıpsız (gösterim; hesap sunucuda)", () => {
  it("Σ tutar/maliyet/adam-saat: 0,10 + 0,20 = 0,30 (float 0.30000000000000004 DEĞİL)", () => {
    const a = makeItem({
      id: "a",
      customer: { unit_price: "0.10", amount: "0.10" },
      internal: { cost: "0.10", man_hours: "1.5000", overhead: "0.00", profit: "0.00", profit_pct: "0.00" },
    });
    const b = makeItem({
      id: "b",
      customer: { unit_price: "0.20", amount: "0.20" },
      internal: { cost: "0.20", man_hours: "2.2500", overhead: "0.00", profit: "0.00", profit_pct: "0.00" },
    });
    expect(groupTotals([a, b], quantityBasisOf([a, b], 0))).toEqual({ count: 2, manHours: "3.7500", cost: "0.30", amount: "0.30" });
  });

  it("büyük tutarda kuruş hassasiyeti korunur", () => {
    const a = makeItem({
      id: "a",
      customer: { unit_price: "1.00", amount: "73982140.01" },
      internal: { cost: "50000000.10", man_hours: "1.0000", overhead: "0", profit: "0", profit_pct: "0" },
    });
    const b = makeItem({
      id: "b",
      customer: { unit_price: "1.00", amount: "0.99" },
      internal: { cost: "0.05", man_hours: "1.0000", overhead: "0", profit: "0", profit_pct: "0" },
    });
    expect(groupTotals([a, b], quantityBasisOf([a, b], 0))).toMatchObject({ cost: "50000000.15", amount: "73982141.00" });
  });

  it("fiyatsız kalem tutar/maliyet toplamına GİRMEZ ama adam-saat toplamına girer; sayısı sayılır", () => {
    const totals = groupTotals(...basisFor([makeItem({ id: "a" }), makeUnpricedItem({ id: "b" })], 0));
    expect(totals).toEqual({ count: 2, manHours: "41.0000", cost: "1000.00", amount: "1288.00" });
  });

  it("maskeli (fiyatlı ama para null) kalem varsa toplam BİLİNMEZ: null (0 DEĞİL)", () => {
    const masked = makeItem({
      id: "m",
      cost_unit_price: null,
      customer: { unit_price: null, amount: null },
      internal: { cost: null, man_hours: "18.0000", overhead: null, profit: null, profit_pct: null },
    });
    const totals = groupTotals(...basisFor([makeItem({ id: "a" }), masked], 0));
    expect(totals.cost).toBeNull();
    expect(totals.amount).toBeNull();
    expect(totals.manHours).toBe("36.0000");
  });

  it("boş grup: sayı 0, toplamlar '0' (maskeli DEĞİL)", () => {
    expect(groupTotals([], quantityBasisOf([], 0))).toEqual({ count: 0, manHours: "0", cost: "0", amount: "0" });
  });
});

describe("🔴 F4.2 groupTotals: miktarsız kalem Σ'dan ATLANIR (bugünkü kusur: Σ '—' oluyordu)", () => {
  it("fiyatlı miktarlı + fiyatlı miktarsız → Σ tutar/maliyet/a-s YALNIZ miktarlıdan, BİLİNMEZ DEĞİL", () => {
    const filled = makeItem({ id: "a" });
    const missing = makeUnquantifiedItem({ id: "b" });
    const totals = groupTotals(...basisFor([filled, missing], 1));
    expect(totals).toEqual({ count: 2, manHours: "18.0000", cost: "1000.00", amount: "1288.00" });
  });

  it("grupta YALNIZ miktarsız kalem varsa Σ '0' (null değil): kalem yok sayılır", () => {
    const totals = groupTotals(...basisFor([makeUnquantifiedItem({ id: "b" })], 1));
    expect(totals).toEqual({ count: 1, manHours: "0", cost: "0", amount: "0" });
  });

  it("fiyatsız + miktarsız kalem de Σ'ya girmez; fiyatsız miktarlı kalemin a-s'si girer", () => {
    const unpricedMissing = makeUnpricedItem({
      id: "u",
      quantity: null,
      internal: { cost: null, man_hours: null, overhead: null, profit: null, profit_pct: null },
    });
    const totals = groupTotals(...basisFor([makeItem({ id: "a" }), makeUnpricedItem({ id: "b" }), unpricedMissing], 1));
    expect(totals).toEqual({ count: 3, manHours: "41.0000", cost: "1000.00", amount: "1288.00" });
  });

  it("🔴 finance maskesi ≠ miktarsız: miktar null ama sayaç 0 → para Σ'ya GİRER (maskeli para ise BİLİNMEZ)", () => {
    const maskedQty = makeItem({ id: "m", quantity: null });
    const totals = groupTotals(...basisFor([maskedQty, makeItem({ id: "n", quantity: null })], 0));
    expect(totals).toMatchObject({ cost: "2000.00", amount: "2576.00" });
    const maskedMoney = makeItem({ id: "p", quantity: null, customer: { unit_price: null, amount: null }, internal: { cost: null, man_hours: "18.0000", overhead: null, profit: null, profit_pct: null } });
    expect(groupTotals(...basisFor([maskedMoney], 0)).amount).toBeNull();
  });
});
