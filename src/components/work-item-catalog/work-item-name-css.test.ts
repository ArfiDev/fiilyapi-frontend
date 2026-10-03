// @vitest-environment node
// KAT-F1.4c: ≤200 karakterlik Bakanlık adı katalog ve seçici satırında 10+ satıra uzamasın / boşluksuz kelimede taşmasın.
// `anywhere` YASAK (sözcük bölmez); 2 satırda kırpılır, tam metin `title`da (WorkItemNameTitle.test). Emsal: `.convert-row__name`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function ruleOf(cssFile: string, selector: string): string {
  const css = readFileSync(fileURLToPath(new URL(cssFile, import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const escaped = selector.replace(/[.\\[\]()*+?^$|{}]/g, "\\$&");
  return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
}

describe.each([
  [".wik-name", "./work-item-catalog.css"],
  [".wip-name", "../work-item-picker/work-item-picker.css"],
])("%s — uzun ad", (selector, cssFile) => {
  const rule = ruleOf(cssFile, selector);

  it("kelime sınırında kırar (anywhere YOK)", () => {
    expect(rule).toMatch(/overflow-wrap:\s*break-word;/);
    expect(rule).not.toMatch(/anywhere/);
  });

  it("2 satırda kırpar (-webkit-box + line-clamp, taşma gizli)", () => {
    expect(rule).toMatch(/display:\s*-webkit-box;/);
    expect(rule).toMatch(/-webkit-box-orient:\s*vertical;/);
    expect(rule).toMatch(/-webkit-line-clamp:\s*2;/);
    expect(rule).toMatch(/(?<!-webkit-)line-clamp:\s*2;/);
    expect(rule).toMatch(/overflow:\s*hidden;/);
  });

  it("flex/grid çocuğu daralabilir (min-width: 0)", () => {
    expect(rule).toMatch(/min-width:\s*0;/);
  });
});
