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
});
