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

/**
 * SEKME-F1.7a · kırıntı üst çubuğa geri döndü ve ARTIK `flex: 1` DEĞİL —
 * sekme şeridi (`.topbar-tabs`) kalan alanı istiyor, ikisi birden esneyemez.
 * Bekçi: kırıntı ESNEMEZ (`flex-shrink: 0`) ve GENİŞLİĞE DUYARLI bir
 * `max-width` (`clamp(...)`) taşır; 10 sekmede şerit kayar ama kırıntı ASLA
 * ezilmez (KARARLAR §SEKME-F1.7a).
 *
 * 🔴 İKİ SABİT DEĞER de ÇÜRÜTÜLDÜ (ölçüldü, v6 karesi): 360px 768px'te şeridi
 * SIFIRA indirdi, 220px ise 1440px'te kırıntıyı NEREDEYSE OKUNMAZ yaptı
 * (lider gözlemi). Bekçi bu yüzden SABİT bir piksel değeri DEĞİL, viewport'a
 * göre ölçeklenen bir `clamp(alt, oran vw, üst)` arar — mutasyon (sabit
 * `220px`e dönüş) bu iddiaları kırmızı yapmalı.
 */
describe("topbar.css — .topbar-crumbs ESNEMEZ + genişliğe duyarlı max-width (SEKME-F1.7a)", () => {
  it("`.topbar-crumbs` taban kuralı `flex-shrink: 0` taşır", () => {
    const body = cssWithoutComments.match(/\.topbar-crumbs\s*{([^}]*)}/)?.[0] ?? "";
    expect(body).toMatch(/flex-shrink:\s*0/);
  });

  it("`.topbar-crumbs` GENİŞLİĞE DUYARLI bir `max-width: clamp(...)` taşır (`flex: 1` DEĞİL, SABİT piksel DEĞİL)", () => {
    const body = cssWithoutComments.match(/\.topbar-crumbs\s*{([^}]*)}/)?.[0] ?? "";
    const clampMatch = body.match(/max-width:\s*clamp\(\s*(\d+)px\s*,\s*([\d.]+)vw\s*,\s*(\d+)px\s*\)/);
    expect(clampMatch, `max-width kuralı: ${body.match(/max-width:[^;]*/)?.[0] ?? "BULUNAMADI"}`).not.toBeNull();
    const [, min, pref, max] = clampMatch!;
    // Alt sınır 768px'te şeridi sıfırlamayacak kadar dar, üst sınır 1440px+'ta
    // kırıntının sonsuza büyümesini durduracak kadar sıkı olmalı (ölçüm bandı).
    expect(Number(min)).toBeGreaterThanOrEqual(180);
    expect(Number(min)).toBeLessThanOrEqual(260);
    expect(Number(pref)).toBeGreaterThan(0);
    expect(Number(max)).toBeGreaterThanOrEqual(420);
    expect(body).not.toMatch(/flex:\s*1\b/);
  });

  it("clamp bandı 1440px'te ~490px'e, 768px'te ~261px'e ULAŞIR (viewport'a göre ölçekleniyor, SABİT değil)", () => {
    const body = cssWithoutComments.match(/\.topbar-crumbs\s*{([^}]*)}/)?.[0] ?? "";
    const clampMatch = body.match(/max-width:\s*clamp\(\s*(\d+)px\s*,\s*([\d.]+)vw\s*,\s*(\d+)px\s*\)/);
    const [, min, pref, max] = clampMatch!;
    const atViewport = (vw: number) =>
      Math.min(Math.max((Number(pref) / 100) * vw, Number(min)), Number(max));
    expect(atViewport(1440)).toBeGreaterThan(420);
    expect(atViewport(768)).toBeGreaterThan(Number(min));
    expect(atViewport(768)).toBeLessThan(300);
  });

  it("`.topbar-crumbs__link`/`__current` metni ELLIPSIS ile kısalır, SON parça önceliklidir", () => {
    const linkBody = cssWithoutComments.match(/\.topbar-crumbs__link\s*{([^}]*)}/)?.[0] ?? "";
    const currentBody = cssWithoutComments.match(/\.topbar-crumbs__current\s*{([^}]*)}/)?.[0] ?? "";
    for (const body of [linkBody, currentBody]) {
      expect(body).toMatch(/overflow:\s*hidden\s*;/);
      expect(body).toMatch(/text-overflow:\s*ellipsis\s*;/);
    }
    const itemBody = cssWithoutComments.match(/\.topbar-crumbs__item\s*{([^}]*)}/)?.[0] ?? "";
    const lastChildBody =
      cssWithoutComments.match(/\.topbar-crumbs__item:last-child\s*{([^}]*)}/)?.[0] ?? "";
    const itemShrink = Number(itemBody.match(/flex-shrink:\s*(\d+)\s*;/)?.[1] ?? NaN);
    const lastShrink = Number(lastChildBody.match(/flex-shrink:\s*(\d+)\s*;/)?.[1] ?? NaN);
    expect(itemShrink).toBeGreaterThan(lastShrink);
  });

  it("🔴 BEKÇİ: 767px altında kırıntı LİSTESİ gizlenir, yalnız geri tuşu (←) kalır", () => {
    const mediaMatch = cssWithoutComments.match(/@media \(max-width: 767px\)\s*{([\s\S]*?)\n}\n/);
    expect(mediaMatch).not.toBeNull();
    const block = mediaMatch![1];
    expect(block).toMatch(/\.topbar-crumbs__list\s*{[^}]*display:\s*none/);
  });
});
