import { describe, it, expect } from "vitest";

import { commitInlineCell } from "./employer-item-inline";

/**
 * 🔴 BU DOSYANIN VAR OLMA SEBEBİ: `EmployerContractItemUpdate` şemasından
 * üretilen TS tipi `quantity?: number | string | null` der — "sıfırdan
 * büyük" DEMEZ. Yani `pnpm typecheck` yeşilken canlı 422 verebilir. Kısıt
 * ancak burada bekçilenir.
 */
describe("commitInlineCell · satır-içi hücre kaydetme kararı", () => {
  // 🔴 Metin alanları `decimalInputValue`dan GEÇMEZ: "03.010" ondalık gösterimde
  // "03.01"e düşer ve değişmemiş kod her blur'da PATCH atardı.
  it("sonu sıfırla biten poz kodu değişmediyse noop (metin ondalık sayılmaz)", () => {
    expect(commitInlineCell("code", "03.010", "03.010")).toEqual({ kind: "noop" });
    expect(commitInlineCell("code", " 03.010 ", "03.010")).toEqual({ kind: "noop" });
  });

  it("dokunulmamış hücre istek UÇURMAZ", () => {
    expect(commitInlineCell("quantity", undefined, "3200.000")).toEqual({ kind: "noop" });
  });

  it("değeri değişmemiş hücre istek UÇURMAZ (sondaki sıfırlar gösterimden düşer)", () => {
    expect(commitInlineCell("quantity", "3200", "3200.000")).toEqual({ kind: "noop" });
    expect(commitInlineCell("unitPrice", "1850", "1850.00")).toEqual({ kind: "noop" });
  });

  it("değişen miktar KISMİ gövde üretir — metin AYNEN gider, Number() turu yok", () => {
    expect(commitInlineCell("quantity", " 3200.125 ", "3200.000")).toEqual({
      kind: "patch",
      body: { quantity: "3200.125" },
    });
  });

  it("değişen birim fiyat yalnız `unit_price` taşır (miktar gövdeye girmez)", () => {
    expect(commitInlineCell("unitPrice", "1900.50", "1850.00")).toEqual({
      kind: "patch",
      body: { unit_price: "1900.50" },
    });
  });

  // 🔴 EMRİN ADIYLA İSTEDİĞİ SINAV: `min={0}` yazmak YANLIŞTIR, sıfır DAHİL
  // DEĞİLDİR (`exclusiveMinimum: 0`).
  it("miktar SIFIR REDDEDİLİR — istek uçmaz", () => {
    expect(commitInlineCell("quantity", "0", "3200.000")).toEqual({
      kind: "error",
      message: "Miktar sıfırdan büyük olmalıdır.",
    });
  });

  it("negatif miktar reddedilir", () => {
    expect(commitInlineCell("quantity", "-5", "3200.000")).toEqual({
      kind: "error",
      message: "Miktar sıfırdan büyük olmalıdır.",
    });
  });

  it("boşaltılan miktar SİLME DEĞİLDİR — reddedilir", () => {
    expect(commitInlineCell("quantity", "", "3200.000")).toEqual({
      kind: "error",
      message: "Miktar zorunludur.",
    });
  });

  it("sayı olmayan miktar reddedilir", () => {
    expect(commitInlineCell("quantity", "abc", "3200.000")).toEqual({
      kind: "error",
      message: "Miktar sayı olmalıdır.",
    });
  });

  it("negatif birim fiyat reddedilir (`minimum: 0`)", () => {
    expect(commitInlineCell("unitPrice", "-1", "1850.00")).toEqual({
      kind: "error",
      message: "Birim Fiyat negatif olamaz.",
    });
  });

  it("birim fiyat SIFIR KABUL EDİLİR — miktarın tersine sıfır sınıra DAHİLDİR", () => {
    expect(commitInlineCell("unitPrice", "0", "1850.00")).toEqual({
      kind: "patch",
      body: { unit_price: "0" },
    });
  });

  it("İŞV tarafında boş birim fiyat 'girilmedi' DEĞİLDİR — reddedilir", () => {
    // Taşeron emsalinde boş fiyat `null` gider; işveren şemasında `unit_price`
    // ZORUNLUdur ("Fiyatsız poz girilemez", İŞV 94) — iki kural KARIŞTIRILMAZ.
    expect(commitInlineCell("unitPrice", "", "1850.00")).toEqual({
      kind: "error",
      message: "Birim Fiyat zorunludur.",
    });
  });

  describe("metin alanları (poz no · ad · birim)", () => {
    it("trim'li değer sunucu değerine eşitse istek UÇMAZ", () => {
      expect(commitInlineCell("code", " 03.001 ", "03.001")).toEqual({ kind: "noop" });
      expect(commitInlineCell("description", "Grobeton", "Grobeton")).toEqual({ kind: "noop" });
      expect(commitInlineCell("unit", "m³", "m³")).toEqual({ kind: "noop" });
    });

    it("dokunulmamış metin hücresi noop", () => {
      expect(commitInlineCell("code", undefined, "03.001")).toEqual({ kind: "noop" });
    });

    it("değişen alan YALNIZ kendi gövdesini taşır", () => {
      expect(commitInlineCell("code", " 03.002 ", "03.001")).toEqual({
        kind: "patch",
        body: { code: "03.002" },
      });
      expect(commitInlineCell("description", "Yeni ad", "Grobeton")).toEqual({
        kind: "patch",
        body: { description: "Yeni ad" },
      });
      expect(commitInlineCell("unit", "m²", "m³")).toEqual({
        kind: "patch",
        body: { unit: "m²" },
      });
    });

    it("🔴 TKL-F2.2: hiçbir hücre gövdesi `catalog_item_id` taşımaz (bağ PATCH'te SABİT — backend 422)", () => {
      const commits = [
        commitInlineCell("quantity", "5", "4.000"),
        commitInlineCell("unitPrice", "9.5", "9.00"),
        commitInlineCell("code", "X1", "X0"),
        commitInlineCell("description", "Yeni", "Eski"),
        commitInlineCell("unit", "m²", "m³"),
      ];
      for (const commit of commits) {
        expect(commit.kind).toBe("patch");
        if (commit.kind === "patch") expect(Object.keys(commit.body)).not.toContain("catalog_item_id");
      }
    });

    it("boş poz no / ad / birim reddedilir (form kuralının metni)", () => {
      expect(commitInlineCell("code", "  ", "03.001")).toEqual({
        kind: "error",
        message: "Poz No zorunludur.",
      });
      expect(commitInlineCell("description", "", "Grobeton")).toEqual({
        kind: "error",
        message: "İş Kalemi Tanımı zorunludur.",
      });
      expect(commitInlineCell("unit", "", "m³")).toEqual({
        kind: "error",
        message: "Birim zorunludur.",
      });
    });

    it("maxLength aşımı reddedilir", () => {
      expect(commitInlineCell("code", "x".repeat(51), "03.001")).toEqual({
        kind: "error",
        message: "Poz No en fazla 50 karakter olabilir.",
      });
      expect(commitInlineCell("description", "x".repeat(2001), "Grobeton")).toEqual({
        kind: "error",
        message: "İş Kalemi Tanımı en fazla 2000 karakter olabilir.",
      });
      expect(commitInlineCell("unit", "x".repeat(51), "m³")).toEqual({
        kind: "error",
        message: "Birim en fazla 50 karakter olabilir.",
      });
    });
  });
});
