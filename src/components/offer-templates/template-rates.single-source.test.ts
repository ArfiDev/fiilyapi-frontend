// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./template-rates.ts", import.meta.url)), "utf8");
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// TKL-F4.8 · K-F4-5: oran doğrulayıcısı `offer-form.ts`te TEK; şablon modülü ikinci kopya TUTMAZ.
describe("template-rates — oran doğrulayıcısı tek kaynak", () => {
  it("ham ondalık ilkelleri (parseQuantityInput / decimalDigitCounts) ve sınır sabitleri burada YOK", () => {
    expect(code).not.toMatch(/parseQuantityInput|decimalDigitCounts|REF_PRICE_AMBIGUOUS_DOT/);
    expect(code).not.toMatch(/999\.99|MAX_FRACTION_DIGITS/);
  });

  it("offer-form'un dışa açık ayrıştırıcılarını kullanır", () => {
    expect(code).toMatch(/parseOverheadPct/);
    expect(code).toMatch(/parseProfitPct/);
  });
});
