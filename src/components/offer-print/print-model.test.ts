import { describe, expect, it } from "vitest";

import { makeCompany, makePrintOffer, makePrintRevision } from "./offer-print-fixtures";
import {
  EMPTY_PRICE,
  PORTRAIT_LAYOUT,
  buildPrintFrame,
  formatMoney,
  paginateOfferRows,
  type PageLayout,
} from "./print-model";

interface Row {
  groupId: string;
  groupName: string;
}
const rows = (groupId: string, count: number): Row[] =>
  Array.from({ length: count }, () => ({ groupId, groupName: groupId }));
const counts = (pages: ReturnType<typeof paginateOfferRows<Row>>) =>
  pages.map((page) => page.parts.map((part) => part.rows.length));

const LAYOUT: PageLayout = { firstCapacity: 4, capacity: 8, lastReserve: 3 };

describe("paginateOfferRows — sayfalama (TKL-F3.7)", () => {
  it("boş liste → tek boş sayfa (başlık + toplam + imza yine basılır)", () => {
    expect(counts(paginateOfferRows<Row>([], LAYOUT))).toEqual([[]]);
  });

  it("grup BÖLÜNMEZ: sığmayan grup tümüyle sonraki sayfaya geçer", () => {
    const pages = paginateOfferRows([...rows("a", 3), ...rows("b", 3), ...rows("c", 2)], LAYOUT);
    expect(counts(pages)).toEqual([[3], [3, 2]]);
    expect(pages.flatMap((page) => page.parts).every((part) => !part.continued)).toBe(true);
  });

  it("ilk sayfa daha az satır alır (başlık + künye bloğu)", () => {
    const pages = paginateOfferRows([...rows("a", 4), ...rows("b", 4)], LAYOUT);
    expect(counts(pages)).toEqual([[4], [4]]);
  });

  it("son sayfada toplam+imza payı sığmıyorsa toplam AYRI sayfaya düşer", () => {
    // Son sayfa 8 satırla dolu: 8 + 3 > 8 → boş son sayfa eklenir.
    const pages = paginateOfferRows([...rows("a", 4), ...rows("b", 8)], LAYOUT);
    expect(counts(pages)).toEqual([[4], [8], []]);
  });

  it("son sayfada pay sığıyorsa ek sayfa AÇILMAZ", () => {
    const pages = paginateOfferRows([...rows("a", 4), ...rows("b", 5)], LAYOUT);
    expect(counts(pages)).toEqual([[4], [5]]);
  });

  it("tek başına sayfadan büyük grup zorunlu bölünür; devam parçası işaretlenir", () => {
    const pages = paginateOfferRows(rows("big", 20), LAYOUT);
    const parts = pages.flatMap((page) => page.parts);
    expect(parts.map((part) => part.continued)).toEqual([false, true, true]);
    expect(parts.reduce((sum, part) => sum + part.rows.length, 0)).toBe(20);
  });

  it("gerçek düzen sabitleri pozitif ve ilk sayfa ≤ sonraki sayfa", () => {
    expect(PORTRAIT_LAYOUT.firstCapacity).toBeGreaterThan(0);
    expect(PORTRAIT_LAYOUT.firstCapacity).toBeLessThanOrEqual(PORTRAIT_LAYOUT.capacity);
  });
});

describe("formatMoney — yalnız TL, hep iki kuruş hanesi", () => {
  it.each([
    ["128.80", "128,80"],
    ["12880", "12.880,00"],
    ["0", "0,00"],
    ["73982140.5", "73.982.140,50"],
  ])("%s → %s", (input, expected) => {
    expect(formatMoney(input)).toBe(expected);
  });

  it("null → '—' (maskeli/fiyatsız; sıfır DEĞİL)", () => {
    expect(formatMoney(null)).toBe(EMPTY_PRICE);
  });
});

