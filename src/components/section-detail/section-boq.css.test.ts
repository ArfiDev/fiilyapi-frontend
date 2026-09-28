// @vitest-environment node
// TASMA-F1 · Bölüm Detay › İş Kalemleri 768px'te sayfayı yatay taşırmasın.
// KAPSAM UYARISI: yalnız stylesheet METNİNİ doğrular; taşma/kaydırma davranışı
// Playwright ölçümünün işidir (768'de documentElement.scrollWidth === clientWidth).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./section-detail.css", import.meta.url)), "utf8");
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
const boqCss = readFileSync(
  fileURLToPath(new URL("../boq/boq.css", import.meta.url)),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(source);
  expect(match, selector).not.toBeNull();
  return match?.[1] ?? "";
}

describe("section-detail.css — İş Kalemleri tablo kabı (TASMA-F1)", () => {
  it(".section-boq yatay kaydırma kabıdır (Durum sütununa kaydırarak ulaşılır)", () => {
    expect(ruleBody(withoutComments, ".section-boq")).toMatch(/overflow-x:\s*auto/);
  });

  it(".section-boq konumludur: `.sr-only` gerekçe kırpmadan kaçıp sayfayı 829px'e taşımaz", () => {
    expect(ruleBody(withoutComments, ".section-boq")).toMatch(/position:\s*relative/);
  });

  it(".section-boq__head kaydırmada solda sabit kalır (sticky + left:0)", () => {
    const head = ruleBody(withoutComments, ".section-boq__head");
    expect(head).toMatch(/position:\s*sticky/);
    expect(head).toMatch(/left:\s*0/);
  });

  it("paylaşılan `.boq-table` kuralına taşma kuralı SIZMAZ (yalnız .section-boq* seçicileri)", () => {
    expect(ruleBody(boqCss, ".boq-table")).not.toMatch(/overflow|min-width/);
  });
});
