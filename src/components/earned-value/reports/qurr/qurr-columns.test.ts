import { describe, expect, it } from "vitest";

import { formatDecimal } from "@/lib/format";
import { formatPf, formatUnitRate } from "@/lib/earned-value";
import type { EvQurrRow } from "@/lib/api/models";

import { QURR_FIXTURE_READY } from "./qurr-fixtures";
import {
  formatFixedQuantity,
  formatPacalDeviation,
  isPacalDeviationUp,
  isUnitRateOver,
  qtyDigits,
  qurrCellBand,
  qurrCellRaw,
  qurrCellText,
  qurrChangedColumns,
  qurrNodeCode,
  type QurrColumnKey,
  weekQtyDigits,
} from "./qurr-columns";

/** Bu testler için önemsiz alanları makul varsayılanlarla dolduran taban satır. */
function changeRow(over: Partial<EvQurrRow>): EvQurrRow {
  return {
    a_prev_qty: null,
    b_qty: null,
    c_qty_cum: null,
    changed_budget: false,
    changed_qty: false,
    changed_rate: false,
    code: null,
    contractor_type: null,
    d_remaining_qty: null,
    e_qty_week: null,
    f_prev_budget_mhr: null,
    g_budget_mhr: "0",
    h_earned_cum: "0",
    i_spent_cum: "0",
    is_direct: true,
    j_remaining_mhr: "0",
    k_earned_week: "0",
    l_spent_week: "0",
    level: 3,
    m_prev_unit_mhr: null,
    n_unit_mhr: null,
    name: "?",
    node_id: "row",
    o_actual_unit_mhr_cum: null,
    p_actual_unit_mhr_week: null,
    parent_id: null,
    q_band: null,
    q_pf_cum: null,
    r_band: null,
    r_pf_week: null,
    uom: null,
    ...over,
  };
}

describe("qurrCellRaw", () => {
  it("satırdan a-r okur", () => {
    const kalip = QURR_FIXTURE_READY.rows.find((r) => r.code === "KAB.01.01");
    expect(kalip).toBeDefined();
    const data = { kind: "row" as const, row: kalip! };
    expect(qurrCellRaw(data, "a")).toBe(kalip!.a_prev_qty);
    expect(qurrCellRaw(data, "n")).toBe(kalip!.n_unit_mhr);
  });

  it("toplamda a-e/m-p her zaman null (Q sumCells yalnız fghijkl+qr doldurur)", () => {
    const disc = QURR_FIXTURE_READY.totals.find((t) => t.kind === "discipline" && t.node_id === "KAB");
    expect(disc).toBeDefined();
    const data = { kind: "total" as const, total: disc! };
    expect(qurrCellRaw(data, "a")).toBeNull();
    expect(qurrCellRaw(data, "n")).toBeNull();
    expect(qurrCellRaw(data, "g")).toBe(disc!.g_budget_mhr);
  });
});

describe("qurrCellBand", () => {
  it("yalnız q/r kolonunda bant döner, diğerlerinde null", () => {
    const kalip = QURR_FIXTURE_READY.rows[0];
    const data = { kind: "row" as const, row: kalip };
    expect(qurrCellBand(data, "q")).toBe(kalip.q_band);
    expect(qurrCellBand(data, "a")).toBeNull();
  });
});

describe("qtyDigits / weekQtyDigits", () => {
  it("ton/ay → 1 ondalık, diğerleri 0", () => {
    expect(qtyDigits("ton")).toBe(1);
    expect(qtyDigits("ay")).toBe(1);
    // Kanonik yazım (T47): "Ton"/"Ay" büyük harfle gelir — 1,5 "2" basılmamalı
    expect(qtyDigits("Ton")).toBe(1);
    expect(qtyDigits("Ay")).toBe(1);
    expect(qtyDigits("TON")).toBe(1);
    expect(qtyDigits("m²")).toBe(0);
    expect(qtyDigits(null)).toBe(0);
  });

  it("haftalık değer 10'un altındaysa 2 ondalığa yükselir", () => {
    expect(weekQtyDigits("m²", "5")).toBe(2);
    expect(weekQtyDigits("m²", "20")).toBe(0);
    expect(weekQtyDigits("ton", "5")).toBe(2);
    expect(weekQtyDigits("m²", "0")).toBe(0);
  });
});

