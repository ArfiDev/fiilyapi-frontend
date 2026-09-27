import { describe, it, expect } from "vitest";

import { EMPTY_CELL, formatWindKmh as generalFormatWindKmh } from "@/lib/format";
import { asFractionOrNull } from "@/lib/api/scale";

import {
  formatFixedDecimal,
  formatPercent01,
  formatPf,
  formatUnitRate,
  formatVariancePoints,
  formatWindKmh,
} from "./format";

describe("formatPf — sabit 2 ondalık, bantla AYNI yuvarlama (K18)", () => {
  it("sondaki sıfırı korur: 1 → '1,00'", () => {
    expect(formatPf("1")).toBe("1,00");
  });

  it("0,9499 → '0,95'", () => {
    expect(formatPf("0.9499")).toBe("0,95");
  });

  it("tam yarım yukarı: 0.945 (number) → '0,95'", () => {
    expect(formatPf(0.945)).toBe("0,95");
  });

  it("float kalıntısına düşmez: 1.005 → '1,01' (1.005 * 100 === 100.49999999999999)", () => {
    expect(formatPf(1.005)).toBe("1,01");
  });

  it("veri yok → ürün kanonu boş hücre (K20)", () => {
    expect(formatPf(null)).toBe(EMPTY_CELL);
    expect(formatPf(undefined)).toBe(EMPTY_CELL);
    expect(formatPf("abc")).toBe(EMPTY_CELL);
  });
});

describe("formatPercent01 — 0–1 kesir → '%x,y' (spec §3.6)", () => {
  it("0,459 → '%45,9' (varsayılan 1 ondalık)", () => {
    expect(formatPercent01("0.459")).toBe("%45,9");
  });

  it("sondaki sıfırı korur: 0,52 → '%52,0' (Panel:356-366)", () => {
    expect(formatPercent01("0.52")).toBe("%52,0");
  });

  it("2 ondalık (Günlük Rapor günlük %): 0,0062 → '%0,62'", () => {
    expect(formatPercent01("0.0062", 2)).toBe("%0,62");
  });

  it("tam yarım yukarı: 0.4485 → '%44,9'", () => {
    expect(formatPercent01(asFractionOrNull(0.4485))).toBe("%44,9");
  });

  it("binlik ayraç: 12,345 → '%1.234,5'", () => {
    expect(formatPercent01("12.345")).toBe("%1.234,5");
  });

  it("veri yok → boş hücre", () => {
    expect(formatPercent01(null)).toBe(EMPTY_CELL);
  });
});

describe("formatVariancePoints — 0–1 sapma → işaretli puan (Panel:470 `sgn`)", () => {
  it("−0,026 → '−2,6' (U+2212 eksi)", () => {
    expect(formatVariancePoints("-0.026")).toBe("−2,6");
  });

  it("+0,016 → '+1,6'", () => {
    expect(formatVariancePoints("0.016")).toBe("+1,6");
  });

  it("yuvarlanınca sıfır → işaretsiz '0,0'", () => {
    expect(formatVariancePoints("-0.0004")).toBe("0,0");
  });

  it("tam yarım sıfırdan uzağa: −0,0205 → '−2,1'", () => {
    expect(formatVariancePoints("-0.0205")).toBe("−2,1");
  });

  it("veri yok → boş hücre", () => {
    expect(formatVariancePoints(undefined)).toBe(EMPTY_CELL);
  });

  /**
   * PLN-F3.6b LİDER TALEBİ (C'nin GİR trend "Fark (puan)" satırı için) —
   * `digits` opsiyonel parametresi. VARSAYILANI DEĞİŞMEZ (geriye uyumlu,
   * yukarıdaki 1-hane testleri AYNEN geçer); verilirse hem YUVARLAMA hem
   * BASILAN ondalık sayısı `digits`e göre olur.
   */
  it("digits=2 → iki ondalık yuvarlama ve basım: −0,0256 → '−2,56'", () => {
    expect(formatVariancePoints("-0.0256", 2)).toBe("−2,56");
  });

  it("digits=0 → tam sayıya yuvarlanır: +0,164 → '+16'", () => {
    expect(formatVariancePoints("0.164", 0)).toBe("+16");
  });

  it("digits verilmezse VARSAYILAN (1 hane) DEĞİŞMEZ", () => {
    expect(formatVariancePoints("-0.026")).toBe("−2,6");
  });
});

