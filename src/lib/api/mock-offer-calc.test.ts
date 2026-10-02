// @vitest-environment node
//
// 🔴🔴 TEKLİF HESAP İKİZİ — `e2e/mock-offer-calc.ts` ↔ backend `app/modules/offers/calc.py`.
//
// İkiz YANLIŞSA tüm teklif e2e'si SAHTE-YEŞİLDİR: ekran sunucu hesabını gösterir, sahte backend
// ise ikizden döner. Bu dosya ikizi iki bağımsız kaynağa bağlar:
//   1. backend `tests/modules/offers/test_calc.py` vakalarının AYNASI (beklenenler ELLE hesaplı
//      SABİTLER — formülü yeniden yazıp karşılaştırmak ikizi kendi kendine doğrulatırdı);
//   2. GERÇEK `calc.py`nin (Python 3.13 `Decimal`) ürettiği altın vektörler
//      (`e2e/mock-offer-calc.golden.json`, 700 kalem + 60 revizyon, tohum 20261002, yarım
//      kuruş / sıfır / tavan değerleri ağırlıklı): dizi eşitliği (sayı eşitliği DEĞİL — ölçek de).
//
// Formül (calc.py): B.F. = ROUND(c x (1+g) x (1+k)) · tutar = ROUND(B.F. x q) ·
// maliyet = ROUND(c x q) · GG = ROUND(c x (1+g) x q) - maliyet · kâr = tutar - maliyet - GG.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ManualPriceWithoutCostError,
  OfferCalcError,
  calcItem,
  calcRevision,
  compareDecimal,
  percentOfIntegers,
  suggestCost,
  type ItemInput,
  type ItemResult,
} from "../../../e2e/mock-offer-calc";

const REV = { overhead_pct: "12", profit_pct: "15" } as const;

function item(cost: string | null, quantity: string | null = "1", over: Partial<ItemInput> = {}): ItemInput {
  return {
    quantity,
    unit_mhr: "1",
    cost_unit_price: cost,
    overhead_pct: null,
    profit_pct: null,
    offer_unit_price: null,
    ...over,
  };
}

/** (B.F., tutar, maliyet, GG, kâr) — fiyatlı kalem. */
function values(input: ItemInput, rev: { overhead_pct: string; profit_pct: string } = REV) {
  const r = calcItem(input, rev);
  if (r.customer === null) throw new Error("kalem fiyatsız çıktı");
  return [
    r.customer.unit_price,
    r.customer.amount,
    r.internal.cost,
    r.internal.overhead,
    r.internal.profit,
  ] as const;
}

function sameNumber(actual: string | null, expected: string, label: string): void {
  expect(actual, `${label}: null`).not.toBeNull();
  expect(compareDecimal(actual as string, expected), `${label}: ${actual} ≠ ${expected}`).toBe(0);
}