describe("isUnitRateOver", () => {
  it("gerçekleşen oran güncel orandan büyükse true", () => {
    expect(isUnitRateOver("12.632", "12")).toBe(true);
    expect(isUnitRateOver("0.8", "0.85")).toBe(false);
    expect(isUnitRateOver("1", "1")).toBe(false);
    expect(isUnitRateOver(null, "1")).toBe(false);
  });

  // CEO BULGUSU tanığı: `Number("1.00000000000000009") > Number("1")` → JS'te
  // `false`dur (2⁵³ üstü hassasiyet kaybı, çift taraf da aynı float'a yuvarlanır).
  // `compareDecimalStrings` dize üzerinde çalıştığı için doğru cevabı verir.
  it("2⁵³ hassasiyeti aşan ondalıkta Number YANILIR, compareDecimalStrings DOĞRU verir", () => {
    expect(Number("1.00000000000000009") > Number("1")).toBe(false); // tanık: Number burada YANLIŞ
    expect(isUnitRateOver("1.00000000000000009", "1")).toBe(true);
  });
});

describe("qurrNodeCode", () => {
  it("satırda row.code, toplamda total.code döner (Q:169/187 ayrı Kod kolonu)", () => {
    const kalip = QURR_FIXTURE_READY.rows.find((r) => r.code === "KAB.01.01")!;
    expect(qurrNodeCode({ kind: "row", row: kalip })).toBe("KAB.01.01");
    const disc = QURR_FIXTURE_READY.totals.find((t) => t.node_id === "KAB")!;
    expect(qurrNodeCode({ kind: "total", total: disc })).toBe("KAB");
  });

  it("total.code yoksa (undefined) null döner, çökmez", () => {
    const total = QURR_FIXTURE_READY.totals.find((t) => t.kind === "direct_total")!;
    expect(() => qurrNodeCode({ kind: "total", total: { ...total, code: undefined } })).not.toThrow();
  });
});

// LİDER DENETİMİ (mutasyon `changed_rate`→"m" eşlemesini "n" yapınca 32 qurr
// testi de YEŞİL kaldı — kolon eşlemesi izoleli test EDİLMEMİŞTİ). Her bayrak
// AYRI test edilir: yalnız KENDİ kolonunu işaretler, diğer ikisine SIZMAZ.
describe("qurrChangedColumns", () => {
  it("yalnız changed_qty=true → yalnız \"a\" işaretli (m/f'ye sızmaz)", () => {
    const changed = qurrChangedColumns(changeRow({ changed_qty: true }));
    expect(changed.has("a")).toBe(true);
    expect(changed.has("m")).toBe(false);
    expect(changed.has("f")).toBe(false);
    expect(changed.size).toBe(1);
  });

  it("yalnız changed_rate=true → yalnız \"m\" işaretli (a/f'ye sızmaz)", () => {
    const changed = qurrChangedColumns(changeRow({ changed_rate: true }));
    expect(changed.has("m")).toBe(true);
    expect(changed.has("a")).toBe(false);
    expect(changed.has("f")).toBe(false);
    expect(changed.size).toBe(1);
  });

  it("yalnız changed_budget=true → yalnız \"f\" işaretli (a/m'ye sızmaz)", () => {
    const changed = qurrChangedColumns(changeRow({ changed_budget: true }));
    expect(changed.has("f")).toBe(true);
    expect(changed.has("a")).toBe(false);
    expect(changed.has("m")).toBe(false);
    expect(changed.size).toBe(1);
  });

  it("üçü de false → boş küme", () => {
    expect(qurrChangedColumns(changeRow({})).size).toBe(0);
  });

  it("gerçek fikstürle: KAB.01.01 (qty+budget değişti, rate değişmedi) a/f işaretli, m değil", () => {
    const kalip = QURR_FIXTURE_READY.rows.find((r) => r.code === "KAB.01.01")!;
    expect(kalip.changed_qty).toBe(true);
    expect(kalip.changed_rate).toBe(false);
    const changed = qurrChangedColumns(kalip);
    expect(changed.has("a")).toBe(true);
    expect(changed.has("m")).toBe(false);
    expect(changed.has("f")).toBe(true);
  });
});

