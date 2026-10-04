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

  // D1: otomatik yerleşimli tablolarda min-content = tam kod genişliği → sütun koda göre büyürdü; ellipsis ancak
  // bir üst sınırla çalışır. 14ch = 13 karakterlik "35.140.3195-D" TAM sığar, daha uzunu ellipsis + title.
  it("screen: max-width 14ch (ellipsis gerçekten çalışsın)", () => {
    expect(rule(".source-code-sub")).toMatch(/max-width:\s*14ch/);
  });

  it("print: max-width YOK (none) — yazdırmada kırpma/sınır yok", () => {
    expect(rule(".source-code-sub--print")).toMatch(/max-width:\s*none/);
  });

  it("print: break-word var; anywhere ve nowrap YOK", () => {
    const body = rule(".source-code-sub--print");
    expect(body).toMatch(/overflow-wrap:\s*break-word/);
    expect(body).not.toMatch(/anywhere/);
    expect(body).not.toMatch(/nowrap/);
  });
});
