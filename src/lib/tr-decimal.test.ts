import { describe, expect, it } from "vitest";

import { decimalDigitCounts, parseQuantityInput, parseRefPriceInput, REF_PRICE_AMBIGUOUS_DOT } from "./tr-decimal";

function value(parse: (raw: string) => ReturnType<typeof parseRefPriceInput>, raw: string): string {
  const parsed = parse(raw);
  return parsed.kind === "ok" ? parsed.value : parsed.kind;
}

describe("parseQuantityInput — fiyatla AYNI Türkçe kural, kesir tamamlanmaz", () => {
  const q = (raw: string) => value(parseQuantityInput, raw);

  it("nokta binliktir: '1.500' → 1500 (1,5 DEĞİL)", () => {
    expect(q("1.500")).toBe("1500");
    expect(q("1.234.567")).toBe("1234567");
    expect(q("480")).toBe("480");
  });

  it("virgül ondalıktır: '1,5' → 1.5; sondaki anlamsız sıfır atılır, anlamlı hane atılmaz", () => {
    expect(q("1,5")).toBe("1.5");
    expect(q("1.500,25")).toBe("1500.25");
    expect(q("2,500")).toBe("2.5");
    expect(q("0,125")).toBe("0.125");
    expect(q("3,0")).toBe("3");
  });

  it("belirsiz nokta ('1.5', '12.50', '1.2345') REDDEDİLİR — sessizce okunmaz", () => {
    expect(q("1.5")).toBe("ambiguous");
    expect(q("12.50")).toBe("ambiguous");
    expect(q("1.2345")).toBe("ambiguous");
    expect(q(".500")).toBe("ambiguous");
  });

  it("anlamsız girdi geçersizdir", () => {
    for (const raw of ["", "  ", "abc", "-5", "1,2,3", "5,", ",5"]) expect(q(raw)).toBe("invalid");
  });

  it("dördüncü kesir hane SAYILIR (sınırı çağıran uygular): '1,2345' → 1.2345", () => {
    expect(q("1,2345")).toBe("1.2345");
    expect(decimalDigitCounts("1.2345")).toEqual({ integer: 1, fraction: 4 });
    expect(decimalDigitCounts("1.2300")).toEqual({ integer: 1, fraction: 2 });
    expect(decimalDigitCounts("0.5")).toEqual({ integer: 0, fraction: 1 });
    expect(decimalDigitCounts("00123")).toEqual({ integer: 3, fraction: 0 });
  });
});

describe("TKL-F2.4.1 YÜKSEK-1 — Türkçede geçerli binlik olamayan noktalı yazımlar belirsizdir", () => {
  const cases = ["1234.567", "0.500", "0.250", "00.500", "12345.678", "1234.567.890", "0.500.000"];

  it.each(cases)("fiyat '%s' → ambiguous", (raw) => {
    expect(value(parseRefPriceInput, raw)).toBe("ambiguous");
  });

  it.each(cases)("miktar '%s' → ambiguous", (raw) => {
    expect(value(parseQuantityInput, raw)).toBe("ambiguous");
  });

  it("geçerli yazımlar aynen okunur", () => {
    for (const parse of [parseRefPriceInput, parseQuantityInput]) {
      expect(value(parse, "28.500")).toBe("28500");
      expect(value(parse, "1.000")).toBe("1000");
      expect(value(parse, "999.999")).toBe("999999");
      expect(value(parse, "28500")).toBe("28500");
      expect(value(parse, "0,5")).toBe(parse === parseRefPriceInput ? "0.50" : "0.5");
    }
    expect(value(parseRefPriceInput, "1.234.567,8")).toBe("1234567.80");
  });
});

describe("parseRefPriceInput (taşınan T30 ayrıştırıcısı) — fiyat kuralı DEĞİŞMEDİ", () => {
  const p = (raw: string) => value(parseRefPriceInput, raw);

  it("kullanıcı onaylı örnekler", () => {
    expect(p("28.500")).toBe("28500");
    expect(p("28.500,75")).toBe("28500.75");
    expect(p("28,5")).toBe("28.50");
    expect(p("28.5")).toBe("ambiguous");
    expect(p("650,00")).toBe("650.00");
  });

  it("belirsiz-metin sabiti kullanıcı onaylı metindir", () => {
    expect(REF_PRICE_AMBIGUOUS_DOT).toBe("Ondalık için virgül kullanın (ör. 28,50)");
  });
});