describe("buildPrintFrame — başlık (Ayarlar › Şirket) + künye + koşullar + imza", () => {
  const offer = makePrintOffer();
  const revision = makePrintRevision();

  it("logo yok → unvan basılır, logo yok", () => {
    const frame = buildPrintFrame({ offer, revision, company: makeCompany({ has_logo: false }), kind: "isveren" });
    expect(frame.company.title).toBe("Fiil Yapı A.Ş.");
    expect(frame.company.logoSrc).toBeNull();
  });

  it("logo var → logo uç adresi (unvan alt metin olarak kalır)", () => {
    const frame = buildPrintFrame({ offer, revision, company: makeCompany({ has_logo: true }), kind: "isveren" });
    expect(frame.company.logoSrc).toBe("/api/backend/company/logo");
    expect(frame.company.title).toBe("Fiil Yapı A.Ş.");
  });

  it("şirket yüklenmediyse/unvan boşsa başlık boş (uyarı ekranda, yazdırmada değil)", () => {
    expect(buildPrintFrame({ offer, revision, company: null, kind: "ic" }).company.title).toBeNull();
    expect(buildPrintFrame({ offer, revision, company: makeCompany({ name: null }), kind: "ic" }).company.title).toBeNull();
  });

  it("iletişim satırları: adres · VKN/vergi dairesi · telefon · e-posta · web (dolu olanlar)", () => {
    const frame = buildPrintFrame({ offer, revision, company: makeCompany({ website: null }), kind: "isveren" });
    expect(frame.company.lines).toEqual([
      "Atatürk Cad. No:12 Kadıköy / İstanbul",
      "Kadıköy V.D. · VKN 1234567890",
      "0216 555 00 00",
      "teklif@fiilyapi.example",
    ]);
  });

  it("künye: teklif no + Rev · tarih · geçerlilik · işveren · iş adı · kapsam", () => {
    const frame = buildPrintFrame({ offer, revision, company: makeCompany(), kind: "isveren" });
    expect(frame.heading).toBe("TKL-2026-0014 · Rev.2");
    expect(frame.kunye).toEqual([
      { label: "Teklif tarihi", value: "28.09.2026" },
      { label: "Geçerlilik bitişi", value: "28.10.2026" },
      { label: "İşveren", value: "Kuzey Gayrimenkul A.Ş." },
      { label: "İş adı", value: "Güneşkent Konut Kompleksi" },
      { label: "Kapsam", value: "Kaba inşaat · 4 blok, 96 daire" },
    ]);
  });

  it("koşullar: ödeme · teslim süresi · fiyat farkı (endeks türüyle) · notlar", () => {
    const sabit = buildPrintFrame({ offer, revision, company: makeCompany(), kind: "isveren" });
    expect(sabit.terms).toEqual([
      { label: "Ödeme koşulları", value: "Aylık hakediş, 30 gün vadeli" },
      { label: "Teslim süresi", value: "420 takvim günü" },
      { label: "Fiyat farkı", value: "Sabit fiyat" },
      { label: "Notlar", value: "Şantiye elektrik ve su aboneliği işverene aittir." },
    ]);
    const tuik = buildPrintFrame({
      offer,
      revision: makePrintRevision({ price_escalation: "tuik", price_index_type: "tufe" }),
      company: makeCompany(),
      kind: "isveren",
    });
    expect(tuik.terms.find((term) => term.label === "Fiyat farkı")?.value).toBe("TÜİK endeksli · TÜFE");
  });

  it("boş koşul satırı basılmaz", () => {
    const frame = buildPrintFrame({
      offer,
      revision: makePrintRevision({ payment_terms: null, delivery_days: null, notes: null }),
      company: makeCompany(),
      kind: "isveren",
    });
    expect(frame.terms.map((term) => term.label)).toEqual(["Fiyat farkı"]);
  });

  it("imza: Hazırlayan adı dolu, Onaylayan boş; altlık tür etiketi", () => {
    const isveren = buildPrintFrame({ offer, revision, company: makeCompany(), kind: "isveren" });
    expect(isveren.signatures).toEqual([
      { role: "Hazırlayan", name: "Selin Aksoy" },
      { role: "Onaylayan", name: null },
    ]);
    expect(isveren.footerLabel).toBe("TKL-2026-0014 · Rev.2 · İşveren teklifi");
    expect(buildPrintFrame({ offer, revision, company: makeCompany(), kind: "ic" }).footerLabel).toBe(
      "TKL-2026-0014 · Rev.2 · İç döküm",
    );
  });
});
