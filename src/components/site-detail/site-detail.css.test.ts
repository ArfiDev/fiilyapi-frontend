// @vitest-environment node
// Not: tokens.test.ts ile aynı gerekçe — dosya sistemi okuyan saf metin testi.
//
// KAPSAM UYARISI (kod inceleme bulgusu düzeltmesi, Task 12 takibi): bu dosya
// SADECE stylesheet metninde ilgili :focus-visible kuralının VAR OLDUĞUNU
// doğrular (regex ile string eşleşmesi). Şunları DOĞRULAMAZ:
//   - ilgili elemanın gerçekten odaklanabilir olduğunu (tabIndex/semantik etiket)
//   - elemanın Tab sırasında yer aldığını
//   - bu kuralın cascade'de daha sonra gelen başka bir kuralla (ör. outline: none)
//     ezilmediğini
// Bu, kasıtlı bir CSS-yazım regresyon korumasıdır — kural stylesheet'ten yanlışlıkla
// silinirse testi kırar. Gerçek klavye davranışı (odaklanabilirlik, Tab sırası) için
// bkz. eşlik eden SiteDetailTabs.test.tsx ve SectionCard.test.tsx içindeki
// "(davranışsal)" bloklar. (SiteHeroBar için ayrı bir davranışsal test bu düzeltmenin
// kapsamı dışındadır — yalnızca bu CSS regresyon koruması geçerlidir.)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./site-detail.css", import.meta.url)), "utf8");

describe("site-detail.css — focus-visible kural metni var mı (regresyon koruması)", () => {
  it("şantiye sekmesi :focus-visible ile tasarlanmış odak halkası tanımlar (--focus-ring)", () => {
    expect(css).toMatch(/\.site-detail-tabs__tab:focus-visible\s*{[^}]*--focus-ring/);
  });

  it("hero eylem butonu marka zemininde belirgin bir on-brand dış hat tanımlar", () => {
    // project-hero__tab ile aynı gerekçe: jenerik --focus-ring marka degradesi
    // üstünde görünmez kalır.
    expect(css).toMatch(/\.site-hero__btn:focus-visible\s*{[^}]*outline:\s*2px solid var\(--color-on-brand\)/);
  });

  it("bölüm kartı eylem butonu :focus-visible ile tasarlanmış odak halkası tanımlar (--focus-ring)", () => {
    expect(css).toMatch(/\.section-card__action-btn:focus-visible\s*{[^}]*--focus-ring/);
  });

  // F-SUBPX-4 (ajan B): `.site-detail-tabs__tab` gövdenin `--leading-normal`
  // (1.5) satır aralığını miras alırsa 13px × 1.5 = 19.5px (kesirli) verir ve
  // bu, şantiye kabuğunun sekme şeridini kullanan TÜM sayfalarda (ts.ts--site
  // kökü dahil) aşağı doğru kesirli-yükseklik zinciri başlatır (çalışma
  // zamanında ölçüldü). Kuralın kendi `line-height: 20px` bildirimi
  // stylesheet'ten yanlışlıkla silinirse bu test kırılır.
  it("şantiye sekmesi kendi satır aralığını tam piksele sabitler (line-height: 20px)", () => {
    expect(css).toMatch(/\.site-detail-tabs__tab\s*{[^}]*line-height:\s*20px/);
  });
});
