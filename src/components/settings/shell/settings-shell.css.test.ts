// @vitest-environment node
// `accounting-tabs.css.test.ts` ile AYNI gerekçe: dosya sistemi okuyan saf
// metin testi.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./settings-shell.css", import.meta.url)), "utf8");

/**
 * SEKME-F1.2 · `.settings-breadcrumb` global topbar'ı ÖRTEN `position:fixed`
 * bir şerit OLMAKTAN ÇIKTI — `.ayarlar-content`in içinde normal akışta bir
 * satır. Mutasyon: bu kurala `position: fixed` geri eklenirse bu test
 * kırmızı olmalı (M3).
 */
describe("settings-shell.css — .settings-breadcrumb artık FIXED DEĞİL (SEKME-F1.2)", () => {
  it("`.settings-breadcrumb` kuralı `position: fixed` TAŞIMAZ", () => {
    const body = css.match(/\.settings-breadcrumb\s*{[^}]*}/)?.[0] ?? "";
    expect(body).not.toBe("");
    expect(body).not.toMatch(/position:\s*fixed/);
  });

  it("`.settings-breadcrumb` artık `top`/`left`/`right`/`z-index` KOORDİNATI TAŞIMAZ", () => {
    const body = css.match(/\.settings-breadcrumb\s*{[^}]*}/)?.[0] ?? "";
    expect(body).not.toMatch(/\btop:/);
    expect(body).not.toMatch(/\bz-index:/);
  });

  it("Çıkış Yap düğmesi satırın SAĞINDA kalır (`margin-left: auto`)", () => {
    const body = css.match(/\.settings-breadcrumb__logout\s*{[^}]*}/)?.[0] ?? "";
    expect(body).toMatch(/margin-left:\s*auto/);
  });
});
