import { describe, expect, it } from "vitest";

import { makeCompany, makePrintOffer, makePrintRevision } from "./offer-print-fixtures";
import { buildInternalPrintModel } from "./print-model-internal";

const model = () => buildInternalPrintModel({ offer: makePrintOffer(), revision: makePrintRevision(), company: makeCompany() });
const flatRows = () => model().pages.flatMap((page) => page.parts.flatMap((part) => part.rows));

describe("iç döküm modeli", () => {
  it("kalem satırı: A-s/birim · maliyet B.F. · maliyet · gider % · kâr % · teklif B.F. · tutar", () => {
    const item = flatRows().find((row) => row.kind === "item");
    expect(item).toMatchObject({
      unitMhr: "333,33",
      costUnitPrice: "888.888,88",
      cost: "777.777,77",
      overheadPct: "%11,11",
      profitPct: "%22,22",
      unitPrice: "128,80",
      amount: "12.880,00",
    });
  });

  it("fiyatsız kalem: teklif B.F./tutar '—'; maliyet dolu kalır", () => {
    const row = flatRows().find((r) => r.kind === "item" && r.poz === "G2.NP");
    expect(row).toMatchObject({ unitPrice: "—", amount: "—", isUnpriced: true, cost: "777.777,77" });
  });

  it("grup ara toplamı: maliyet Σ + adam-saat Σ + tutar Σ", () => {
    const subtotal = flatRows().find((row) => row.kind === "subtotal");
    expect(subtotal).toMatchObject({ cost: "1.555.555,54", manHours: "888.888", amount: "25.760,00" });
  });

  it("toplamlar: KDV hariç · KDV · genel · maliyet · genel gider · kâr · adam-saat · fiyatsız", () => {
    expect(model().totals.map((row) => [row.label, row.value])).toEqual([
      ["Toplam (KDV hariç)", "₺ 73.982.140,00"],
      ["KDV %20", "₺ 14.796.428,00"],
      ["Genel toplam", "₺ 88.778.568,00"],
      ["Maliyet", "₺ 99.999.999,99"],
      ["Genel gider (%12)", "₺ 88.888.888,88"],
      ["Kâr (%22,22)", "₺ 77.777.777,77"],
      ["Toplam adam-saat", "555.666"],
      ["Fiyatsız kalem", "1"],
    ]);
  });
});