describe("🔴 kalem (calc.py test_calc.py aynası)", () => {
  it("c100 g12 k15 → birim fiyat 128,80", () => {
    expect(values(item("100"))).toEqual(["128.80", "128.80", "100.00", "12.00", "16.80"]);
  });

  it("miktar 10 → tutar / maliyet / GG / kâr", () => {
    expect(values(item("100", "10"))).toEqual(["128.80", "1288.00", "1000.00", "120.00", "168.00"]);
  });

  it("maliyet 0: fiyatlı ve hepsi sıfır", () => {
    const r = calcItem(item("0", "5"), REV);
    expect(r.priced).toBe(true);
    expect(r.customer).toEqual({ unit_price: "0.00", amount: "0.00" });
    expect([r.internal.cost, r.internal.overhead, r.internal.profit]).toEqual(["0.00", "0.00", "0.00"]);
  });

  it.each([
    // 10 x 1.0005 = 10.005 → HALF_UP 10.01 (banker's: 10.00)
    ["0.05", "10.01"],
    // 10 x 1.0025 = 10.025 → HALF_UP 10.03 (banker's: 10.02)
    ["0.25", "10.03"],
  ])("birim fiyat yarım kuruş ROUND_HALF_UP (kâr %s → %s)", (profitPct, expected) => {
    const [unit] = values(item("10", "1", { overhead_pct: "0", profit_pct: profitPct }));
    expect(unit).toBe(expected);
  });

  it("tutar ve maliyet yarım kuruşta yukarı (1,00 x 0,005 → 0,01)", () => {
    expect(values(item("1", "0.005", { overhead_pct: "0", profit_pct: "0" }))).toEqual([
      "1.00",
      "0.01",
      "0.01",
      "0.00",
      "0.00",
    ]);
  });

  it("kalem GG ve kâr % revizyon yüzdesini EZER (200 x 1,05 x 1,10 = 231)", () => {
    expect(values(item("200", "1", { overhead_pct: "5", profit_pct: "10" }))).toEqual([
      "231.00",
      "231.00",
      "200.00",
      "10.00",
      "21.00",
    ]);
  });

  it("kalem yalnız GG ezer, kâr revizyondan gelir", () => {
    expect(values(item("100", "1", { overhead_pct: "0" }))[0]).toBe("115.00");
  });

  it("kalemde '0' bir DEĞERDİR (ezer); null revizyona düşer", () => {
    expect(values(item("100", "1", { overhead_pct: "0", profit_pct: "0" }))[0]).toBe("100.00");
    expect(values(item("100", "1", { overhead_pct: null, profit_pct: null }))[0]).toBe("128.80");
  });

  it("elle B.F. → türev kâr % (140 / (100 x 1,12) - 1 = %25)", () => {
    const r = calcItem(item("100", "2", { offer_unit_price: "140" }), REV);
    expect(r.customer?.unit_price).toBe("140.00");
    expect(r.customer?.amount).toBe("280.00");
    expect([r.internal.cost, r.internal.overhead, r.internal.profit]).toEqual(["200.00", "24.00", "56.00"]);
    expect(r.internal.profit_pct).toBe("25.00");
  });

  it("elle B.F. + maliyet 0 → türev kâr % None, tutar 30", () => {
    const r = calcItem(item("0", "3", { offer_unit_price: "10" }), REV);
    expect(r.internal.profit_pct).toBeNull();
    expect(r.customer?.amount).toBe("30.00");
    expect([r.internal.cost, r.internal.overhead, r.internal.profit]).toEqual(["0.00", "0.00", "30.00"]);
  });

  it("SO-4: maliyet boşken elle B.F. → ManualPriceWithoutCostError (OfferCalcError)", () => {
    const run = () => calcItem(item(null, "1", { offer_unit_price: "100" }), REV);
    expect(run).toThrow(ManualPriceWithoutCostError);
    expect(run).toThrow("Maliyet birim fiyatı boşken elle teklif birim fiyatı girilemez");
    expect(new ManualPriceWithoutCostError("x")).toBeInstanceOf(OfferCalcError);
  });

  it("maliyet yok → fiyatsız ama adam-saat iç yapıda (4 x 2,5 = 10)", () => {
    const r = calcItem(item(null, "4", { unit_mhr: "2.5" }), REV);
    expect(r.priced).toBe(false);
    expect(r.customer).toBeNull();
    sameNumber(r.internal.man_hours, "10", "adam-saat");
    expect([r.internal.cost, r.internal.overhead, r.internal.profit]).toEqual([null, null, null]);
  });

  it("uygulanan kâr % (elle B.F. yokken kalem kârı)", () => {
    expect(calcItem(item("100", "1", { profit_pct: "20" }), REV).internal.profit_pct).toBe("20");
  });

  it("E2a: B.F. ÖNCE yuvarlanır, tutar miktarla büyür (1,00 x 1000 → 1,29 → 1290)", () => {
    expect(values(item("1.00", "1000"))).toEqual(["1.29", "1290.00", "1000.00", "120.00", "170.00"]);
  });

  it("E2b: GG bağımsız yuvarlanmaz, iki yuvarlamanın FARKIDIR", () => {
    // maliyet ROUND(2,525)=2,53 · c(1+g)q = 2,70175 → 2,70 · GG = 0,17 (bağımsız 0,18 olurdu)
    expect(values(item("1.01", "2.5", { overhead_pct: "7" }))).toEqual([
      "1.24",
      "3.10",
      "2.53",
      "0.17",
      "0.40",
    ]);
  });

  it("E5: elle B.F. kuruş üstü hassasiyet savunması 10,005 → 10,01", () => {
    const r = calcItem(item("5", "1", { offer_unit_price: "10.005" }), REV);
    expect(r.customer).toEqual({ unit_price: "10.01", amount: "10.01" });
  });
});

