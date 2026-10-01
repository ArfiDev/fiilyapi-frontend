import { describe, it, expect } from "vitest";

import {
  distributeRemaining,
  remainingQuantity,
  type DistributeRemainingItem,
} from "./distribute-remaining";

const key = (itemId: string, columnId: string) => `${itemId}|${columnId}`;
const COLUMNS = ["c1", "c2"] as const;

function item(
  id: string,
  quantity: string,
  shares: Record<string, string> = {},
): DistributeRemainingItem {
  return { id, quantity, shares: new Map(Object.entries(shares)) };
}

function run(
  items: DistributeRemainingItem[],
  drafts: Record<string, string> = {},
  targetColumnId = "c2",
) {
  return distributeRemaining({
    items,
    columnIds: COLUMNS,
    targetColumnId,
    drafts: new Map(Object.entries(drafts)),
    cellKey: key,
  });
}

describe("distributeRemaining", () => {
  it("boş hücreye kalanı yazar", () => {
    const result = run([item("i1", "100.000", { c1: "30.000" })]);

    expect(result.drafts.get(key("i1", "c2"))).toBe("70");
    expect(result.changedCount).toBe(1);
    expect(result.skippedCount).toBe(0);
  });

  it("dolu hücrenin üstüne ekler (toplar)", () => {
    const result = run([item("i1", "100.000", { c1: "30.000", c2: "20.000" })]);

    expect(result.drafts.get(key("i1", "c2"))).toBe("70");
  });

  it("kalan 0 ise kaleme dokunmaz ve atlanmış saymaz", () => {
    const result = run([item("i1", "100.000", { c1: "60.000", c2: "40.000" })]);

    expect(result.drafts.size).toBe(0);
    expect(result.changedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
  });

  it("geçersiz taslaklı kalemi atlar ve skipped sayar", () => {
    const result = run(
      [item("i1", "100", { c1: "10" }), item("i2", "50")],
      { [key("i1", "c1")]: "abc" },
    );

    expect(result.drafts.get(key("i1", "c2"))).toBeUndefined();
    expect(result.drafts.get(key("i2", "c2"))).toBe("50");
    expect(result.changedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
  });

  it("negatif ya da yarım biçimli taslak da geçersizdir", () => {
    const result = run([item("i1", "100"), item("i2", "100")], {
      [key("i1", "c1")]: "-5",
      [key("i2", "c1")]: "1.",
    });

    expect(result.skippedCount).toBe(2);
    expect(result.changedCount).toBe(0);
  });

  it("taslakta aşım (kalan < 0) olan kalemi atlar", () => {
    const result = run([item("i1", "100", { c1: "30" })], { [key("i1", "c1")]: "150" });

    expect(result.drafts.get(key("i1", "c2"))).toBeUndefined();
    expect(result.skippedCount).toBe(1);
    expect(result.changedCount).toBe(0);
  });

  it("taslak sunucu payının yerine geçer (etkin değer)", () => {
    // sunucu c1=30 ama taslak c1=90 → kalan 10
    const result = run([item("i1", "100", { c1: "30" })], { [key("i1", "c1")]: "90" });

    expect(result.drafts.get(key("i1", "c2"))).toBe("10");
  });

  it("virgüllü taslağı normalize eder", () => {
    const result = run([item("i1", "10")], { [key("i1", "c1")]: "1,5" });

    expect(result.drafts.get(key("i1", "c2"))).toBe("8.5");
  });

  it("boş taslak (hücre boşaltıldı) 0 sayılır", () => {
    const result = run([item("i1", "10", { c1: "4" })], { [key("i1", "c1")]: "" });

    expect(result.drafts.get(key("i1", "c2"))).toBe("10");
  });

  it("ondalık hassasiyet: 0.1 + 0.2 float tuzağı yok", () => {
    const result = run([item("i1", "1", { c1: "0.1" })], { [key("i1", "c1")]: "0.1" }, "c2");
    // 1 − 0.1 = 0.9 (0.8999999999999999 DEĞİL)
    expect(result.drafts.get(key("i1", "c2"))).toBe("0.9");

    const result2 = run(
      [item("i2", "0.3")],
      { [key("i2", "c1")]: "0.1", [key("i2", "c2")]: "0.2" },
    );
    expect(result2.changedCount).toBe(0);
    expect(result2.skippedCount).toBe(0);
  });

  it("sondaki sıfırları kırpar ('120.500' → '120.5', '1900.000' → '1900')", () => {
    const result = run([
      item("i1", "200.000", { c1: "79.500" }),
      item("i2", "2000.000", { c1: "100.000" }),
    ]);

    expect(result.drafts.get(key("i1", "c2"))).toBe("120.5");
    expect(result.drafts.get(key("i2", "c2"))).toBe("1900");
  });

  it("girdi taslak haritasını değiştirmez", () => {
    const drafts = new Map([[key("i1", "c1"), "10"]]);
    const snapshot = [...drafts];

    const result = distributeRemaining({
      items: [item("i1", "100")],
      columnIds: COLUMNS,
      targetColumnId: "c2",
      drafts,
      cellKey: key,
    });

    expect([...drafts]).toEqual(snapshot);
    expect(result.drafts).not.toBe(drafts);
    expect(result.drafts.get(key("i1", "c1"))).toBe("10");
  });

  it("hiçbir değişiklik yoksa changedCount 0 ve aynı içerik döner", () => {
    const result = run([]);

    expect(result.changedCount).toBe(0);
    expect(result.skippedCount).toBe(0);
    expect(result.changedKeys).toEqual([]);
  });

  it("değişen hücre anahtarlarını changedKeys ile bildirir", () => {
    const result = run([item("i1", "10"), item("i2", "10", { c1: "10" })]);

    expect(result.changedKeys).toEqual([key("i1", "c2")]);
  });

  it("PERFORMANS: 500 kalem × 4 kolon tek çağrıda makul sürede", () => {
    const columnIds = ["c1", "c2", "c3", "c4"];
    const items = Array.from({ length: 500 }, (_, index) =>
      item(`i${index}`, "1000.000", { c1: "100.000", c2: "50.500", c3: "0.250" }),
    );

    const startedAt = performance.now();
    const result = distributeRemaining({
      items,
      columnIds,
      targetColumnId: "c4",
      drafts: new Map(),
      cellKey: key,
    });
    const elapsed = performance.now() - startedAt;

    expect(result.changedCount).toBe(500);
    expect(result.drafts.get(key("i0", "c4"))).toBe("849.25");
    expect(elapsed).toBeLessThan(250); // ölçülen ≪ 50 ms; CI gevşekliği
  });
});

describe("remainingQuantity", () => {
  it("quantity − Σ etkin değer (taslak sunucu payını ezer)", () => {
    const i = item("i1", "100.000", { c1: "30.000", c2: "20.000" });

    expect(remainingQuantity(i, COLUMNS, new Map(), key)).toBe("50.000");
    expect(remainingQuantity(i, COLUMNS, new Map([[key("i1", "c1"), "60"]]), key)).toBe(
      "20.000",
    );
  });

  it("geçersiz taslak varsa null döner", () => {
    const i = item("i1", "100");

    expect(remainingQuantity(i, COLUMNS, new Map([[key("i1", "c1"), "x"]]), key)).toBeNull();
  });
});
