import { describe, expect, it } from "vitest";

import { PRICED_UNIT_PRICE, makeCompany, makeGroup, makePrintOffer, makePrintRevision } from "./offer-print-fixtures";
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
      ["Toplam (KDV hariç)", "₺73.982.140,00"],
      ["KDV %20", "₺14.796.428,00"],
      ["Genel toplam", "₺88.778.568,00"],
      ["Maliyet", "₺99.999.999,99"],
      ["Genel gider (%12)", "₺88.888.888,88"],
      ["Kâr (%22,22)", "₺77.777.777,77"],
      ["Toplam adam-saat", "555.666"],
      ["Fiyatsız kalem", "1"],
      ["Miktarsız kalem", "0"],
    ]);
  });
});

describe("🔴 F4.2 iç döküm — miktarsız kalem (SO-21)", () => {
  const revision = () =>
    makePrintRevision({
      groups: [
        makeGroup("g1", "Kaba İnşaat", 1, [{ id: "uq", groupId: "g1", poz: "UQ.1", unitPrice: PRICED_UNIT_PRICE, quantity: null }]),
      ],
      totals: { ...makePrintRevision().totals, unpriced_count: 0, unquantified_count: 3 },
    });
  const built = () => buildInternalPrintModel({ offer: makePrintOffer(), revision: revision(), company: makeCompany() });
  const rows = () => built().pages.flatMap((page) => page.parts.flatMap((part) => part.rows));

  it("satır: Miktar/Maliyet/Tutar '—' (null, 0 DEĞİL); B.F. ve maliyet B.F. basılır", () => {
    const row = rows().find((r) => r.kind === "item" && r.poz === "UQ.1");
    expect(row).toMatchObject({ quantity: "—", cost: "—", amount: "—", unitPrice: "128,80", costUnitPrice: "888.888,88", isUnpriced: false });
  });

  it("grup Σ yalnız dolu değerler: miktarsız kalem maliyet/a-s/tutar toplamına girmez", () => {
    const subtotal = rows().find((r) => r.kind === "subtotal");
    expect(subtotal).toMatchObject({ cost: "777.777,77", manHours: "444.444", amount: "12.880,00" });
  });

  it("özet satırı 'Miktarsız kalem N' sunucu sayacından", () => {
    expect(built().totals.find((row) => row.label === "Miktarsız kalem")).toEqual({ label: "Miktarsız kalem", value: "3" });
  });
});

describe("🔴 F4.2b iç döküm — yalnız miktarsız kalemli grup: boş küme Σ = 0 (ekranla aynı)", () => {
  const rowsOf = (items: Parameters<typeof makeGroup>[3]) =>
    buildInternalPrintModel({
      offer: makePrintOffer(),
      revision: makePrintRevision({ groups: [makeGroup("g1", "Kaba İnşaat", 0, items)] }),
      company: makeCompany(),
    }).pages.flatMap((page) => page.parts.flatMap((part) => part.rows));
  const subtotal = (items: Parameters<typeof makeGroup>[3]) => rowsOf(items).find((r) => r.kind === "subtotal");

  it("fiyatlı+miktarsız tek kalem: maliyet '0,00', a-s '0', tutar '0,00'", () => {
    expect(subtotal([{ id: "uq", groupId: "g1", poz: "UQ.1", unitPrice: PRICED_UNIT_PRICE, quantity: null }])).toMatchObject({
      cost: "0,00",
      manHours: "0",
      amount: "0,00",
    });
  });

  it("kilit: fiyatsız-miktarlı kalem içeren grupta tutar/maliyet '—' KORUNUR (miktarsız eşlik etse de)", () => {
    expect(
      subtotal([
        { id: "n", groupId: "g1", poz: "N.1", unitPrice: null },
        { id: "uq", groupId: "g1", poz: "UQ.1", unitPrice: PRICED_UNIT_PRICE, quantity: null },
      ]),
    ).toMatchObject({ amount: "—" });
  });
});

describe("iç döküm modeli — Bakanlık poz no'su (KAT-F2.2)", () => {
  it("kalem satırı sourceCode taşır; yoksa null", () => {
    const revision = makePrintRevision({
      groups: [
        makeGroup("g1", "Kaba İnşaat", 0, [
          { id: "a", groupId: "g1", poz: "A", unitPrice: PRICED_UNIT_PRICE, sourceCode: "15.250.1011" },
          { id: "c", groupId: "g1", poz: "C", unitPrice: PRICED_UNIT_PRICE },
        ]),
      ],
    });
    const built = buildInternalPrintModel({ offer: makePrintOffer(), revision, company: makeCompany() });
    const items = built.pages.flatMap((page) => page.parts.flatMap((part) => part.rows)).filter((row) => row.kind === "item");
    expect(items.map((row) => row.sourceCode)).toEqual(["15.250.1011", null]);
  });
});