describe("🔴 revizyon (calc.py test_calc.py aynası)", () => {
  const VAT = { ...REV, vat_pct: "20" } as const;

  it("toplamlar ve genel kâr % (278,80 · KDV 55,76 · brüt 334,56 · kâr % 24,46)", () => {
    const r = calcRevision(
      [item("100"), item("100", "1", { offer_unit_price: "150" }), item(null, "2")],
      VAT,
    );
    expect(r.customer).toEqual({ net: "278.80", vat: "55.76", gross: "334.56" });
    expect([r.internal.cost, r.internal.overhead, r.internal.profit]).toEqual(["200.00", "24.00", "54.80"]);
    // 54,80 / 224 = 24,4642.. → 24,46
    expect(r.internal.profit_pct).toBe("24.46");
    expect(r.unpriced_count).toBe(1);
    expect(r.items.map((i) => i.priced)).toEqual([true, true, false]);
  });

  it("fiyatsız kalem toplama GİRMEZ", () => {
    const only = calcRevision([item("100")], VAT);
    const mixed = calcRevision([item("100"), item(null, "50")], VAT);
    expect(mixed.customer).toEqual(only.customer);
    expect(mixed.internal.cost).toBe(only.internal.cost);
    expect(mixed.unpriced_count).toBe(1);
  });

  it("KDV yarım kuruş yukarı (net 0,25 · %10 → 0,025 → 0,03)", () => {
    const r = calcRevision([item("0.25", "1", { overhead_pct: "0", profit_pct: "0" })], {
      ...REV,
      vat_pct: "10",
    });
    expect(r.customer).toEqual({ net: "0.25", vat: "0.03", gross: "0.28" });
  });

  it("toplam adam-saat fiyatsız kalemleri DAHİL eder", () => {
    const r = calcRevision(
      [
        item("1", "2.5", { unit_mhr: "1.8" }),
        item("1", "10", { unit_mhr: "0.25" }),
        item(null, "1", { unit_mhr: "3.0" }),
      ],
      VAT,
    );
    sameNumber(r.internal.man_hours, "10", "toplam adam-saat"); // 4,5 + 2,5 + 3,0
  });

  it("boş revizyon: sıfırlar ve genel kâr % None", () => {
    const r = calcRevision([], VAT);
    sameNumber(r.customer.net, "0", "net");
    sameNumber(r.customer.vat, "0", "kdv");
    sameNumber(r.customer.gross, "0", "brüt");
    expect(r.internal.profit_pct).toBeNull();
    expect(r.unpriced_count).toBe(0);
  });

  it("tüm maliyetler 0 → genel kâr % None", () => {
    expect(calcRevision([item("0")], VAT).internal.profit_pct).toBeNull();
  });

  it("E4: tavandaki girdiler taşmaz ve tam doğrudur (20 000 kalem)", () => {
    const ceiling = item("1000000000000.00", "1000000000", {
      overhead_pct: "100",
      profit_pct: "999.99",
    });
    // B.F. = 1e12 x 2 x 10,9999 ; tutar = B.F. x 1e9 (elle)
    const bf = "21999800000000.00";
    const amount = "21999800000000000000000.00";
    const one = calcItem(ceiling, REV);
    expect(one.customer).toEqual({ unit_price: bf, amount });
    expect(one.internal.cost).toBe("1000000000000000000000.00");
    expect(one.internal.overhead).toBe("1000000000000000000000.00");
    const rev = calcRevision(Array.from({ length: 20_000 }, () => ceiling), { ...REV, vat_pct: "100" });
    expect(rev.customer.net).toBe("439996000000000000000000000.00"); // amount x 20 000
    expect(rev.customer.vat).toBe(rev.customer.net); // KDV %100
    expect(rev.customer.gross).toBe("879992000000000000000000000.00");
  });
});

