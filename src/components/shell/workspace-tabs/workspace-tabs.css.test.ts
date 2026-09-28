// @vitest-environment node
// Saf metin (CSS kaynak) testi — `date-input.css.test.ts` ile aynı gerekçe:
// kuralın METİNDE var olduğunu doğrular, cascade'i doğrulamaz (görsel
// doğrulama kullanıcı onay turunun işi).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("./workspace-tabs.css", import.meta.url)),
  "utf8",
);

// Yorumları AT: `/* … */` içindeki serbest metin bir bildirimle aynı
// kelimeleri içerebilir (ör. bu dosyadaki `flex: 1` açıklaması) ve regex'i
// yanlışlıkla YEŞİL yapabilir — bildirim SİLİNSE BİLE. Kural gerçek CSS
// gövdesine karşı sınanır.
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("workspace-tabs.css", () => {
  it("🔴 BEKÇİ: çıplak hex renk YOKTUR — palet yalnız token'dan gelir", () => {
    expect(css.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });

  it("🔴 BEKÇİ: hareket yalnız transform/opacity üzerinden tanımlanır (compositor dostu)", () => {
    const transitionLines = css.match(/transition:[^;]+;/g) ?? [];
    for (const line of transitionLines) {
      expect(line).not.toMatch(/\b(width|height|top|left|margin|padding|border-width|font-size)\s/);
    }
  });

  it("prefers-reduced-motion altında kaydırma animasyonu KAPANIR", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*{[^}]*scroll-behavior:\s*auto/);
  });

  it("şerit taşınca YATAY KAYAR (overflow-x auto)", () => {
    expect(css).toMatch(/\.workspace-tabs__list\s*{[^}]*overflow-x:\s*auto/);
  });

  it("🔴 BEKÇİ (SEKME-F1.4c): sekme İÇERİĞE göre boyutlanır — daralma YOK (flex-shrink: 0, min-width YOK)", () => {
    const tabMatch = cssWithoutComments.match(/\.workspace-tab\s*{([^}]*)}/);
    expect(tabMatch).not.toBeNull();
    const block = tabMatch![1];
    expect(block).toMatch(/flex:\s*0\s+0\s+auto/);
    expect(block).not.toMatch(/min-width/);
  });

  it("🔴 BEKÇİ (SEKME-F1.4c): tek güvenlik sınırı max-width: 320px", () => {
    expect(cssWithoutComments).toMatch(/\.workspace-tab\s*{[^}]*max-width:\s*320px/);
  });

  it("🔴 BEKÇİ (SEKME-F1.4c v4): panel (pinned) sekme SABİT kalır — position: sticky; left: 0", () => {
    const pinnedMatch = cssWithoutComments.match(/\.workspace-tab--pinned\s*{([^}]*)}/);
    expect(pinnedMatch).not.toBeNull();
    const block = pinnedMatch![1];
    expect(block).toMatch(/position:\s*sticky/);
    expect(block).toMatch(/left:\s*0/);
    expect(block).toMatch(/background:\s*var\(--color-surface\)/);
  });

  it("🔴 BEKÇİ (SEKME-F1.4c v5): şeritte SOL iç boşluk YOK — panelin solunda kayan sekme sızacak 'sahipsiz' piksel kalmaz", () => {
    // v4 turu KUSURU (ölçüldü, elementFromPoint): `.workspace-tabs__list`in
    // `padding-inline-start`i panelin sticky `left:0`ından ÖNCE kalan bir
    // şerit bırakıyordu ve kayan sekmeler oraya sızıyordu. Kalıcı çözüm: bu
    // boşluk konteynerden TAMAMEN kalkar, panelin kendi `padding-left`ine
    // taşınır (aşağıdaki test) — tek kaynak, sızıntı YAPISAL olarak imkânsız.
    const listMatch = cssWithoutComments.match(/\.workspace-tabs__list\s*{([^}]*)}/);
    expect(listMatch).not.toBeNull();
    const block = listMatch![1];
    expect(block).not.toMatch(/padding:\s*/);
    expect(block).not.toMatch(/padding-left/);
    expect(block).toMatch(/padding-inline:\s*0\s+var\(--space-2\)/);
  });

  it("🔴 BEKÇİ (SEKME-F1.4c v5): panel şeritten kalkan sol boşluğu KENDİ padding'inde devralır", () => {
    const pinnedMatch = cssWithoutComments.match(/\.workspace-tab--pinned\s*{([^}]*)}/);
    expect(pinnedMatch).not.toBeNull();
    expect(pinnedMatch![1]).toMatch(/padding-left:\s*calc\(var\(--space-3\)\s*\+\s*var\(--space-2\)\)/);
  });

  it("🔴 BEKÇİ: × sekmenin SAĞ KENARINA yaslanır — başlık `flex: 1` ile kalan alanı doldurur", () => {
    // Lider incelemesi (v1 kusuru): `flex: 1` olmadan başlık kendi içerik
    // genişliğinde kalır, × hemen ardına yapışır ve sekmenin sağında
    // kullanılmayan boşluk kalır. `.workspace-tab__close`in `flex-shrink: 0`
    // olması TEK BAŞINA yetmez — büyüyen bir kardeş (başlık) olmadan sağa
    // yaslanmaz.
    expect(cssWithoutComments).toMatch(/\.workspace-tab__title\s*{[^}]*flex:\s*1/);
  });
});
