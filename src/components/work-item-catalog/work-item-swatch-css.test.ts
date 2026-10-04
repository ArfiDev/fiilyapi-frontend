// @vitest-environment node
//
// TKL-F1.3.1-11 · disiplin işareti mockup'ta DAİRE: çipte 8px (KIK:109), satırda 7px (KIK:136),
// ikisi de 1px çerçeveli. Ortak `.ev-cat-swatch` (KAT'ın 10px karesi) DEĞİŞMEZ; yeni ekran
// kendi alanında (`.wik-chip` / `.wik-cell--poz`) daha özgül kuralla ezer.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const screenCss = readFileSync(fileURLToPath(new URL("./work-item-catalog.css", import.meta.url)), "utf8");
const sharedCss = readFileSync(
  fileURLToPath(new URL("../catalog-shared/catalog-shared.css", import.meta.url)),
  "utf8",
);

/** `selector { … }` gövdesi (ilk eşleşme); yoksa boş dize. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
}

describe("yeni ekranda disiplin işareti mockup'a birebir (daire)", () => {
  it("çip: 8px daire + 1px çerçeve (KIK:109)", () => {
    const body = ruleBody(screenCss, ".wik-chip .ev-cat-swatch");
    expect(body).toMatch(/width:\s*8px/);
    expect(body).toMatch(/height:\s*8px/);
    expect(body).toMatch(/border-radius:\s*50%/);
    expect(body).toMatch(/border:\s*1px solid var\(--color-border-strong\)/);
    expect(body).toMatch(/box-sizing:\s*border-box/);
  });

  it("satır: 7px daire + 1px çerçeve (KIK:136)", () => {
    const body = ruleBody(screenCss, ".wik-cell--poz .ev-cat-swatch");
    expect(body).toMatch(/width:\s*7px/);
    expect(body).toMatch(/height:\s*7px/);
    expect(body).toMatch(/border-radius:\s*50%/);
    expect(body).toMatch(/border:\s*1px solid var\(--color-border-strong\)/);
    expect(body).toMatch(/box-sizing:\s*border-box/);
  });

  it("KAT'ın ortak 10px karesi DEĞİŞMEDİ", () => {
    const body = ruleBody(sharedCss, ".ev-cat-swatch");
    expect(body).toMatch(/width:\s*10px/);
    expect(body).toMatch(/height:\s*10px/);
    expect(body).toMatch(/border-radius:\s*2px/);
    expect(body).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--color-border-strong\)/);
  });
});

describe("Düzenle hücresi mockup gibi sağa taşar (KIK:146)", () => {
  it("justify-content flex-start: düğme sola taşıp fiyat güncelleme tarihini örtmez", () => {
    const body = ruleBody(screenCss, ".wik-cell--action");
    expect(body).toMatch(/justify-content:\s*flex-start/);
    expect(body).not.toMatch(/justify-content:\s*flex-end/);
  });
});

describe("işlem sütunu Düzenle düğmesini tam sığdırır (KAT-F1.5b, mockup sapması)", () => {
  it("son sütun ≥ 85px (69px düğme + 2×8px dolgu) ve tablo min-width'i toplamla uyumlu", () => {
    const grid = /\.wik-grid\s*\{[^}]*grid-template-columns:\s*([^;]+);/.exec(screenCss)?.[1] ?? "";
    const tracks = grid.trim().split(/\s+(?![^()]*\))/);
    const last = Number.parseInt(tracks[tracks.length - 1] ?? "0", 10);
    expect(last).toBeGreaterThanOrEqual(85);
    const fixed = tracks.reduce((sum, t) => (/^\d+px$/.test(t) ? sum + Number.parseInt(t, 10) : sum), 0);
    const flexMin = Number(/minmax\((\d+)px/.exec(grid)?.[1] ?? 0);
    const tableMin = Number(/\.wik-table\s*\{[^}]*min-width:\s*(\d+)px/.exec(screenCss)?.[1] ?? 0);
    expect(tableMin).toBe(fixed + flexMin);
  });
});
