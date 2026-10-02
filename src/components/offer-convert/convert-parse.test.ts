// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseQty, parseUnitPrice } from "./convert-parse";

const AMBIGUOUS = "Ondalık için virgül kullanın (ör. 28,50)";

describe("parseQty (T30 + backend Quantity: >0, ≤3 ondalık, ≤1e9)", () => {
  it.each([
    ["10", "10"],
    ["1.500", "1500"],
    ["2,125", "2.125"],
    ["1.234,5", "1234.5"],
    ["  7 ", "7"],
    ["0,001", "0.001"],
    ["1.000.000.000", "1000000000"],
  ])("'%s' → %s", (raw, value) => {
    expect(parseQty(raw)).toEqual({ ok: true, value });
  });

  it.each([
    ["", "Miktar girin"],
    ["   ", "Miktar girin"],
    ["28.5", AMBIGUOUS],
    ["1.50", AMBIGUOUS],
    ["abc", "Miktar sayı olmalıdır."],
    ["1,2,3", "Miktar sayı olmalıdır."],
    ["-5", "Miktar 0'dan büyük olmalı"],
    ["0", "Miktar 0'dan büyük olmalı"],
    ["0,000", "Miktar 0'dan büyük olmalı"],
    ["1,2345", "En fazla 3 ondalık"],
    ["1.000.000.001", "En fazla 1.000.000.000"],
  ])("'%s' → hata '%s'", (raw, message) => {
    expect(parseQty(raw)).toEqual({ ok: false, message });
  });
});

describe("parseUnitPrice (T30 + backend UnitPrice: ≥0, ≤2 ondalık, ≤1e12)", () => {
  it.each([
    ["128,80", "128.80"],
    ["128,8", "128.80"],
    ["28.500,75", "28500.75"],
    ["0", "0"],
    ["0,00", "0.00"],
    ["1.000.000.000.000", "1000000000000"],
  ])("'%s' → %s", (raw, value) => {
    expect(parseUnitPrice(raw)).toEqual({ ok: true, value });
  });

  it.each([
    ["", "Birim fiyat girin"],
    ["28.5", AMBIGUOUS],
    ["x", "Birim fiyat sayı olmalıdır."],
    ["-1", "Birim fiyat negatif olamaz."],
    ["1,234", "En fazla 2 ondalık"],
    ["1.000.000.000.001", "En fazla 1.000.000.000.000"],
  ])("'%s' → hata '%s'", (raw, message) => {
    expect(parseUnitPrice(raw)).toEqual({ ok: false, message });
  });
});
