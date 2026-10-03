import { describe, expect, it } from "vitest";

import { pinnedRangeExtractor, shouldVirtualize, VIRTUALIZE_MIN_ROWS } from "./virtual-rows";

describe("virtual-rows — eşik", () => {
  it("eşik 100: bu sayının altı bugünkü DOM, eşik ve üstü sanallaştırılır", () => {
    expect(VIRTUALIZE_MIN_ROWS).toBe(100);
    expect(shouldVirtualize(VIRTUALIZE_MIN_ROWS - 1)).toBe(false);
    expect(shouldVirtualize(VIRTUALIZE_MIN_ROWS)).toBe(true);
    expect(shouldVirtualize(1716)).toBe(true);
    expect(shouldVirtualize(0)).toBe(false);
  });
});

describe("virtual-rows — pinnedRangeExtractor", () => {
  const range = { startIndex: 40, endIndex: 50, overscan: 2, count: 1000 };

  it("sabitlenmiş satırlar pencere dışında olsa da dizide kalır; sıra artan", () => {
    expect(pinnedRangeExtractor([3, 900])(range)).toEqual([3, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 900]);
  });

  it("sabitlenmiş yoksa varsayılan aralık; aralık dışı (count üstü / negatif) dizin yok sayılır", () => {
    expect(pinnedRangeExtractor([])(range)).toHaveLength(15);
    expect(pinnedRangeExtractor([-1, 1000])(range)).toHaveLength(15);
  });
});
