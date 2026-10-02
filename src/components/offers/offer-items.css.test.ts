// @vitest-environment node
// work-item-picker.css.test.ts deseni: kalem tablosu stylesheet'inin TOKEN disiplinini kapıya bağlar.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./offer-items.css", import.meta.url)), "utf8");
const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("offer-items.css — token disiplini (TKL-F3.6)", () => {
  it("çıplak hex YOK, renkler token üzerinden; !important YOK", () => {
    expect(declarations.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(declarations).toMatch(/var\(--color-/);
    expect(declarations).not.toContain("!important");
  });

  it("elle değiştirilen hücre mavi tonları, fiyatsız satır sarı tonu token'dan (mockup #eff6ff/#93c5fd, #fffbeb)", () => {
    const override = /\.oit-in--override\s*{([^}]*)}/.exec(declarations)?.[1] ?? "";
    expect(override).toContain("var(--color-primary-soft)");
    expect(override).toContain("var(--color-primary-border-soft)");
    expect(/\.oit-row--missing td\s*{([^}]*)}/.exec(declarations)?.[1]).toContain("var(--color-warning-tint)");
  });

  it("tablo yatay kaydırılır (dar ekranda kabuktan taşmaz); layout özelliği ANİMASYONU yok", () => {
    expect(/\.oit-scroll\s*{([^}]*)}/.exec(declarations)?.[1]).toContain("overflow-x: auto");
    expect(declarations).not.toMatch(/transition\s*:/);
  });
});
