import { describe, expect, it } from "vitest";

import { CATALOG_UNIT_OPTIONS, selectedUnit, unitOptions } from "./catalog-units";
import { standardRateError } from "./standard-rate";

const REQUIRED = "Bu ekranın zorunlu metni";

describe("standardRateError — iki ekranın ortak A-s kuralı", () => {
  it("boş, anlamsız ve ≤ 0 → çağıranın zorunlu metni", () => {
    expect(standardRateError("", REQUIRED)).toBe(REQUIRED);
    expect(standardRateError("abc", REQUIRED)).toBe(REQUIRED);
    expect(standardRateError("0", REQUIRED)).toBe(REQUIRED);
    expect(standardRateError("-1", REQUIRED)).toBe(REQUIRED);
  });

  it("sınır metinleri ortaktır: 4 ondalık, 8 basamak", () => {
    expect(standardRateError("1,12345", REQUIRED)).toBe("En fazla 4 ondalık");
    expect(standardRateError("123456789", REQUIRED)).toBe("En fazla 8 basamak");
  });

  it("geçerli değer → undefined (TR virgülü ve sınırdaki değerler)", () => {
    expect(standardRateError("1,8", REQUIRED)).toBeUndefined();
    expect(standardRateError("12345678,1234", REQUIRED)).toBeUndefined();
  });
});

describe("catalog-units — tek kaynak", () => {
  const CANON = ["m³", "m²", "m", "Ton", "Kg", "Adet", "Lt", "Gün", "Saat", "Takım"];

  it("kanonik yazım: kelime birimler ilk harf büyük, metre sembolleri küçük", () => {
    expect(CATALOG_UNIT_OPTIONS).toEqual(CANON);
  });

  it("katalogdaki ve mevcut birim eklenir; tekrar ve boş atılır", () => {
    expect(unitOptions(["m²", "paket"], "özel")).toEqual([...CANON, "paket", "özel"]);
    expect(unitOptions([], "")).toEqual([...CANON]);
  });

  it("aynı birimin farklı yazımı tek seçenek olur, kanonik yazım kazanır (TR duyarsız)", () => {
    expect(unitOptions(["kg", "ADET", "takim", "gün"], "kg")).toEqual([...CANON, "takim"]);
    expect(unitOptions(["I"], "")).toContain("I");
  });

  it("current='kg': listede tek 'Kg' var ve seçili gösterilir; form değeri değişmez", () => {
    const options = unitOptions([], "kg");
    expect(options.filter((o) => o.toLocaleLowerCase("tr-TR") === "kg")).toEqual(["Kg"]);
    expect(selectedUnit(options, "kg")).toBe("Kg");
    expect(selectedUnit(options, "paket")).toBe("paket");
  });
});
