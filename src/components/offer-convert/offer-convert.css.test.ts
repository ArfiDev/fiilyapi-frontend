// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./offer-convert.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const ruleOf = (selector: string): string => {
  const escaped = selector.replace(/[.\\[\]()*+?^$|{}]/g, "\\$&");
  return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
};

// F4 #165 dersi (CI run 36996634814, `.offer-summary__row`): yapışkan özet kartında kesirli satır yüksekliği yazıları ¼/½ piksel
// fazlarına düşürüyor, Linux'ta kare her koşuda farklı pikselleniyordu. Dönüştür özet kartı (`position: sticky`) aynı yapıdadır;
// kesir veren (11px × 1,5 = 16,5 · miras 13px × 1,5 = 19,5) satırlar TAM PİKSEL satır yüksekliği taşımalıdır. Ölçü (1440): label 16.5px,
// diff 19.5px, hata notu 16.5px → 17 / 20 / 17.
describe("offer-convert.css — yapışkan özet kartı satırları tam piksel", () => {
  it("özet kartı yapışkan (bekçinin dayanağı)", () => {
    expect(ruleOf(".convert-sum")).toMatch(/position:\s*sticky;/);
  });

  it.each([".convert-sum__label", ".convert-sum__diff", ".convert-sum .convert-error-text"])("%s satır yüksekliği tam sayı px", (selector) => {
    expect(ruleOf(selector)).toMatch(/line-height:\s*\d+px;/);
  });
});

// TKL-F5.6 bulgusu: 1440'ta kalem kartının iç genişliği 838px; tablo `min-width: 860px` "Fark" sütununu 22px kırpıyordu.
describe("offer-convert.css — kalem tablosu 1440'ta kırpılmaz", () => {
  it(".convert-table min-width ≤ 820px", () => {
    const minWidth = Number(/min-width:\s*(\d+)px;/.exec(ruleOf(".convert-table"))?.[1] ?? "NaN");
    expect(minWidth).toBeLessThanOrEqual(820);
  });
});
