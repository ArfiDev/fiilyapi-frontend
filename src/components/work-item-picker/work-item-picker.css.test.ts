// @vitest-environment node
// boq-assignment.css.test.ts deseni: stylesheet'in TOKEN disiplinini kapıya bağlar.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./work-item-picker.css", import.meta.url)), "utf8");
const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("work-item-picker.css — token disiplini", () => {
  it("çıplak hex YOK, renkler token üzerinden", () => {
    expect(declarations.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(declarations).toMatch(/var\(--color-/);
  });

  it("hatalı satır mockup'ın danger-tint-weak zemini + tint-border kenarlığını taşır", () => {
    const rule = /\.wip-row--error td\s*{([^}]*)}/.exec(declarations)?.[1] ?? "";
    expect(rule).toContain("var(--color-danger-tint-weak)");
    expect(rule).toContain("var(--color-danger-tint-border)");
  });

  it("seçilemeyen satır soluk (PS:184-187 opacity .55)", () => {
    expect(/\.wip-row--blocked td\s*{([^}]*)}/.exec(declarations)?.[1]).toContain("opacity: 0.55");
  });

  it("tablo yatay kaydırılır (dar ekranda kabuktan taşmaz)", () => {
    expect(/\.wip-table-scroll\s*{([^}]*)}/.exec(declarations)?.[1]).toContain("overflow-x: auto");
  });

  // TKL-F2.4.1 ORTA-3: `.wip-th { position: sticky }` en yakın KAYDIRMA kabına yapışır. Eskiden o kap
  // `.wip-table-scroll` yalnız `overflow-x:auto` idi (dikeyde kaymıyor) → başlık hiç yapışmıyordu, kayan şey
  // modal gövdesiydi. Mockup PS:86-88 gibi: araç çubuğu + bilgi bandı SABİT, DİKEY kaydırma TABLO KABINDA.
  it("🔴 başlık sticky: sticky'nin kabı (.wip-table-scroll) DİKEYDE kayar ve yüksekliği sınırlıdır", () => {
    expect(/\.wip-th\s*{([^}]*)}/.exec(declarations)?.[1]).toContain("position: sticky");
    const scroller = /\.wip-table-scroll\s*{([^}]*)}/.exec(declarations)?.[1] ?? "";
    expect(scroller).toMatch(/overflow-y:\s*auto|overflow:\s*auto/);
    // Yükseklik sınırı: esnek (gövde kalanını doldurur) + min-height ya da mockup'taki gibi max-height.
    expect(scroller).toMatch(/max-height:|flex:\s*1 1 auto[\s\S]*min-height:|min-height:[\s\S]*flex:\s*1 1 auto/);
  });

  it("araç çubuğu ve bilgi bandı kayan tablo kabının DIŞINDA sabit kalır (flex: none)", () => {
    expect(/\.wip-toolbar\s*{([^}]*)}/.exec(declarations)?.[1]).toContain("flex: none");
    expect(/\.wip-note\s*{([^}]*)}/.exec(declarations)?.[1]).toContain("flex: none");
    expect(/\.wip-modal \.modal__body\s*{([^}]*)}/.exec(declarations)?.[1]).toMatch(/display:\s*flex[\s\S]*flex-direction:\s*column/);
  });

  // TKL-F2.4 · T13 karesi ölçtü: `.modal` tüm kutuyu kaydırdığından altbilgi (hata bandı, Σ, "N Pozu Ekle")
  // uzun katalogda görünmüyordu. jsdom yerleşim hesaplamaz → kural metin düzeyinde bekçilenir.
  it("🔴 altbilgi SABİT: kutu sütun-flex + taşma gizli, YALNIZ gövde kayar", () => {
    expect(/\.wip-modal\s*{([^}]*)}/.exec(declarations)?.[1]).toMatch(/display:\s*flex[\s\S]*flex-direction:\s*column[\s\S]*overflow:\s*hidden/);
    const body = /\.wip-modal \.modal__body\s*{([^}]*)}/.exec(declarations)?.[1] ?? "";
    expect(body).toContain("overflow-y: auto");
    expect(body).toContain("min-height: 0");
    expect(/\.wip-modal \.modal__head,\s*\.wip-modal \.modal__footer\s*{([^}]*)}/.exec(declarations)?.[1]).toContain("flex: none");
  });
});