// --- değişmez (rastgele, tohumlu, deterministik) ----------------------------------------------

/** mulberry32 — tohumlu, tarayıcı/Node bağımsız, deterministik. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function decimalText(units: number, places: number): string {
  const padded = String(units).padStart(places + 1, "0");
  return `${padded.slice(0, padded.length - places)}.${padded.slice(padded.length - places)}`;
}

describe("🔴 DEĞİŞMEZ: maliyet + GG + kâr = tutar (500 rastgele kalem)", () => {
  it("her fiyatlı kalemde BİREBİR ve toplamlarda net = Σ tutar", () => {
    const random = prng(20261002);
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    const inputs: ItemInput[] = [];
    for (let n = 0; n < 500; n += 1) {
      const cost = random() < 0.1 ? null : decimalText(int(0, 2_000_000), 2);
      inputs.push({
        quantity: decimalText(int(1, 5_000_000), 3),
        unit_mhr: decimalText(int(1, 100_000), 4),
        cost_unit_price: cost,
        overhead_pct: random() < 0.5 ? null : decimalText(int(0, 10_000), 2),
        profit_pct: random() < 0.5 ? null : decimalText(int(0, 99_999), 2),
        offer_unit_price: cost !== null && random() < 0.3 ? decimalText(int(0, 3_000_000), 2) : null,
      });
    }
    const rev = calcRevision(inputs, { overhead_pct: "12.37", profit_pct: "15.55", vat_pct: "18.5" });

    let priced = 0;
    let netCents = 0n;
    for (const r of rev.items) {
      if (!r.priced) continue;
      priced += 1;
      const c = r.customer;
      if (c === null || c.amount === null || r.internal.cost === null || r.internal.overhead === null || r.internal.profit === null) {
        throw new Error("fiyatlı kalemde alan eksik");
      }
      const sum = BigInt(r.internal.cost.replace(".", "")) + BigInt(r.internal.overhead.replace(".", "")) + BigInt(r.internal.profit.replace(".", ""));
      expect(sum, `maliyet+GG+kâr ≠ tutar (${c.amount})`).toBe(BigInt(c.amount.replace(".", "")));
      expect(c.amount).toMatch(/^-?\d+\.\d{2}$/);
      netCents += BigInt(c.amount.replace(".", ""));
    }
    expect(priced).toBeGreaterThan(400);
    expect(BigInt(rev.customer.net.replace(".", ""))).toBe(netCents);
    expect(rev.unpriced_count).toBe(500 - priced);
    const total = BigInt(rev.internal.cost.replace(".", "")) + BigInt(rev.internal.overhead.replace(".", "")) + BigInt(rev.internal.profit.replace(".", ""));
    expect(total).toBe(netCents);
    expect(compareDecimal(rev.customer.gross, addTexts(rev.customer.net, rev.customer.vat))).toBe(0);
  });
});

function addTexts(a: string, b: string): string {
  const cents = BigInt(a.replace(".", "")) + BigInt(b.replace(".", ""));
  const text = cents.toString().padStart(3, "0");
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}

// --- suggest_cost -----------------------------------------------------------------------------

describe("suggest_cost (son fiyat → referans → boş)", () => {
  it.each([
    ["5", "10", "5"], // son fiyat kazanır
    [null, "10", "10"], // son yok → referans
    [null, null, null], // ikisi de yok → boş
    ["0", "10", "0"], // sıfır da geçerli bir son fiyattır
  ])("son=%s ref=%s → %s", (last, ref, expected) => {
    expect(suggestCost(last, ref)).toBe(expected);
  });
});

describe("kazanma oranı (liste özeti): ROUND_HALF_UP(kazanılan x 100 / karara bağlanan)", () => {
  it.each([
    [1, 3, "33.33"],
    [2, 3, "66.67"],
    [1, 1, "100.00"],
    [0, 4, "0.00"],
    [1, 8, "12.50"],
    [1, 16, "6.25"],
    [1, 400, "0.25"],
    [1, 800, "0.13"], // 0,125 → yarım yukarı
  ])("%i / %i → %s", (won, decided, expected) => {
    expect(percentOfIntegers(won, decided)).toBe(expected);
  });
});

// --- altın vektörler (gerçek calc.py çıktısı) ---------------------------------------------------

interface GoldenItem {
  input: ItemInput;
  rev: { overhead_pct: string; profit_pct: string };
  expected?: ItemResult;
  error?: string;
}
interface GoldenRevision {
  items: ItemInput[];
  rev: { overhead_pct: string; profit_pct: string; vat_pct: string };
  expected: ReturnType<typeof calcRevision>;
}
interface Golden {
  source: string;
  items: GoldenItem[];
  revisions: GoldenRevision[];
  /** F4.2: miktarı null kalemli vektörler (backend B6 calc.py, SO-21). */
  items_null: GoldenItem[];
  revisions_null: GoldenRevision[];
  /** F4.2b: maliyet = 0 + elle B.F. (türev kâr % `None` dalı), miktarlı ve miktarsız (backend calc.py `loaded_unit > 0`). */
  items_cost0: GoldenItem[];
  revisions_cost0: GoldenRevision[];
}

