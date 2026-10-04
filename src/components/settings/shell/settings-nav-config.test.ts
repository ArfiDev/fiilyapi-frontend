// @vitest-environment node
//
// KUSUR (kalan-3 #438): settings-nav-config.ts'te bir emoji `\u{1F44D}` JS
// kaçış dizisi olarak yazılmıştı. symbol-subset-guard.test.ts kaynağı
// karakter karakter tarar (readFileSync + codePointAt) — kaçış dizisi
// kaynakta salt ASCII karakterlerdir, gerçek kod noktası (0x1F44D) HİÇ
// ortaya çıkmaz, bekçi onu göremez. Bu test dosyanın HAM KAYNAĞINI okuyup
// JS unicode kaçış dizisi (`\u{...}` veya `\uXXXX`) İÇERMEDİĞİNİ doğrular —
// böylece emoji alanları her zaman literal glif olarak yazılır ve
// symbol-subset-guard onları görebilir.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import { SETTINGS_NAV } from "./settings-nav-config";

const filePath = fileURLToPath(new URL("./settings-nav-config.ts", import.meta.url));

describe("settings-nav-config emoji literal kurali", () => {
  it("'Onay Rolleri ve Esik' emoji alani JS unicode kacis dizisi ICERMEZ", () => {
    const source = readFileSync(filePath, "utf8");
    const line = source.split("\n").find((l) => l.includes("Onay Rolleri ve Eşik"));
    expect(line).toBeDefined();
    const escapeSequence = /\\u\{[0-9a-fA-F]+\}|\\u[0-9a-fA-F]{4}/;
    expect(line).not.toMatch(escapeSequence);
  });
});

describe("settings-nav-config Planlama (PLN-F1 · K21)", () => {
  it("GENEL grubunun son ogesi Planlama'dir; YENI cipi yoktur", () => {
    const genel = SETTINGS_NAV.find((g) => g.heading === "GENEL");
    const last = genel!.items[genel!.items.length - 1];
    expect(last).toEqual({
      label: "Planlama",
      pageKey: "ayarlar.planlama",
      href: "/ayarlar/planlama",
      emoji: "📈",
    });
  });
});
