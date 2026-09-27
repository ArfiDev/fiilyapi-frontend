// @vitest-environment node
// Saf metin (CSS kaynak) testi — `workspace-tabs.css.test.ts` ile aynı
// gerekçe: kuralın METİNDE var olduğunu doğrular, cascade'i doğrulamaz
// (görsel doğrulama kullanıcı onay turunun işi).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("./topbar.css", import.meta.url)),
  "utf8",
);

// Yorumları AT: `/* … */` içindeki serbest metin bir bildirimle aynı
// kelimeleri içerebilir ve regex'i yanlışlıkla YEŞİL yapabilir — bildirim
// SİLİNSE BİLE. Kural gerçek CSS gövdesine karşı sınanır.
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("topbar.css", () => {
  it("🔴 BEKÇİ: 767px altında `.topbar-logo` daralır ve taşan yazıyı kırpar (overflow: hidden)", () => {
    const mediaMatch = cssWithoutComments.match(/@media \(max-width: 767px\)\s*{([\s\S]*?)\n}\n/);
    expect(mediaMatch).not.toBeNull();
    const block = mediaMatch![1];
    expect(block).toMatch(/\.topbar-logo\s*{[^}]*overflow:\s*hidden/);
    expect(block).toMatch(/\.topbar-logo\s*{[^}]*flex-shrink:\s*0/);
  });

  it("🔴 BEKÇİ: taban `.topbar-logo` daralmaz (flex-shrink: 0) — çok sekmeli 1440px'te sidebar hizası bozulmasın", () => {
    const baseMatch = cssWithoutComments.match(/\.topbar-logo\s*{([^}]*)}/);
    expect(baseMatch).not.toBeNull();
    expect(baseMatch![1]).toMatch(/flex-shrink:\s*0/);
  });

  it("🔴 BEKÇİ: 767px altında amblemin SOLUNDA nefes payı var — `.topbar-logo__image` `left: 0` DEĞİL", () => {
    // `padding-left` TEK BAŞINA yetmez (mutlak konumlu görsel padding kutusunun
    // DIŞ kenarına oturur, padding'i yok sayar — ölçüldü) — bu yüzden
    // gerçek mekanizma görselin `left` ofsetidir. `left: 0` kalırsa amblem
    // yine ekranın/şeridin sol kenarına yapışır (lider gözlemindeki kusur).
    const mediaMatch = cssWithoutComments.match(/@media \(max-width: 767px\)\s*{([\s\S]*?)\n}\n/);
    expect(mediaMatch).not.toBeNull();
    const block = mediaMatch![1];
    const imageMatch = block.match(/\.topbar-logo__image\s*{([^}]*)}/);
    expect(imageMatch).not.toBeNull();
    expect(imageMatch![1]).not.toMatch(/left:\s*0(?!\.\d)/);
    expect(imageMatch![1]).toMatch(/left:\s*[1-9]/);
  });

  it("🔴 BEKÇİ: 767px altında amblem `clip-path` ile SAĞDAN kesilir — sol boşluk sırasında 'FİİL' yazısı sızmaz", () => {
    const mediaMatch = cssWithoutComments.match(/@media \(max-width: 767px\)\s*{([\s\S]*?)\n}\n/);
    const block = mediaMatch![1];
    expect(block).toMatch(/\.topbar-logo__image\s*{[^}]*clip-path:\s*inset\(0\s+165px\s+0\s+0\)/);
  });
});