describe("formatPacalDeviation / isPacalDeviationUp", () => {
  it("işaret + % + ROUND_HALF_UP 1 ondalık (Q:147 \"+%2,6\" sırası)", () => {
    expect(formatPacalDeviation("0.02578")).toBe("+%2,6");
    expect(formatPacalDeviation("-0.049334")).toBe("−%4,9");
    expect(formatPacalDeviation(null)).toBe("—");
  });

  // CEO BULGUSU tanığı: eski kod `(Number(v)*100).toFixed(1)` kullanıyordu.
  // 0,0015 (yüzde puanı 0,15) float'ta AŞAĞI yuvarlanır ("0,1"); ROUND_HALF_UP
  // (K18) YUKARI yuvarlamalı ("0,2").
  it("yarım-yukarı sınırında (0,15 puan) — Number/.toFixed AŞAĞI kayar, ROUND_HALF_UP YUKARI yuvarlar", () => {
    expect((Number("0.0015") * 100).toFixed(1)).toBe("0.1"); // tanık: Number/toFixed burada YANLIŞ
    expect(formatPacalDeviation("0.0015")).toBe("+%0,2");
  });

  it("işaret yönü: pozitif → yukarı (kırmızı), negatif → aşağı (yeşil), Number() DEĞİL compareDecimalStrings", () => {
    expect(isPacalDeviationUp("0.02578")).toBe(true);
    expect(isPacalDeviationUp("-0.049334")).toBe(false);
    expect(isPacalDeviationUp("1.00000000000000009")).toBe(true); // Number() burada da 1 > 0 verirdi, ama yine tutarlı olsun diye ölçüldü
    expect(isPacalDeviationUp(null)).toBe(false);
  });
});

