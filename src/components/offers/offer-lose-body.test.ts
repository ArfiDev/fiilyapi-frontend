import { describe, expect, it } from "vitest";

import { buildLoseBody } from "./offer-lose-body";

describe("Kaybedildi gövdesi — boş alan GÖNDERİLMEZ (T37)", () => {
  it("ikisi de boş → gövde YOK (undefined)", () => {
    expect(buildLoseBody("", "")).toEqual({ ok: true, body: undefined });
    expect(buildLoseBody("   ", "  ")).toEqual({ ok: true, body: undefined });
  });

  it("yalnız neden → {lost_reason}; winning_amount anahtarı YOK", () => {
    const result = buildLoseBody("  Fiyat yüksek bulundu ", "");
    expect(result).toEqual({ ok: true, body: { lost_reason: "Fiyat yüksek bulundu" } });
    expect(result.ok && result.body && "winning_amount" in result.body).toBe(false);
  });

  it("yalnız tutar → {winning_amount} METİN; lost_reason anahtarı YOK", () => {
    const result = buildLoseBody("", "61.250.000,50");
    expect(result).toEqual({ ok: true, body: { winning_amount: "61250000.50" } });
    expect(result.ok && result.body && "lost_reason" in result.body).toBe(false);
  });

  it("ikisi dolu → ikisi de", () => {
    expect(buildLoseBody("Rakip düşük", "1.500,5")).toEqual({
      ok: true,
      body: { lost_reason: "Rakip düşük", winning_amount: "1500.50" },
    });
  });
});

describe("kazanan tutar — T30 kuralı", () => {
  it("'28.5' belirsiz → virgül iste; gövde kurulmaz", () => {
    expect(buildLoseBody("", "28.5")).toEqual({
      ok: false,
      errors: { amount: "Ondalık için virgül kullanın (ör. 28,50)" },
    });
  });

  it("üç kesir hanesi ve anlamsız metin satır hatasıdır", () => {
    expect(buildLoseBody("", "10,125")).toMatchObject({ ok: false, errors: { amount: "En çok 2 ondalık hane" } });
    expect(buildLoseBody("", "abc")).toMatchObject({ ok: false, errors: { amount: "Geçerli bir tutar girin" } });
  });
});
