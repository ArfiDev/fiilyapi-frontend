// @vitest-environment node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./button.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// TKL-F4.8 · K-F4-5: düğme görünümlü bağlantı (`<Link className="btn …">`) altı ÇİZİLİ olmaz (mockup `a{text-decoration:none}`).
describe("button.css — link-as-button", () => {
  it("a.btn altçizgisiz (TEK ortak kural; durumlar aynı özgüllükte)", () => {
    const rule = /a\.btn\b[^{,]*(?:,\s*a\.btn\b[^{,]*)*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/text-decoration:\s*none/);
  });

  it("hiçbir .btn durumu altçizgi geri getirmez", () => {
    expect(css).not.toMatch(/text-decoration:\s*underline/);
  });
});
