import { describe, expect, it } from "vitest";

import { makeCompany, makePrintOffer, makePrintRevision } from "./offer-print-fixtures";
import {
  EMPTY_PRICE,
  PORTRAIT_LAYOUT,
  buildPrintFrame,
  closingPartsOf,
  formatMoney,
  paginateByHeights,
  paginateOfferRows,
  type ClosingPartId,
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

  it("koşullar: ödeme · teslim süresi · fiyat farkı (endeks türüyle); notlar AYRI kapanış parçası (TKL-F3.8.1)", () => {
    const sabit = buildPrintFrame({ offer, revision, company: makeCompany(), kind: "isveren" });
    expect(sabit.terms).toEqual([
      { label: "Ödeme koşulları", value: "Aylık hakediş, 30 gün vadeli" },
      { label: "Teslim süresi", value: "420 takvim günü" },
      { label: "Fiyat farkı", value: "Sabit fiyat" },
    ]);
    expect(sabit.notes).toBe("Şantiye elektrik ve su aboneliği işverene aittir.");
    expect(closingPartsOf(sabit)).toEqual(["totals", "terms", "notes", "signature"]);
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
    expect(frame.notes).toBeNull();
    expect(closingPartsOf(frame)).toEqual(["totals", "terms", "signature"]);
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
/** Tek parçalık kapanış (eski "tek blok" vakaları): öncü/ara boşluk 0 → maliyet = yükseklik. */
const block = (height: number) => [{ id: "totals" as const, height }];
const BUDGETS: PageBudgets = { first: 100, rest: 200, closing: block(80), closingLead: 0, closingGap: 0, continuedHead: 10 };

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
    const pages = paginateByHeights(hrows("big", [90, 90, 90, 90, 90]), { ...BUDGETS, closing: block(10) });
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
    expect(idsOf(paginateByHeights(hrows("a", [150]), { ...BUDGETS, first: 50, closing: block(10) }))).toEqual([[], [["a0"]]]);
  });
});

describe("paginateByHeights — bölünen grubun ilk parçası", () => {
  it("önceki gruplarla dolu sayfada başlayan büyük grubun İLK parçası 'devam' DEĞİLDİR", () => {
    const pages = paginateByHeights([...hrows("a", [90]), ...hrows("big", [150, 150, 150])], { ...BUDGETS, closing: block(10) });
    const bigParts = pages.flatMap((page) => page.parts).filter((part) => part.rows[0]!.groupId === "big");
    expect(bigParts.map((part) => part.continued)).toEqual([false, true, true]);
  });
});

describe("paginateByHeights — '(devam)' başlığı yer tutar", () => {
  it("devam parçasında başlık satırı yüksekliği bütçeden düşer (10 + 100 + 100 > 200 → iki satır SIĞMAZ)", () => {
    const pages = paginateByHeights(hrows("big", [100, 100, 100, 100]), { ...BUDGETS, closing: block(10) });
    expect(idsOf(pages)).toEqual([[["big0"]], [["big1"]], [["big2"]], [["big3"]]]);
  });
});

/* ─── TKL-F3.8.1 · kapanış PARÇALARI (toplamlar | koşullar | notlar | imza) ─────────────── */
const closingOf = (pages: ReturnType<typeof paginateByHeights<HRow>>) => pages.map((page) => page.closing);
const parts4 = (totals: number, terms: number, notes: number, signature: number) => [
  { id: "totals" as const, height: totals },
  { id: "terms" as const, height: terms },
  { id: "notes" as const, height: notes },
  { id: "signature" as const, height: signature },
];
const SPLIT: PageBudgets = { first: 200, rest: 200, closing: parts4(40, 120, 150, 60), closingLead: 8, closingGap: 4, continuedHead: 10 };