describe("formatUnitRate — a-s/birim: ≥ 10 → 1 ondalık, aksi 2 (KAT:410 · Q:318-321)", () => {
  it("0,85 → '0,85'", () => {
    expect(formatUnitRate("0.85")).toBe("0,85");
  });

  it("2 → '2,00'", () => {
    expect(formatUnitRate("2")).toBe("2,00");
  });

  it("1.400 → '1.400,0'", () => {
    expect(formatUnitRate("1400")).toBe("1.400,0");
  });

  it("9,996 → '10,00' değil: eşik HAM değere göre, 2 ondalık", () => {
    expect(formatUnitRate("9.996")).toBe("10,00");
  });

  it("veri yok → boş hücre", () => {
    expect(formatUnitRate(null)).toBe(EMPTY_CELL);
  });
});

describe("formatWindKmh — genel `lib/format`tan YENİDEN İHRAÇ (PLN-F2.1)", () => {
  // Davranış testleri `src/lib/format.test.ts`e taşındı. Burada yalnız EV
  // çağıranlarının kırılmadığı kilitlenir: aynı fonksiyon, kopya değil.
  it("`@/lib/earned-value` üzerinden gelen fonksiyon genel olanın AYNISIDIR", () => {
    expect(formatWindKmh).toBe(generalFormatWindKmh);
    expect(formatWindKmh("5")).toBe("18 km/sa");
  });
});

/**
 * LİDER TALEBİ (ORTAK, 2026-09-26) — sabit basamaklı ondalık biçimleyici;
 * B'nin `qurr formatFixedQuantity`si ve C'nin tolerans etiketi BURADAN
 * çağıracak. `formatPf`in AYNI `roundHalfUp` + `formatFixed` deseni,
 * genel `digits` parametresiyle.
 */
describe("formatFixedDecimal — sabit basamaklı ondalık (ORTAK)", () => {
  it("'2.0' basamak=1 → '2,0'", () => {
    expect(formatFixedDecimal("2.0", 1)).toBe("2,0");
  });

  it("'520' basamak=1 → '520,0' (sondaki sıfır EKLENİR)", () => {
    expect(formatFixedDecimal("520", 1)).toBe("520,0");
  });

  it("basamak=0 → tam sayıya yuvarlanır: '2.6' → '3'", () => {
    expect(formatFixedDecimal("2.6", 0)).toBe("3");
  });

  it("basamak=2 → '1' → '1,00'", () => {
    expect(formatFixedDecimal("1", 2)).toBe("1,00");
  });

  it("tam yarım yukarı (ROUND_HALF_UP): '0.45' basamak=1 → '0,5'", () => {
    expect(formatFixedDecimal("0.45", 1)).toBe("0,5");
  });

  it("negatif değer: '-3.14' basamak=1 → '-3,1'", () => {
    expect(formatFixedDecimal("-3.14", 1)).toBe("-3,1");
  });

  it("null/geçersiz → EMPTY_CELL", () => {
    expect(formatFixedDecimal(null, 1)).toBe(EMPTY_CELL);
    expect(formatFixedDecimal(undefined, 1)).toBe(EMPTY_CELL);
    expect(formatFixedDecimal("abc", 1)).toBe(EMPTY_CELL);
  });

  it("binlik ayraç basar: '12345.6' basamak=1 → '12.345,6'", () => {
    expect(formatFixedDecimal("12345.6", 1)).toBe("12.345,6");
  });
});
