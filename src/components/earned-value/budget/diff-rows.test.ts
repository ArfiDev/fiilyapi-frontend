import { describe, it, expect } from "vitest";

import { diffByLeaf, diffRows, diffSummary } from "./diff-rows";
import { LEAF_IZO, LEAF_TML, diffOut } from "./budget-fixtures";

describe("diffRows — neden KODU metne çevrilir (B1-14), K22 renk dili", () => {
  it("miktar değişimi: yeni miktar kalın, bütçe ARTIŞI kırmızı (increase)", () => {
    const [row] = diffRows(diffOut());
    expect(row).toEqual({
      leafId: LEAF_TML,
      name: "Beton döküm · Temel",
      note: "BOQ miktar revizyonu",
      oldQty: "1.250 m³",
      newQty: "1.320 m³",
      qtyChanged: true,
      oldRate: "1,80",
      newRate: "1,80",
      rateChanged: false,
      rateMissing: false,
      delta: "+126",
      tone: "increase",
    });
  });

  it("oran değişimi: bölümsüz yaprak 'Bölümsüz', azalış yeşil (decrease)", () => {
    const row = diffRows(diffOut())[1];
    expect(row).toMatchObject({
      name: "Membran yalıtım · Bölümsüz",
      note: "Oran değişti",
      rateChanged: true,
      qtyChanged: false,
      delta: "−114",
      tone: "decrease",
    });
  });

  it.each([
    ["new", "Yeni satır · BOQ bölüm tahsisi eklendi"],
    ["removed", "Satır kaldırıldı · BOQ bölüm tahsisi silindi"],
    ["moved_out", "Başka disipline taşındı / kapsam dışı"],
    ["qty_and_rate_changed", "BOQ miktar revizyonu · oran değişti"],
  ] as const)("neden %s → %s", (reason, note) => {
    const base = diffOut().leaves[0];
    const out = diffRows(diffOut({ leaves: [{ ...base, reason, prev_qty: null, prev_unit_mhr: null }] }));
    expect(out[0].note).toBe(note);
    expect(out[0].oldQty).toBe("—");
  });

  it.each(["removed", "moved_out"] as const)(
    "%s: backend qty/oran null döner → yeni oran '—' (Oran yok DEĞİL), fark eksi (yeşil)",
    (reason) => {
      const base = diffOut().leaves[0];
      const [row] = diffRows(
        diffOut({ leaves: [{ ...base, reason, qty: null, unit_mhr: null, budget_mhr: "0", prev_budget_mhr: "100", delta_mhr: "-100" }] }),
      );
      expect(row).toMatchObject({
        newQty: "—",
        newRate: "—",
        rateMissing: false,
        qtyChanged: true,
        rateChanged: true,
        delta: "−100",
        tone: "decrease",
      });
    },
  );

  it("yeni oran yoksa 'Oran yok' (kırmızı) ve fark '—'", () => {
    const base = diffOut().leaves[0];
    const [row] = diffRows(diffOut({ leaves: [{ ...base, unit_mhr: null, delta_mhr: "0", reason: "rate_changed" }] }));
    expect(row).toMatchObject({ newRate: "Oran yok", rateMissing: true });
  });
});

describe("diffSummary / diffByLeaf", () => {
  it("başlık, sayı ve toplam", () => {
    expect(diffSummary(diffOut())).toEqual({
      title: "Revizyon farkı · Rev 1 → Rev 2",
      count: 2,
      before: "3.291",
      after: "3.516",
      delta: "+225",
      tone: "increase",
      againstNumber: 1,
    });
  });

  it("karşılaştırılacak revizyon yoksa null", () => {
    expect(diffSummary(diffOut({ against: null }))).toBeNull();
  });

  it("yaprak → fark haritası (tabloda sarı vurgu için)", () => {
    const map = diffByLeaf(diffOut());
    expect(map.get(LEAF_TML)?.qtyChanged).toBe(true);
    expect(map.get(LEAF_IZO)?.rateChanged).toBe(true);
    expect(map.get(LEAF_TML)?.oldQtyShort).toBe("1.250");
  });
});
