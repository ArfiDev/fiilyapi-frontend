import { describe, expect, it } from "vitest";

import { makeCompany, makePrintOffer, makePrintRevision } from "./offer-print-fixtures";
import {
  EMPTY_PRICE,
  PORTRAIT_LAYOUT,
  buildPrintFrame,
  formatMoney,
  paginateByHeights,
  paginateOfferRows,
  type PageBudgets,
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

/* ─── TKL-F3.6.1 · ölçüme dayalı sayfalama (madde 1) ─────────────────────── */
interface HRow {
  groupId: string;
  id: string;
}
const hrows = (groupId: string, heights: number[]) =>
  heights.map((height, index) => ({ row: { groupId, id: `${groupId}${index}` } as HRow, height }));
const idsOf = (pages: ReturnType<typeof paginateByHeights<HRow>>) =>
  pages.map((page) => page.parts.map((part) => part.rows.map((row) => row.id)));
const BUDGETS: PageBudgets = { first: 100, rest: 200, closing: 80, continuedHead: 10 };

describe("paginateByHeights — ölçülen yükseklikle sayfalama", () => {
  it("satır yok → tek boş sayfa", () => {
    expect(idsOf(paginateByHeights<HRow>([], BUDGETS))).toEqual([[]]);
  });

  it("uzun (yüksek) satırlar sayfa bütçesini aşınca bir sonraki sayfaya geçer; statik satır sayısı değil YÜKSEKLİK belirler", () => {
    // 4 satır × 25 px = 100 > ilk sayfa 60; grup sonraki sayfaya (200) bütün sığar (100 + kapanış 80 ≤ 200).
    const pages = paginateByHeights(hrows("a", [25, 25, 25, 25]), { ...BUDGETS, first: 60 });
    expect(idsOf(pages)).toEqual([[], [["a0", "a1", "a2", "a3"]]]);
  });

  it("grup BÖLÜNMEZ: sığmayan grup tümüyle sonraki sayfaya; sığan yenisi yanına", () => {
    const pages = paginateByHeights([...hrows("a", [30, 30]), ...hrows("b", [40, 40, 40])], BUDGETS);
    expect(idsOf(pages)).toEqual([[["a0", "a1"]], [["b0", "b1", "b2"]]]);
  });

  it("tek başına sayfadan büyük grup satır satır bölünür; devam parçası işaretlenir ve devam başlığı yer tutar", () => {
    // rest=200: parça 1 (ilk sayfa boş kalır: ilk satır 90 ≤ 100 → ilk sayfaya girer)
    const pages = paginateByHeights(hrows("big", [90, 90, 90, 90, 90]), { ...BUDGETS, closing: 10 });
    const parts = pages.flatMap((page) => page.parts);
    expect(parts.flatMap((part) => part.rows.map((row) => row.id))).toEqual(["big0", "big1", "big2", "big3", "big4"]);
    expect(parts.map((part) => part.continued)).toEqual([false, true, true]);
    // devam parçası: 10 (başlık) + 90 + 90 = 190 ≤ 200; sonraki sayfaya 3. satır geçmez.
    expect(idsOf(pages)).toEqual([[["big0"]], [["big1", "big2"]], [["big3", "big4"]]]);
  });

  it("tek satır sayfadan büyükse KENDİ sayfasına konur (kırpılmaz, döngüye girmez)", () => {
    const pages = paginateByHeights([...hrows("a", [20]), ...hrows("b", [500]), ...hrows("c", [20])], BUDGETS);
    expect(idsOf(pages).flat(2)).toEqual(["a0", "b0", "c0"]);
    const holder = pages.find((page) => page.parts.some((part) => part.rows.some((row) => row.id === "b0")))!;
    expect(holder.parts.flatMap((part) => part.rows)).toHaveLength(1);
  });

  it("kapanış bloğu son sayfada sığmazsa yeni (boş) sayfaya düşer; sığıyorsa ek sayfa YOK", () => {
    // son sayfa 150 kullanır; 150 + 80 > 200 → boş son sayfa.
    expect(idsOf(paginateByHeights(hrows("a", [150]), { ...BUDGETS, first: 200 }))).toEqual([[["a0"]], []]);
    // 100 + 80 ≤ 200 → ek sayfa yok.
    expect(idsOf(paginateByHeights(hrows("a", [100]), { ...BUDGETS, first: 200 }))).toEqual([[["a0"]]]);
  });

  it("ilk sayfa bütçesi (künye) ilk satıra yetmiyorsa ilk sayfa boş kalır, satırlar sonraki sayfada", () => {
    expect(idsOf(paginateByHeights(hrows("a", [150]), { ...BUDGETS, first: 50, closing: 10 }))).toEqual([[], [["a0"]]]);
  });
});

describe("paginateByHeights — bölünen grubun ilk parçası", () => {
  it("önceki gruplarla dolu sayfada başlayan büyük grubun İLK parçası 'devam' DEĞİLDİR", () => {
    const pages = paginateByHeights([...hrows("a", [90]), ...hrows("big", [150, 150, 150])], { ...BUDGETS, closing: 10 });
    const bigParts = pages.flatMap((page) => page.parts).filter((part) => part.rows[0]!.groupId === "big");
    expect(bigParts.map((part) => part.continued)).toEqual([false, true, true]);
  });
});

describe("paginateByHeights — '(devam)' başlığı yer tutar", () => {
  it("devam parçasında başlık satırı yüksekliği bütçeden düşer (10 + 100 + 100 > 200 → iki satır SIĞMAZ)", () => {
    const pages = paginateByHeights(hrows("big", [100, 100, 100, 100]), { ...BUDGETS, closing: 10 });
    expect(idsOf(pages)).toEqual([[["big0"]], [["big1"]], [["big2"]], [["big3"]]]);
  });
});
