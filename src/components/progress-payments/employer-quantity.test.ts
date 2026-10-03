import { describe, expect, it } from "vitest";

import {
  formatTrQuantityText,
  parseEmployerCoefficient,
  parseEmployerPaymentQuantity,
  sanitizeTrDecimalInput,
} from "./employer-quantity";

const AMBIGUOUS = "Ondalık için virgül kullanın (ör. 28,50)";

describe("sanitizeTrDecimalInput", () => {
  it("rakam, nokta ve tek virgül kalır; virgül SİLİNMEZ", () => {
    expect(sanitizeTrDecimalInput("12,5")).toBe("12,5");
    expect(sanitizeTrDecimalInput("1.234,5")).toBe("1.234,5");
    expect(sanitizeTrDecimalInput("12a-3,5,6")).toBe("123,56");
    expect(sanitizeTrDecimalInput("abc")).toBe("");
  });
});

describe("parseEmployerPaymentQuantity", () => {
  it.each([
    ["3,5", "3.5"],
    ["1.234,5", "1234.5"],
    ["1.500", "1500"],
    ["12", "12"],
    ["", "0"],
    ["  ", "0"],
    ["0", "0"],
    ["0,000", "0"],
  ])("%j → %j", (raw, expected) => {
    expect(parseEmployerPaymentQuantity(raw)).toEqual({ kind: "ok", value: expected });
  });

  it.each([
    ["0.500", AMBIGUOUS],
    ["1.5", AMBIGUOUS],
    ["1,2345", "En fazla 3 ondalık"],
    ["123456789012", "En fazla 11 basamak"],
    ["12a", "Miktar sayı olmalıdır."],
    ["12,", "Miktar sayı olmalıdır."],
  ])("%j reddedilir: %s", (raw, message) => {
    expect(parseEmployerPaymentQuantity(raw)).toEqual({ kind: "error", message });
  });
});

describe("parseEmployerCoefficient", () => {
  it.each([
    ["", "1"],
    ["1,05", "1.05"],
    ["1", "1"],
    ["10", "10"],
    ["10,000", "10"],
    ["0,995", "0.995"],
  ])("%j → %j", (raw, expected) => {
    expect(parseEmployerCoefficient(raw)).toEqual({ kind: "ok", value: expected });
  });

  it.each([
    ["1.052", "Katsayı çok büyük, ondalık için virgül kullanın"],
    ["10,001", "Katsayı çok büyük, ondalık için virgül kullanın"],
    ["11", "Katsayı çok büyük, ondalık için virgül kullanın"],
    ["1,0523", "En fazla 3 ondalık"],
    ["0", "Katsayı sıfırdan büyük olmalıdır"],
    ["0,000", "Katsayı sıfırdan büyük olmalıdır"],
    ["-1", "Katsayı sıfırdan büyük olmalıdır"],
    ["1.5", AMBIGUOUS],
    ["abc", "Katsayı sayı olmalıdır."],
  ])("%j reddedilir: %s", (raw, message) => {
    expect(parseEmployerCoefficient(raw)).toEqual({ kind: "error", message });
  });
});

describe("formatTrQuantityText", () => {
  it("Türkçe metni biçimler, okunamazsa ham metni basar", () => {
    expect(formatTrQuantityText("1.234,5")).toBe("1.234,5");
    expect(formatTrQuantityText("3,5")).toBe("3,5");
    expect(formatTrQuantityText("0.500")).toBe("0.500");
  });
});
