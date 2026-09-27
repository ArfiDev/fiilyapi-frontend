// @vitest-environment node
//
// Pozitif kontrol (emir §Pozlu kontrol) — tablo dolmadan gerçek veriyle
// koşulamayacağı için küçük sahte satırlarla: mutasyonu (×100 hatası) yakalar mı?
// Lider güncellemesi: bayrağa göre sınırlar (fraction 0..1/±5, percent 0..100/±10000).
import { describe, it, expect } from "vitest";
import { checkScaleRow } from "./scale-assertions";
import type { ScaleFlag, ScaleRow } from "@/lib/api/scale-table";

function row(overrides: Partial<ScaleRow> & { flags?: readonly ScaleFlag[] }): ScaleRow {
  return { schema: "S", field: "f", scale: "fraction", kanit: "test", ...overrides };
}

describe("scale-assertions · pozitif kontrol", () => {
  // ── fraction ──
  it("fraction: bayraksız 1.2 İHLAL üretir (varsayılan üst sınır 1)", () => {
    const violations = checkScaleRow(row({ scale: "fraction" }), [1.2], "http://mock/x");
    expect(violations).toHaveLength(1);
  });

  it("fraction: aynı 1.2 değeri fractionAboveOneOk ile İHLAL üretmez", () => {
    const violations = checkScaleRow(
      row({ scale: "fraction", flags: ["fractionAboveOneOk"] }),
      [1.2],
      "http://mock/x",
    );
    expect(violations).toEqual([]);
  });

  it("fraction: 75 değeri (×100 hatası) fractionAboveOneOk ile bile İHLAL üretir (üst sınır 5)", () => {
    const violations = checkScaleRow(
      row({ scale: "fraction", flags: ["fractionAboveOneOk"] }),
      [0.5, 75],
      "http://mock/x",
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].value).toBe(75);
  });

  it("fraction: 0..1 aralığındaki normal değerler bayraksız da İHLAL üretmez", () => {
    const violations = checkScaleRow(row({ scale: "fraction" }), [0, 0.5, 1], "http://mock/x");
    expect(violations).toEqual([]);
  });

  it("fraction: negatif değer bayraksız İHLAL üretir, negativeOk ile üretmez (>= -5)", () => {
    expect(checkScaleRow(row({ scale: "fraction" }), [-0.2], "u")).toHaveLength(1);
    expect(checkScaleRow(row({ scale: "fraction", flags: ["negativeOk"] }), [-0.2], "u")).toEqual([]);
    expect(checkScaleRow(row({ scale: "fraction", flags: ["negativeOk"] }), [-6], "u")).toHaveLength(1);
  });

  // ── percent ──
  it("percent: bayraksız 150 İHLAL üretir (varsayılan üst sınır 100)", () => {
    const violations = checkScaleRow(row({ scale: "percent" }), [150], "http://mock/x");
    expect(violations).toHaveLength(1);
  });

  it("percent: aynı 150 değeri percentAbove100Ok ile İHLAL üretmez", () => {
    const violations = checkScaleRow(
      row({ scale: "percent", flags: ["percentAbove100Ok"] }),
      [150],
      "http://mock/x",
    );
    expect(violations).toEqual([]);
  });

  it("percent: percentAbove100Ok üst sınırı 10000'i de aşarsa yine İHLAL üretir", () => {
    const violations = checkScaleRow(
      row({ scale: "percent", flags: ["percentAbove100Ok"] }),
      [20_000],
      "http://mock/x",
    );
    expect(violations).toHaveLength(1);
  });

  it("percent: yalnız 0.5 gözlenmişse (÷100 ters hatası) İHLAL üretir", () => {
    const violations = checkScaleRow(row({ scale: "percent" }), [0.5], "http://mock/x");
    expect(violations).toHaveLength(1);
  });

  it("percent: en az bir değer >1 ise bu iddia İHLAL üretmez", () => {
    const violations = checkScaleRow(row({ scale: "percent" }), [0.5, 42], "http://mock/x");
    expect(violations).toEqual([]);
  });

  it("percent: percentBelowOneOk bayrağı |v|>1 iddiasını atlar", () => {
    const violations = checkScaleRow(
      row({ scale: "percent", flags: ["percentBelowOneOk"] }),
      [0.5],
      "http://mock/x",
    );
    expect(violations).toEqual([]);
  });

  it("percent: negatif değer bayraksız İHLAL üretir, negativeOk ile üretmez", () => {
    expect(checkScaleRow(row({ scale: "percent" }), [-5], "u")).toHaveLength(1);
    expect(checkScaleRow(row({ scale: "percent", flags: ["negativeOk"] }), [-5], "u")).toEqual([]);
  });

  // ── factor ──
  it("factor: 0 ya da negatif ya da >10 İHLAL üretir", () => {
    expect(checkScaleRow(row({ scale: "factor" }), [0], "u")).toHaveLength(1);
    expect(checkScaleRow(row({ scale: "factor" }), [-1], "u")).toHaveLength(1);
    expect(checkScaleRow(row({ scale: "factor" }), [11], "u")).toHaveLength(1);
    expect(checkScaleRow(row({ scale: "factor" }), [1.05], "u")).toEqual([]);
  });

  // ── enum ──
  it("enum: openapi enum dışı değer İHLAL üretir", () => {
    const violations = checkScaleRow(
      row({ scale: "enum" }),
      ["kirmizi", "yesil"],
      "http://mock/x",
      ["yesil", "sari"],
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].value).toBe("kirmizi");
  });

  it("enum: allowed listesi verilmezse hiçbir şey iddia edilmez (yürüyücü kapsamı dışı)", () => {
    const violations = checkScaleRow(row({ scale: "enum" }), ["x"], "u");
    expect(violations).toEqual([]);
  });

  // ── not-scale / genel ──
  it("not-scale: hiçbir zaman İHLAL üretmez", () => {
    const violations = checkScaleRow(row({ scale: "not-scale" }), [999, -999, "kirmizi"], "u");
    expect(violations).toEqual([]);
  });

  it("null/undefined gözlemler sessizce atlanır", () => {
    expect(checkScaleRow(row({ scale: "fraction" }), [null, undefined], "u")).toEqual([]);
  });

  it("string Decimal değerler sayıya çevrilerek kontrol edilir", () => {
    const violations = checkScaleRow(row({ scale: "fraction" }), ["75.00"], "u");
    expect(violations).toHaveLength(1);
  });
});