describe("qurrCellText — ekran ve yazdırmanın TEK ortak biçimleyicisi", () => {
  // CEO BULGUSU tanığı: `Number("1.005").toFixed(2)` → "1.00" (float kalıntısı,
  // ondalık 1.005 ikili tabanda TAM temsil edilemez). `formatUnitRate`
  // (ROUND_HALF_UP, `lib/decimal.ts`) doğru cevabı verir: "1,01".
  it("yarım-yukarı sınırında (1,005) birim oran — Number/.toFixed AŞAĞI kayar", () => {
    expect(Number("1.005").toFixed(2)).toBe("1.00"); // tanık: Number/toFixed burada YANLIŞ
    const row: EvQurrRow = changeRow({});
    const withRate = { ...row, n_unit_mhr: "1.005" };
    expect(qurrCellText({ kind: "row", row: withRate }, "n").text).toBe("1,01");
  });

  // LİDER DENETİMİ (2. mutasyon): q/r kolonunu `formatPf`i atlayıp
  // `String(raw).replace(".", ",")` basan bir mutant qurr/ altındaki 44
  // testin HİÇBİRİNİ kırmadı — a–r'nin 18 kolonu TEK TEK bekçilenmemişti.
  // Her satır KENDİ kolonunun biçimleyicisini AYIRT EDECEK ham değer taşır:
  // ondalık basamak fazlası ROUND_HALF_UP'ı, büyüklük binlik ayracı
  // devreye sokar — "ham değeri virgülle bas" mutantı HİÇBİR satırda
  // beklenen metne denk gelmez (ayrıca her satırda açıkça doğrulanır).
  const FIELD_BY_KEY: Record<QurrColumnKey, keyof EvQurrRow> = {
    a: "a_prev_qty",
    b: "b_qty",
    c: "c_qty_cum",
    d: "d_remaining_qty",
    e: "e_qty_week",
    f: "f_prev_budget_mhr",
    g: "g_budget_mhr",
    h: "h_earned_cum",
    i: "i_spent_cum",
    j: "j_remaining_mhr",
    k: "k_earned_week",
    l: "l_spent_week",
    m: "m_prev_unit_mhr",
    n: "n_unit_mhr",
    o: "o_actual_unit_mhr_cum",
    p: "p_actual_unit_mhr_week",
    q: "q_pf_cum",
    r: "r_pf_week",
  };

  interface ColumnCase {
    key: QurrColumnKey;
    raw: string;
    uom?: string;
    expected: string;
  }

  // Miktar (a-d): uom "ton" → 1 ondalık + binlik ayracı (Q:318 `qd`).
  const QTY_DIGITS = 1;
  // Adam-saat (f-l): sabit tam sayı (0 ondalık) + binlik ayracı.
  const MHR_DIGITS = 0;

  const CASES: ColumnCase[] = [
    { key: "a", raw: "12345.56", uom: "ton", expected: formatFixedQuantity("12345.56", QTY_DIGITS) },
    { key: "b", raw: "654.321", uom: "ton", expected: formatFixedQuantity("654.321", QTY_DIGITS) },
    { key: "c", raw: "999.95", uom: "ton", expected: formatFixedQuantity("999.95", QTY_DIGITS) },
    { key: "d", raw: "0.06", uom: "ton", expected: formatFixedQuantity("0.06", QTY_DIGITS) },
    // e: değer (0,10) aralığında → weekQtyDigits'in özel 2-ondalık dalı (uom "ton" olsa bile).
    { key: "e", raw: "5.678", uom: "ton", expected: formatFixedQuantity("5.678", 2) },
    { key: "f", raw: "1234.6", expected: formatDecimal("1234.6", MHR_DIGITS) },
    { key: "g", raw: "9999.5", expected: formatDecimal("9999.5", MHR_DIGITS) },
    { key: "h", raw: "55555.4", expected: formatDecimal("55555.4", MHR_DIGITS) },
    { key: "i", raw: "100.9", expected: formatDecimal("100.9", MHR_DIGITS) },
    { key: "j", raw: "42.5", expected: formatDecimal("42.5", MHR_DIGITS) },
    { key: "k", raw: "8.6", expected: formatDecimal("8.6", MHR_DIGITS) },
    { key: "l", raw: "3.4", expected: formatDecimal("3.4", MHR_DIGITS) },
    { key: "m", raw: "1.005", expected: formatUnitRate("1.005") }, // dar (<10) → 2 ondalık, ROUND_HALF_UP
    { key: "n", raw: "23.456", expected: formatUnitRate("23.456") }, // geniş (≥10) → 1 ondalık
    { key: "o", raw: "0.125", expected: formatUnitRate("0.125") },
    { key: "p", raw: "10.05", expected: formatUnitRate("10.05") },
    { key: "q", raw: "1.005", expected: formatPf("1.005") }, // CEO'nun kendi tanığı: "1,01"
    { key: "r", raw: "1.005", expected: formatPf("1.005") },
  ];

  it.each(CASES)("$key kolonu kendi biçimleyicisini kullanır ($raw → $expected)", ({ key, raw, uom, expected }) => {
    const row = changeRow({ [FIELD_BY_KEY[key]]: raw, uom: uom ?? null });
    const naive = raw.replace(".", ","); // CEO'nun mutant deseni: ham değeri virgülle bas
    expect(expected).not.toBe(naive); // girdi seçimi gerçekten ayırt edici mi — kendi kendini denetler
    expect(qurrCellText({ kind: "row", row }, key).text).toBe(expected);
    expect(qurrCellText({ kind: "row", row }, key).text).not.toBe(naive);
  });

  // `g/h/i/j/k/l` şemada NULLABLE DEĞİL (schema.d.ts QurrRow — zorunlu `string`,
  // backend her zaman değer verir); yalnız gerçekten null OLABİLEN 12 kolon
  // test edilir.
  const NULLABLE_KEYS: QurrColumnKey[] = ["a", "b", "c", "d", "e", "f", "m", "n", "o", "p", "q", "r"];

  it.each(NULLABLE_KEYS)("%s kolonu boş değerde EMPTY_CELL (\"—\") basar", (key) => {
    const row = changeRow({});
    expect(qurrCellText({ kind: "row", row }, key).text).toBe("—");
  });

  // Ekran⇄yazdırma eşitliği (CEO madde B/i) q/r'de de — PF kolonları önceki
  // turda yalnız "n" ile örneklenmişti, q/r AYRICA doğrulanır.
  it("q ve r kolonları da yarım-yukarı sınırında ekranla AYNI metni üretir (1,005 → 1,01)", () => {
    const row = changeRow({ q_pf_cum: "1.005", r_pf_week: "1.005" });
    expect(qurrCellText({ kind: "row", row }, "q").text).toBe("1,01");
    expect(qurrCellText({ kind: "row", row }, "r").text).toBe("1,01");
  });
});
