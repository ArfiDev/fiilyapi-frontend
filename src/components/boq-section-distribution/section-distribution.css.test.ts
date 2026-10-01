// @vitest-environment node
// Not: jsdom'da CSS ÖLÇÜLEMEZ — bu dosya yalnız stylesheet METNİNİ doğrular
// (yapışkan kolon kurallarının varlığı + paylaşılan `.ecd-items__*`
// kurallarına DOKUNULMADIĞI). Gerçek ölçüm (kaydırınca Poz No x sabit) F1.4 e2e.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

const css = read("./section-distribution.css");
const sharedCss = read("../contracts/employer-contract-detail.css");

/** `selector { ... }` gövdesi; kural yoksa boş dize. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*{([^}]*)}`));
  return match?.[1] ?? "";
}

describe("section-distribution.css — .bdg-grid yapışkan kolonlar", () => {
  it("tablo ayrık kenarlıklı: border-collapse: separate + border-spacing: 0", () => {
    const body = ruleBody(".ecd-items__table.bdg-grid");
    expect(body).toMatch(/border-collapse:\s*separate/);
    expect(body).toMatch(/border-spacing:\s*0/);
  });

  it("Poz No th/td left:0'da yapışkan ve sabit genişlikli", () => {
    const body = ruleBody(".bdg-grid .bdg-sticky-code");
    expect(body).toMatch(/position:\s*sticky/);
    expect(body).toMatch(/left:\s*0/);
    expect(body).toMatch(/\bwidth:\s*var\(--bdg-code-width\)/);
  });

  it("Poz Adı Poz No genişliği kadar soldan yapışkan", () => {
    const body = ruleBody(".bdg-grid .bdg-sticky-name");
    expect(body).toMatch(/position:\s*sticky/);
    expect(body).toMatch(/left:\s*var\(--bdg-code-width\)/);
    expect(body).toMatch(/min-width:\s*var\(--bdg-name-width\)/);
  });

  it("th sticky hücreleri td sticky hücrelerinden ÜSTTE (z-index)", () => {
    const th = Number(ruleBody(".bdg-grid th.bdg-sticky-code").match(/z-index:\s*(\d+)/)?.[1]);
    const td = Number(ruleBody(".bdg-grid .bdg-sticky-code").match(/z-index:\s*(\d+)/)?.[1]);
    expect(Number.isFinite(th) && Number.isFinite(td)).toBe(true);
    expect(th).toBeGreaterThan(td);
  });

  it("opak zemin: normal satır, grup satırı ve dağıtılmamış satır ayrı ayrı", () => {
    expect(ruleBody(".bdg-grid .bdg-sticky-cell")).toMatch(/background:\s*var\(--color-surface\)/);
    expect(ruleBody(".bdg-grid .ecd-items__group-row .bdg-group-label")).toMatch(/background/);
    expect(ruleBody(".bdg-grid .cdist-grid__row--undistributed .bdg-sticky-cell")).toMatch(
      /background:\s*var\(--color-audit-danger-row-bg\)/,
    );
    expect(ruleBody(".bdg-grid th.bdg-sticky-code")).toMatch(/background:\s*var\(--color-surface-2\)/);
  });

  it("satır ayırıcı çizgi td'de kalır (separate modunda satır border'ı yok olur)", () => {
    expect(ruleBody(".bdg-grid .ecd-items__td")).toMatch(/border-bottom:\s*1px solid/);
  });

  it("grup satırı etiketi kendisi yapışkan (colSpan'li td değil)", () => {
    const body = ruleBody(".bdg-grid .ecd-items__group-row .bdg-group-label");
    expect(body).toMatch(/position:\s*sticky/);
    expect(body).toMatch(/left:\s*0/);
  });

  it("kaydırma kabında scroll-padding-left sticky toplam genişlik kadar", () => {
    expect(ruleBody(".ecd-items__scroll.bdg-scroll")).toMatch(
      /scroll-padding-left:\s*calc\(var\(--bdg-code-width\)\s*\+\s*var\(--bdg-name-width\)\)/,
    );
  });

  it("sözcükler gereksiz bölünmez: overflow-wrap: anywhere YASAK, break-word var", () => {
    expect(css).not.toMatch(/overflow-wrap:\s*anywhere/);
    expect(ruleBody(".bdg-grid .bdg-sticky-name")).toMatch(/overflow-wrap:\s*break-word/);
  });

  it("çıplak hex renk YOKTUR", () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });
});

describe("paylaşılan .ecd-items__* kuralları DEĞİŞMEDİ", () => {
  it("paylaşılan stylesheet'te bdg ya da sticky YOK", () => {
    expect(sharedCss).not.toMatch(/bdg-/);
    expect(sharedCss).not.toMatch(/position:\s*sticky/);
  });

  it("kaydırma kabı ve tablo kabuğu eski gövdeleriyle duruyor", () => {
    expect(sharedCss).toMatch(/\.ecd-items__scroll\s*{\s*overflow-x:\s*auto;\s*}/);
    expect(sharedCss).toMatch(/\.ecd-items__table\s*{\s*width:\s*100%;\s*border-collapse:\s*collapse;\s*}/);
  });

  it("bdg stylesheet'i her .ecd-items__* seçicisini .bdg-grid/.bdg-scroll altında daraltır", () => {
    const selectors = [...css.matchAll(/(^|\n)([^{}\n/*][^{}]*?)\s*{/g)].map((m) => m[2]);
    const shared = selectors.filter((selector) => selector.includes("ecd-items__"));
    expect(shared.length).toBeGreaterThan(0);
    for (const selector of shared) {
      expect(selector, selector).toMatch(/bdg-(grid|scroll)/);
    }
  });
});
