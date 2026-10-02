// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./offer-item-cells.ts", import.meta.url)), "utf8");
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// TKL-F5.1 ADIM 0: oran ayrıştırıcısı `offer-form.ts`te TEK; kalem hücresi üçüncü kopya TUTMAZ.
describe("offer-item-cells — oran ayrıştırıcısı tek kaynak", () => {
  it("yerel parsePct, yüzde sabitleri ve yüzde metinleri burada YOK", () => {
    expect(code).not.toMatch(/function parsePct/);
    expect(code).not.toMatch(/PCT_FRACTION|MSG_PCT_|MSG_OVERHEAD_RANGE|MSG_PROFIT_RANGE/);
    expect(code).not.toMatch(/999\.99/);
  });

  it("offer-form'un dışa açık ayrıştırıcılarını kullanır", () => {
    expect(code).toMatch(/parseOverheadPct/);
    expect(code).toMatch(/parseProfitPct/);
  });
});
