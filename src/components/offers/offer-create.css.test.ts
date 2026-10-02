// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./offer-create.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// CI #165 (run 36996634814): yapışkan özet kartında kesirli satır yüksekliği yazıları ¼ piksel fazlarına düşürüyor,
// Linux'ta kare her koşuda farklı pikselleniyordu. Satır yüksekliği TAM PİKSEL kalmalı.
describe("offer-create.css — özet kartı satırları tam piksel", () => {
  it(".offer-summary__row satır yüksekliği tam sayı px", () => {
    const rule = /\.offer-summary__row\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/line-height:\s*\d+px;/);
  });
});