const GOLDEN = JSON.parse(
  readFileSync(path.join(process.cwd(), "e2e", "mock-offer-calc.golden.json"), "utf8"),
) as Golden;

describe("🔴 altın vektörler: ikiz = GERÇEK calc.py (dizi eşitliği, ölçek dahil)", () => {
  it("vektörler gerçekten yüklendi (sahte-yeşil önlemi)", () => {
    expect(GOLDEN.items.length).toBeGreaterThanOrEqual(700);
    expect(GOLDEN.revisions.length).toBeGreaterThanOrEqual(60);
    expect(GOLDEN.items.filter((v) => v.error !== undefined).length).toBeGreaterThan(0);
    expect(GOLDEN.items.filter((v) => v.expected?.customer?.unit_price !== undefined).length).toBeGreaterThan(500);
    expect(GOLDEN.source).toContain("calc.py");
  });

  it("700 tek kalem: her alan gerçek calc.py ile birebir (hata vakaları dahil)", () => {
    const mismatches: string[] = [];
    GOLDEN.items.forEach((vector, index) => {
      if (vector.error !== undefined) {
        try {
          calcItem(vector.input, vector.rev);
          mismatches.push(`#${index}: hata beklendi, dönmedi`);
        } catch (error) {
          if (!(error instanceof ManualPriceWithoutCostError)) mismatches.push(`#${index}: yanlış hata`);
        }
        return;
      }
      const actual = calcItem(vector.input, vector.rev);
      if (JSON.stringify(actual) !== JSON.stringify(vector.expected)) {
        mismatches.push(`#${index}: ${JSON.stringify(vector.input)} rev ${JSON.stringify(vector.rev)}\n  gerçek ${JSON.stringify(vector.expected)}\n  ikiz   ${JSON.stringify(actual)}`);
      }
    });
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it("60 revizyon: kalem sonuçları + toplamlar gerçek calc.py ile birebir", () => {
    const mismatches: string[] = [];
    GOLDEN.revisions.forEach((vector, index) => {
      const actual = calcRevision(vector.items, vector.rev);
      if (JSON.stringify(actual) !== JSON.stringify(vector.expected)) {
        mismatches.push(`#${index}\n  gerçek ${JSON.stringify(vector.expected)}\n  ikiz   ${JSON.stringify(actual)}`);
      }
    });
    expect(mismatches.slice(0, 3)).toEqual([]);
  });
});

describe("🔴 F4.2 altın vektörler: miktar null (SO-21) = GERÇEK calc.py", () => {
  it("vektörler gerçekten yüklendi ve miktarsız kalem içeriyor (sahte-yeşil önlemi)", () => {
    expect(GOLDEN.items_null.length).toBeGreaterThanOrEqual(250);
    expect(GOLDEN.items_null.filter((v) => v.input.quantity === null).length).toBeGreaterThan(100);
    expect(GOLDEN.items_null.filter((v) => v.input.quantity === null && v.expected?.customer != null).length).toBeGreaterThan(50);
    expect(GOLDEN.revisions_null.filter((v) => v.expected.unquantified_count > 0).length).toBeGreaterThan(40);
    expect(GOLDEN.revisions.every((v) => v.expected.unquantified_count === 0)).toBe(true);
  });

  it("250 tek kalem (miktar null dahil): her alan gerçek calc.py ile birebir", () => {
    const mismatches: string[] = [];
    GOLDEN.items_null.forEach((vector, index) => {
      if (vector.error !== undefined) {
        expect(() => calcItem(vector.input, vector.rev), `#${index}`).toThrow(ManualPriceWithoutCostError);
        return;
      }
      const actual = calcItem(vector.input, vector.rev);
      if (JSON.stringify(actual) !== JSON.stringify(vector.expected)) {
        mismatches.push(`#${index}: ${JSON.stringify(vector.input)}\n  gerçek ${JSON.stringify(vector.expected)}\n  ikiz   ${JSON.stringify(actual)}`);
      }
    });
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it("60 revizyon: miktarsız kalem toplamlara girmez, unquantified_count gerçek calc.py ile birebir", () => {
    const mismatches: string[] = [];
    GOLDEN.revisions_null.forEach((vector, index) => {
      const actual = calcRevision(vector.items, vector.rev);
      if (JSON.stringify(actual) !== JSON.stringify(vector.expected)) {
        mismatches.push(`#${index}\n  gerçek ${JSON.stringify(vector.expected)}\n  ikiz   ${JSON.stringify(actual)}`);
      }
    });
    expect(mismatches.slice(0, 3)).toEqual([]);
  });
});

describe("🔴 F4.2b altın vektörler: maliyet 0 + elle B.F. (türev kâr % None dalı) = GERÇEK calc.py", () => {
  const costZero = GOLDEN.items_cost0.filter((v) => v.input.cost_unit_price !== null && Number(v.input.cost_unit_price) === 0);

  it("vektörler gerçekten yüklendi: miktarlı ≥4, miktarsız ≥4, profit_pct=None dalı hem miktarlı hem miktarsızda (sahte-yeşil önlemi)", () => {
    const filled = costZero.filter((v) => v.input.quantity !== null);
    const empty = costZero.filter((v) => v.input.quantity === null);
    expect(filled.length).toBeGreaterThanOrEqual(4);
    expect(empty.length).toBeGreaterThanOrEqual(4);
    const noPct = (v: GoldenItem) => v.input.offer_unit_price !== null && v.expected?.internal.profit_pct === null;
    expect(filled.filter(noPct).length).toBeGreaterThanOrEqual(3);
    expect(empty.filter(noPct).length).toBeGreaterThanOrEqual(3);
    expect(GOLDEN.revisions_cost0.length).toBeGreaterThanOrEqual(4);
    expect(GOLDEN.revisions_cost0.some((v) => v.expected.internal.profit_pct === null)).toBe(true);
  });

  it("tek kalem: her alan gerçek calc.py ile birebir (türev kâr % maliyet 0 iken null, 0 DEĞİL)", () => {
    const mismatches: string[] = [];
    GOLDEN.items_cost0.forEach((vector, index) => {
      const actual = calcItem(vector.input, vector.rev);
      if (JSON.stringify(actual) !== JSON.stringify(vector.expected)) {
        mismatches.push(`#${index}: ${JSON.stringify(vector.input)}\n  gerçek ${JSON.stringify(vector.expected)}\n  ikiz   ${JSON.stringify(actual)}`);
      }
    });
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it("revizyon: taban (maliyet + GG) 0 iken toplam kâr % null; miktarsız toplamlara girmez; sayaçlar birebir", () => {
    const mismatches: string[] = [];
    GOLDEN.revisions_cost0.forEach((vector, index) => {
      const actual = calcRevision(vector.items, vector.rev);
      if (JSON.stringify(actual) !== JSON.stringify(vector.expected)) {
        mismatches.push(`#${index}\n  gerçek ${JSON.stringify(vector.expected)}\n  ikiz   ${JSON.stringify(actual)}`);
      }
    });
    expect(mismatches.slice(0, 3)).toEqual([]);
  });
});

describe("🔴 F4.2 miktarsız kalem (calc.py test_unquantified.py aynası)", () => {
  it("fiyatlı miktarsız: B.F. VAR; tutar/maliyet/GG/kâr/adam-saat null (0 DEĞİL)", () => {
    const r = calcItem(item("100", null), REV);
    expect(r.priced).toBe(true);
    expect(r.customer).toEqual({ unit_price: "128.80", amount: null });
    expect(r.internal).toEqual({ man_hours: null, cost: null, overhead: null, profit: null, profit_pct: "15" });
  });

  it("elle B.F. + miktarsız: türev kâr % hesaplanır, tutar yok", () => {
    const r = calcItem(item("100", null, { offer_unit_price: "140" }), REV);
    expect(r.customer).toEqual({ unit_price: "140.00", amount: null });
    expect(r.internal.profit_pct).toBe("25.00");
    expect(r.internal.cost).toBeNull();
  });

  it("fiyatsız + miktarsız: customer null, adam-saat null", () => {
    const r = calcItem(item(null, null), REV);
    expect(r.priced).toBe(false);
    expect(r.customer).toBeNull();
    expect(r.internal.man_hours).toBeNull();
  });

  it("toplamlar miktarsızı DIŞLAR; sayaçlar bağımsız (fiyatsız+miktarsız ikisine de girer)", () => {
    const r = calcRevision([item("100", "2"), item("100", null), item(null, null), item(null, "3")], { ...REV, vat_pct: "20" });
    expect(r.customer.net).toBe("257.60");
    expect(r.internal.man_hours).toBe("5");
    expect(r.unpriced_count).toBe(2);
    expect(r.unquantified_count).toBe(2);
  });

  it("tümü miktarsız: toplamlar 0, adam-saat 0 (null değil), sayaç = kalem sayısı", () => {
    const r = calcRevision([item("10", null), item("20", null)], { ...REV, vat_pct: "20" });
    expect(r.customer).toEqual({ net: "0", vat: "0.00", gross: "0.00" });
    expect(r.internal.man_hours).toBe("0");
    expect(r.unquantified_count).toBe(2);
  });
});

// --- yapısal -----------------------------------------------------------------------------------

describe("ikiz kaynağı", () => {
  const SOURCE = readFileSync(path.join(process.cwd(), "e2e", "mock-offer-calc.ts"), "utf8");

  it("para hesabında Number()/parseFloat/toFixed YOK (dize + bigint tabanlı)", () => {
    const code = SOURCE.split("\n").filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*")).join("\n");
    expect(code).not.toMatch(/\bNumber\s*\(/);
    expect(code).not.toMatch(/parseFloat|toFixed|Math\.round/);
  });
});
