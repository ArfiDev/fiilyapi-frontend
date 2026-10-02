// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./input.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// TKL-F4.8 · K-F4-5: "30gün" — metin son eki (gün / takvim günü) sayıyla çakışmaz; yer, son ek uzunluğundan ayrılır.
describe("input.css — metin son eki payı", () => {
  it("--suffix değiştiricisi sağ dolguyu son ek karakter sayısından türetir", () => {
    const rule = /\.input-wrap--suffix\s+\.input\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/padding-right:\s*calc\(/);
    expect(rule).toContain("var(--input-suffix-chars)");
  });

  it("varsayılan simge payı (%, ₺) değişmez", () => {
    expect(/\.input-wrap--right\s+\.input\s*\{([^}]*)\}/.exec(css)?.[1]).toContain("padding-right: var(--space-8)");
  });
});
