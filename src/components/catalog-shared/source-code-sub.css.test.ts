// @vitest-environment node
// Not: diğer `*.css.test.ts` dosyalarıyla aynı gerekçe — dosya sistemi okuyan saf metin testi.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./catalog-shared.css", import.meta.url)), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.\-]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*{([^}]*)}`));
  if (!match) throw new Error(`kural yok: ${selector}`);
  return match[1];
}

describe("catalog-shared.css — Bakanlık no alt satırı", () => {
  it("screen: tek satır + üç nokta + gizli taşma", () => {
    const body = rule(".source-code-sub");
    expect(body).toMatch(/white-space:\s*nowrap/);
    expect(body).toMatch(/text-overflow:\s*ellipsis/);
    expect(body).toMatch(/overflow:\s*hidden/);
  });

  it("print: break-word var; anywhere ve nowrap YOK", () => {
    const body = rule(".source-code-sub--print");
    expect(body).toMatch(/overflow-wrap:\s*break-word/);
    expect(body).not.toMatch(/anywhere/);
    expect(body).not.toMatch(/nowrap/);
  });
});