describe("paginateByHeights — kapanış parçaları (TKL-F3.8.1, CEO kararı a)", () => {
  it("🔴 parçalar arasında sayfa geçilir; her parça bütün kalır; sıra korunur; İMZA son sayfada SON parça", () => {
    // s1: a0 150 + (8+40) = 198 ≤ 200 → toplamlar · koşullar 4+120 sığmaz → s2: 8+120 · notlar 4+150 sığmaz →
    // s3: 8+150 · imza 4+60 sığmaz → s4: imza.
    const pages = paginateByHeights(hrows("a", [150]), SPLIT);
    expect(closingOf(pages)).toEqual([["totals"], ["terms"], ["notes"], ["signature"]]);
    expect(idsOf(pages)).toEqual([[["a0"]], [], [], []]);
  });

  it("sığan parçalar aynı sayfada kalır (gereksiz sayfa açılmaz)", () => {
    const pages = paginateByHeights(hrows("a", [20]), { ...SPLIT, closing: parts4(20, 30, 30, 40) });
    expect(closingOf(pages)).toEqual([["totals", "terms", "notes", "signature"]]);
  });

  it("🔴 tek parça sayfadan büyükse KENDİ sayfasında (metin kırpılmaz); sonraki parça yeni sayfada", () => {
    const pages = paginateByHeights(hrows("a", [20]), { ...SPLIT, closing: parts4(20, 30, 500, 40) });
    expect(closingOf(pages)).toEqual([["totals", "terms"], ["notes"], ["signature"]]);
  });

  it("satır yoksa kapanış ilk sayfadan başlar (başlık + künye yine basılır)", () => {
    const pages = paginateByHeights<HRow>([], { ...SPLIT, closing: parts4(20, 30, 30, 40) });
    expect(closingOf(pages)).toEqual([["totals", "terms", "notes", "signature"]]);
    expect(idsOf(pages)).toEqual([[]]);
  });

  it("boş parça (not yok) listede yoksa basılmaz; imza yine son", () => {
    const closing = parts4(40, 120, 0, 60).filter((part) => part.id !== "notes");
    const pages = paginateByHeights(hrows("a", [150]), { ...SPLIT, closing });
    expect(closingOf(pages)).toEqual([["totals"], ["terms", "signature"]]);
  });

  it("🔴 çağıran sırası karışık verse de sıra kanoniktir: toplamlar → koşullar → notlar → imza", () => {
    const shuffled = [...parts4(20, 30, 30, 40)].reverse();
    const pages = paginateByHeights(hrows("a", [20]), { ...SPLIT, closing: shuffled });
    expect(pages.flatMap((page) => page.closing)).toEqual(["totals", "terms", "notes", "signature"]);
  });

  it("değişmez (rastgele 300 vaka): her parça TAM BİR kez, imza son sayfanın son parçası, sayfa başına kapanış sıralı", () => {
    let seed = 7;
    const rand = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return 1 + (seed % max);
    };
    for (let round = 0; round < 300; round += 1) {
      const closing = parts4(rand(250), rand(250), rand(250), rand(250));
      const rowsIn = hrows(`g${round}`, Array.from({ length: rand(6) }, () => rand(120)));
      const pages = paginateByHeights(rowsIn, { ...SPLIT, closing });
      const flat = pages.flatMap((page) => page.closing);
      expect(flat).toEqual<ClosingPartId[]>(["totals", "terms", "notes", "signature"]);
      expect(pages[pages.length - 1]!.closing.at(-1)).toBe("signature");
      expect(pages.slice(0, -1).every((page) => !page.closing.includes("signature"))).toBe(true);
    }
  });
});

describe("paginateOfferRows — statik ilk tahmin: kapanış parçaları son sayfada", () => {
  it("verilen parçalar son sayfada, diğer sayfalarda kapanış YOK", () => {
    const pages = paginateOfferRows([...rows("a", 4), ...rows("b", 8)], LAYOUT, ["totals", "terms", "signature"]);
    expect(pages.map((page) => page.closing)).toEqual([...pages.slice(0, -1).map(() => []), ["totals", "terms", "signature"]]);
  });
});
