import { describe, expect, it } from "vitest";

import { CATALOG_UNIT_OPTIONS, unitOptions } from "./catalog-units";
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
  it("kg 'ton'un yanında listede (ÜS-11)", () => {
    expect(CATALOG_UNIT_OPTIONS).toEqual(["m³", "m²", "m", "ton", "kg", "adet"]);
  });

  it("katalogdaki ve mevcut birim eklenir; tekrar ve boş atılır", () => {
    expect(unitOptions(["m²", "lt"], "paket")).toEqual(["m³", "m²", "m", "ton", "kg", "adet", "lt", "paket"]);
    expect(unitOptions([], "")).toEqual([...CATALOG_UNIT_OPTIONS]);
  });
});
