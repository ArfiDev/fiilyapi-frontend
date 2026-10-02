import { describe, expect, it } from "vitest";

import { makeItem, makeUnpricedItem, makeUnquantifiedItem } from "./offer-item-fixtures";
import { isQuantityMissing } from "./offer-item-cells";
import { groupCode, groupTotals } from "./offer-items-model";

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
    expect(groupTotals([a, b])).toEqual({ count: 2, manHours: "3.7500", cost: "0.30", amount: "0.30" });
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
    expect(groupTotals([a, b])).toMatchObject({ cost: "50000000.15", amount: "73982141.00" });
  });

  it("fiyatsız kalem tutar/maliyet toplamına GİRMEZ ama adam-saat toplamına girer; sayısı sayılır", () => {
    const totals = groupTotals([makeItem({ id: "a" }), makeUnpricedItem({ id: "b" })]);
    expect(totals).toEqual({ count: 2, manHours: "41.0000", cost: "1000.00", amount: "1288.00" });
  });

  it("maskeli (fiyatlı ama para null) kalem varsa toplam BİLİNMEZ: null (0 DEĞİL)", () => {
    const masked = makeItem({
      id: "m",
      cost_unit_price: null,
      customer: { unit_price: null, amount: null },
      internal: { cost: null, man_hours: "18.0000", overhead: null, profit: null, profit_pct: null },
    });
    const totals = groupTotals([makeItem({ id: "a" }), masked]);
    expect(totals.cost).toBeNull();
    expect(totals.amount).toBeNull();
    expect(totals.manHours).toBe("36.0000");
  });

  it("boş grup: sayı 0, toplamlar '0' (maskeli DEĞİL)", () => {
    expect(groupTotals([])).toEqual({ count: 0, manHours: "0", cost: "0", amount: "0" });
  });
});

describe("🔴 F4.2 groupTotals: miktarsız kalem Σ'dan ATLANIR (bugünkü kusur: Σ '—' oluyordu)", () => {
  it("fiyatlı miktarlı + fiyatlı miktarsız → Σ tutar/maliyet/a-s YALNIZ miktarlıdan, BİLİNMEZ DEĞİL", () => {
    const filled = makeItem({ id: "a" });
    const missing = makeUnquantifiedItem({ id: "b" });
    const totals = groupTotals([filled, missing]);
    expect(totals).toEqual({ count: 2, manHours: "18.0000", cost: "1000.00", amount: "1288.00" });
  });

  it("grupta YALNIZ miktarsız kalem varsa Σ '0' (null değil): kalem yok sayılır", () => {
    const totals = groupTotals([makeUnquantifiedItem({ id: "b" })]);
    expect(totals).toEqual({ count: 1, manHours: "0", cost: "0", amount: "0" });
  });

  it("fiyatsız + miktarsız kalem de Σ'ya girmez; fiyatsız miktarlı kalemin a-s'si girer", () => {
    const unpricedMissing = makeUnpricedItem({
      id: "u",
      quantity: null,
      internal: { cost: null, man_hours: null, overhead: null, profit: null, profit_pct: null },
    });
    const totals = groupTotals([makeItem({ id: "a" }), makeUnpricedItem({ id: "b" }), unpricedMissing]);
    expect(totals).toEqual({ count: 3, manHours: "41.0000", cost: "1000.00", amount: "1288.00" });
  });

  it("🔴 finance maskesi ≠ miktarsız: miktar null ama quantified=true → para Σ'ya GİRER (maskeli para ise BİLİNMEZ)", () => {
    const maskedQty = makeItem({ id: "m", quantity: null, quantified: true });
    const totals = groupTotals([maskedQty, makeItem({ id: "n", quantity: null, quantified: true })]);
    expect(totals).toMatchObject({ cost: "2000.00", amount: "2576.00" });
    const maskedMoney = makeItem({ id: "p", quantity: null, quantified: true, customer: { unit_price: null, amount: null }, internal: { cost: null, man_hours: "18.0000", overhead: null, profit: null, profit_pct: null } });
    expect(groupTotals([maskedMoney]).amount).toBeNull();
  });
});

describe("🔴 F4.2b · finance kapsamı: karar `quantified` bayrağından (sayaç-eşitlik sezgiseli DEĞİL)", () => {
  // Opus çürütmesi: aynı grupta A (miktar MASKELİ null, quantified=true) + B (gerçekten miktarsız), sayaç 1.
  const maskedFilled = makeItem({
    id: "a",
    quantity: null,
    quantified: true,
    customer: { unit_price: "128.80", amount: "1288.00" },
    internal: { cost: "1000.00", man_hours: "18", overhead: "120.00", profit: "168.00", profit_pct: "15.00" },
  });
  const trulyMissing = makeUnquantifiedItem({ id: "b", quantity: null, quantified: false, customer: { unit_price: "128.80", amount: null } });

  it("Σ yalnız quantified kalemden: {amount 1288.00, manHours 18}; '—' (null) OLMAZ", () => {
    const totals = groupTotals([maskedFilled, trulyMissing]);
    expect(totals.amount).toBe("1288.00");
    expect(totals.manHours).toBe("18");
    expect(totals.cost).toBe("1000.00");
  });

  it("isQuantityMissing: A uyarısız, B uyarılı", () => {
    expect(isQuantityMissing(maskedFilled)).toBe(false);
    expect(isQuantityMissing(trulyMissing)).toBe(true);
  });
});
