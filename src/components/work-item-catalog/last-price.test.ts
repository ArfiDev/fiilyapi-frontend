import { describe, expect, it } from "vitest";

import {
  formatLastPrice,
  formatLastPriceSource,
  isLastPriceMasked,
  LAST_PRICE_HIGH_PCT,
  lastPriceDiff,
  sourceLabel,
  type LastPrice,
} from "./last-price";

const MINUS = "−";

describe("lastPriceDiff — (son − ref) / ref × 100, 1 hane HALF_UP (KIK:255)", () => {
  it("3410/3350 → +%1,8, kırmızı değil", () => {
    expect(lastPriceDiff("3410.00", "3350.00")).toEqual({ text: "+%1,8", isHigh: false });
  });

  it("555/520 → +%6,7 ve kırmızı (> 5)", () => {
    expect(lastPriceDiff("555.00", "520.00")).toEqual({ text: "+%6,7", isHigh: true });
  });

  it("tam %5,0 kırmızı DEĞİL (eşik > 5, >= değil)", () => {
    expect(lastPriceDiff("105.00", "100.00")).toEqual({ text: "+%5,0", isHigh: false });
    expect(LAST_PRICE_HIGH_PCT).toBe(5);
  });

  it("5,05 → +%5,1 kırmızı; 5,04 → +%5,0 kırmızı değil (gösterilen değere göre)", () => {
    expect(lastPriceDiff("10505", "10000")).toEqual({ text: "+%5,1", isHigh: true });
    expect(lastPriceDiff("10504", "10000")).toEqual({ text: "+%5,0", isHigh: false });
  });

  it("ROUND_HALF_UP sınırı: x,x5 yukarı (1,25 → 1,3; kesilmez)", () => {
    expect(lastPriceDiff("10125", "10000")?.text).toBe("+%1,3");
    expect(lastPriceDiff("10124", "10000")?.text).toBe("+%1,2");
  });

  it("ref null / undefined / 0 → fark yok", () => {
    expect(lastPriceDiff("100.00", null)).toBeNull();
    expect(lastPriceDiff("100.00", undefined)).toBeNull();
    expect(lastPriceDiff("100.00", "0")).toBeNull();
    expect(lastPriceDiff("100.00", "0.00")).toBeNull();
  });

  it("negatif fark ÜS-F2-14: gerçek eksi işaretli, soluk (asla kırmızı)", () => {
    expect(lastPriceDiff("96.80", "100.00")).toEqual({ text: `${MINUS}%3,2`, isHigh: false });
  });

  it("sıfır fark → %0,0 (işaretsiz); -0,04 → eksi işareti basılmaz", () => {
    expect(lastPriceDiff("100.00", "100.00")).toEqual({ text: "%0,0", isHigh: false });
    expect(lastPriceDiff("99.96", "100.00")?.text).toBe("%0,0");
  });

  it("büyük fiyatta float kaçağı yok (Number() yok): 33900/33200 → +%2,1", () => {
    expect(lastPriceDiff("33900.00", "33200.00")).toEqual({ text: "+%2,1", isHigh: false });
    // 2^53 üstü: Number() bu girdiyi yuvarlardı; kayıpsız hesap tam %5,0 verir (kırmızı değil).
    expect(lastPriceDiff("9457559217477042.65", "9007199254740993")).toEqual({ text: "+%5,0", isHigh: false });
  });

  it("anlamsız ref metni → fark yok", () => {
    expect(lastPriceDiff("100", "abc")).toBeNull();
  });
});

describe("sourceLabel — kaynak adı eşlemi (KIK:253, ÜS-F2-12)", () => {
  it("bilinenler", () => {
    expect(sourceLabel("HK")).toBe("Hakediş");
    expect(sourceLabel("SZL")).toBe("Sözleşme");
    expect(sourceLabel("TKL")).toBe("Teklif");
    expect(sourceLabel("SA")).toBe("Satınalma");
  });

  it("bilinmeyen kaynak HAM basılır", () => {
    expect(sourceLabel("XYZ")).toBe("XYZ");
    expect(sourceLabel("hk")).toBe("hk");
  });
});

describe("formatLastPrice / formatLastPriceSource", () => {
  it("₺ önekli, 2 hane, tr-TR; büyük fiyat kayıpsız", () => {
    expect(formatLastPrice("3410")).toBe("₺3.410,00");
    expect(formatLastPrice("90071992547409935.5")).toBe("₺90.071.992.547.409.935,50");
  });

  const base: LastPrice = { price: "555.00", at: "2026-09-20T09:00:00Z", source: "HK", doc_no: "HK-GNK-8", doc_id: "h1" };

  it("'{Kaynak} · {doc_no} · GG.AA'", () => {
    expect(formatLastPriceSource(base)).toBe("Hakediş · HK-GNK-8 · 20.09");
    expect(formatLastPriceSource({ ...base, source: "SZL", doc_no: "GNK", at: "2026-09-12T09:00:00Z" })).toBe(
      "Sözleşme · GNK · 12.09",
    );
  });

  it("tarih İSTANBUL günü: UTC 21:30 → ertesi gün (yıl sonu dahil)", () => {
    expect(formatLastPriceSource({ ...base, at: "2026-09-20T21:30:00Z" })).toBe("Hakediş · HK-GNK-8 · 21.09");
    expect(formatLastPriceSource({ ...base, at: "2026-12-31T21:30:00Z" })).toBe("Hakediş · HK-GNK-8 · 01.01");
  });

  it("bilinmeyen kaynak ham", () => {
    expect(formatLastPriceSource({ ...base, source: "ZZ" })).toBe("ZZ · HK-GNK-8 · 20.09");
  });
});

describe("isLastPriceMasked — çift-null (limited maskesi, ÜS-F2-15)", () => {
  it("son fiyat YOK ve ref YOK → maskeli", () => {
    expect(isLastPriceMasked(null, null)).toBe(true);
    expect(isLastPriceMasked(undefined, null)).toBe(true);
    expect(isLastPriceMasked(undefined, undefined)).toBe(true);
  });

  it("ref varsa ya da son fiyat varsa maskeli değil", () => {
    expect(isLastPriceMasked(null, "10.00")).toBe(false);
    expect(isLastPriceMasked({ price: "1", at: "2026-01-01T00:00:00Z", source: "SZL", doc_no: "A", doc_id: null }, null)).toBe(false);
  });
});
