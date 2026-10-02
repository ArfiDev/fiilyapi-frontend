import { describe, expect, it } from "vitest";

import { LEAK_SENTINELS, PRICED_UNIT_PRICE, makeCompany, makeGroup, makePrintOffer, makePrintRevision } from "./offer-print-fixtures";
import { buildCustomerPrintModel } from "./print-model-customer";

function build(revisionOverrides = {}) {
  return buildCustomerPrintModel({ offer: makePrintOffer(), revision: makePrintRevision(revisionOverrides), company: makeCompany() });
}
const flatRows = (model: ReturnType<typeof build>) => model.pages.flatMap((page) => page.parts.flatMap((part) => part.rows));

describe("işveren modeli — satırlar", () => {
  it("grup başlığı + kalemler + grup ara toplamı sırasıyla (kayıpsız toplam)", () => {
    const rows = flatRows(build());
    expect(rows.map((row) => row.kind)).toEqual([
      "group", "item", "item", "subtotal", // Kaba İnşaat
      "group", "item", "item", "subtotal", // İnce İşler
    ]);
    const subtotals = rows.filter((row) => row.kind === "subtotal");
    expect(subtotals.map((row) => row.amount)).toEqual(["25.760,00", "12.880,00"]);
  });

  it("fiyatsız kalem: B.F. ve tutar '—' (0 DEĞİL), satır basılır, işaretli", () => {
    const unpriced = flatRows(build()).find((row) => row.kind === "item" && row.poz === "G2.NP");
    expect(unpriced).toMatchObject({ kind: "item", unitPrice: "—", amount: "—", isUnpriced: true });
  });

  it("fiyat 0 GERÇEK fiyattır: '0,00' basılır, fiyatsız sayılmaz (sıfır ≠ null)", () => {
    const model = buildCustomerPrintModel({
      offer: makePrintOffer(),
      revision: makePrintRevision({ groups: [makeGroup("g1", "Kaba İnşaat", 0, [{ id: "z", groupId: "g1", poz: "Z.1", unitPrice: "0" }])] }),
      company: makeCompany(),
    });
    const item = flatRows(model).find((row) => row.kind === "item");
    expect(item).toMatchObject({ unitPrice: "0,00", amount: "0,00", isUnpriced: false });
  });

  it("tamamı fiyatsız grubun ara toplamı '—'", () => {
    const model = buildCustomerPrintModel({
      offer: makePrintOffer(),
      revision: makePrintRevision({
        groups: [makeGroup("g1", "Boş fiyat", 0, [{ id: "n", groupId: "g1", poz: "N.1", unitPrice: null }])],
      }),
      company: makeCompany(),
    });
    expect(flatRows(model).find((row) => row.kind === "subtotal")).toMatchObject({ amount: "—" });
  });

  it("kalemsiz grup basılmaz", () => {
    const model = buildCustomerPrintModel({
      offer: makePrintOffer(),
      revision: makePrintRevision({ groups: [makeGroup("g0", "Boş", 0), makeGroup("g1", "Dolu", 1)] }),
      company: makeCompany(),
    });
    expect(flatRows(model).filter((row) => row.kind === "group").map((row) => row.name)).toEqual(["Dolu"]);
  });
});

describe("işveren modeli — toplamlar + dipnot", () => {
  it("KDV hariç · KDV %n · genel toplam (yalnız customer toplamları, ₺)", () => {
    expect(build().totals).toEqual([
      { label: "Toplam (KDV hariç)", value: "₺73.982.140,00", tone: "net" },
      { label: "KDV %20", value: "₺14.796.428,00" },
      { label: "Genel toplam", value: "₺88.778.568,00", tone: "gross" },
    ]);
  });

  it("fiyatsız kalem varsa dipnot: '* Fiyatı belirlenmemiş N kalem toplama dahil değildir'", () => {
    expect(build().footnote).toBe("* Fiyatı belirlenmemiş 1 kalem toplama dahil değildir.");
  });

  it("fiyatsız yoksa dipnot yok", () => {
    expect(build({ totals: { ...makePrintRevision().totals, unpriced_count: 0 } }).footnote).toBeNull();
  });
});

describe("işveren modeli — iç veri ÇIKTIYA TAŞINMAZ (sızıntı, model katmanı)", () => {
  it("serileştirilmiş model hiçbir iç sentinel değeri içermez", () => {
    const serialized = JSON.stringify(build());
    for (const { raw, shown } of Object.values(LEAK_SENTINELS)) {
      expect(serialized).not.toContain(raw);
      expect(serialized).not.toContain(shown);
    }
    expect(serialized).not.toContain("internal");
    expect(serialized).not.toContain(PRICED_UNIT_PRICE.replace(".", ",") + "9");
  });
});
