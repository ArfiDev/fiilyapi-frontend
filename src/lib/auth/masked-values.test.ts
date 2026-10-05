import { describe, expect, it } from "vitest";

import { ACCOUNTING_HIDDEN_CATEGORIES, TREASURY_HIDDEN_CATEGORIES } from "./finance-hidden";
import { isCategoryHidden } from "./hidden-fields";
import { hasMaskedValue, shouldShowHiddenMark } from "./masked-values";

describe("IZN-F4b.2 · maskeli değer yardımcıları", () => {
  it("yalnız null maskelidir: 0 ve boş metin gerçek değerdir, undefined 'henüz yok'", () => {
    expect(hasMaskedValue([null])).toBe(true);
    expect(hasMaskedValue(["0.00", 0, "", undefined])).toBe(false);
    expect(hasMaskedValue([])).toBe(false);
  });

  it("kilit: kategori gizli VE değer null olmalı (iki koşul birlikte)", () => {
    expect(shouldShowHiddenMark(true, ["1.00", null])).toBe(true);
    expect(shouldShowHiddenMark(true, ["1.00", "2.00"])).toBe(false);
    expect(shouldShowHiddenMark(false, [null])).toBe(false);
  });

  it("mali kategori kümeleri tum_tutarlar bayrağını kapsar", () => {
    const me = { hidden_fields: ["tum_tutarlar" as const] };
    expect(isCategoryHidden(me, ACCOUNTING_HIDDEN_CATEGORIES)).toBe(true);
    expect(isCategoryHidden(me, TREASURY_HIDDEN_CATEGORIES)).toBe(true);
    expect(isCategoryHidden({ hidden_fields: ["maas_kisisel" as const] }, ACCOUNTING_HIDDEN_CATEGORIES)).toBe(false);
  });
});
