import { describe, expect, it } from "vitest";

import { formatTemplateRates, parseTemplateRates } from "./template-rates";

describe("parseTemplateRates (T30: virgül ondalık, GG 0–100, Kâr 0–999,99)", () => {
  it("Türkçe virgüllü metni kayıpsız ondalık dizgeye çevirir", () => {
    expect(parseTemplateRates("12,5", "15")).toEqual({ ok: true, overhead: "12.5", profit: "15" });
  });

  it("boş metin = oran yok (teklif ayarı), hata değil", () => {
    expect(parseTemplateRates("", "  ")).toEqual({ ok: true, overhead: null, profit: null });
  });

  it("belirsiz nokta: 'Ondalık için virgül kullanın (ör. 28,50)'", () => {
    expect(parseTemplateRates("12.5", "15")).toEqual({
      ok: false,
      errors: { overhead: "Ondalık için virgül kullanın (ör. 28,50)" },
    });
  });

  it("GG 100'ü aşamaz; Kâr 999,99'a kadar", () => {
    const over = parseTemplateRates("100,01", "999,99");
    expect(over).toEqual({ ok: false, errors: { overhead: "0–100 arasında olmalı" } });
    const profitOver = parseTemplateRates("100", "1000");
    expect(profitOver).toEqual({ ok: false, errors: { profit: "0–999,99 arasında olmalı" } });
    expect(parseTemplateRates("100", "999,99").ok).toBe(true);
  });

  it("en çok 2 ondalık hane; harf geçersiz", () => {
    expect(parseTemplateRates("12,345", "1")).toEqual({ ok: false, errors: { overhead: "En çok 2 ondalık hane" } });
    expect(parseTemplateRates("abc", "1")).toEqual({ ok: false, errors: { overhead: "Geçerli bir yüzde girin" } });
  });

  it("iki alanın hatası birlikte döner", () => {
    const result = parseTemplateRates("abc", "xyz");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["overhead", "profit"]);
  });
});

describe("formatTemplateRates (ÜS-F4-6)", () => {
  it("dolu oranlar: 'GG %12 · K %15,5'", () => {
    expect(formatTemplateRates("12.00", "15.50", null)).toBe("GG %12 · K %15,5");
  });

  it("boş oran ayar değeriyle + '(ayar)'", () => {
    expect(formatTemplateRates(null, "15.00", { default_overhead_pct: "10.00", default_profit_pct: "20.00" })).toBe(
      "GG %10 (ayar) · K %15",
    );
    expect(formatTemplateRates("12.00", null, { default_overhead_pct: "10.00", default_profit_pct: "20.00" })).toBe(
      "GG %12 · K %20 (ayar)",
    );
  });

  it("ayar da yoksa '—'", () => {
    expect(formatTemplateRates(null, null, null)).toBe("GG — · K —");
  });
});
