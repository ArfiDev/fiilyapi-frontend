import { describe, expect, it } from "vitest";

import { OFFER_FORM_MESSAGES, parseOverheadPct, parseProfitPct } from "./offer-form";

// TKL-F4.8 · oran doğrulayıcısı TEK kaynak: Yeni Teklif formu ve Şablon oranları AYNI işlevleri kullanır.
describe("offer-form oran ayrıştırıcıları (tek kaynak)", () => {
  it("GG: virgüllü metin kayıpsız dizge, 100 üst sınır", () => {
    expect(parseOverheadPct("12,5")).toEqual({ value: "12.5" });
    expect(parseOverheadPct("100,01")).toEqual({ error: OFFER_FORM_MESSAGES.pctRange100 });
  });

  it("Kâr: 999,99 üst sınır", () => {
    expect(parseProfitPct("999,99")).toEqual({ value: "999.99" });
    expect(parseProfitPct("1000")).toEqual({ error: OFFER_FORM_MESSAGES.pctRangeProfit });
  });

  it("belirsiz nokta, harf ve üçüncü ondalık reddedilir", () => {
    expect(parseOverheadPct("12.5")).toEqual({ error: "Ondalık için virgül kullanın (ör. 28,50)" });
    expect(parseProfitPct("abc")).toEqual({ error: OFFER_FORM_MESSAGES.pctInvalid });
    expect(parseOverheadPct("1,234")).toEqual({ error: OFFER_FORM_MESSAGES.pctFraction });
  });
});
