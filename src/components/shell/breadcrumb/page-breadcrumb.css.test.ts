// @vitest-environment node
// Not: `settings/modal.css.test.ts` ile aynı gerekçe — dosya sistemi okuyan
// saf metin testi. KAPSAM UYARISI: bu dosya YALNIZCA stylesheet METNİNDE
// ilgili kuralın var olduğunu doğrular; cascade'i ya da tarayıcıdaki
// GERÇEK ölçüyü DOĞRULAMAZ (o, `scratchpad/rv/measure4.cjs` tarzı headless
// Chromium ölçümünün işi — bkz. SEKME-F1.2-FIX raporu, önce/sonra tablosu).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./page-breadcrumb.css", import.meta.url)), "utf8");

/**
 * D7 (SEKME-F1.2-FIX) · kırıntı topbar'dan `<main class="app-content">`in
 * içine inerken eski `.topbar-crumbs*`in DIŞ `overflow:hidden`i kayboldu —
 * yalnız SON parça (`.page-crumbs__current`) kendi metnini kırpıyordu,
 * öncekiler (`.page-crumbs__link`) nowrap+kırpmasız kalıp satırı belgeyi
 * yatay kaydıracak kadar genişletiyordu (768px'te ölçülen 803px belge
 * genişliği — bkz. rapor). Bekçi: her iki metin kutusu da `ellipsis`,
 * önceki parçalar SON parçadan önce küçülür.
 */
describe("page-breadcrumb.css — taşma bekçisi (D7)", () => {
  it("`.page-crumbs__link` metni ELLIPSIS ile kısalır (yalnız nowrap DEĞİL)", () => {
    const body = css.match(/\.page-crumbs__link\s*{[^}]*}/)?.[0] ?? "";
    expect(body).toMatch(/overflow:\s*hidden\s*;/);
    expect(body).toMatch(/text-overflow:\s*ellipsis\s*;/);
  });

  it("`.page-crumbs__current` metni hâlâ ELLIPSIS ile kısalır", () => {
    const body = css.match(/\.page-crumbs__current\s*{[^}]*}/)?.[0] ?? "";
    expect(body).toMatch(/overflow:\s*hidden\s*;/);
    expect(body).toMatch(/text-overflow:\s*ellipsis\s*;/);
  });

  it("SON parça öncelikli daralır: önceki parçaların `flex-shrink`i son parçadan BÜYÜK", () => {
    const itemBody = css.match(/\.page-crumbs__item\s*{[^}]*}/)?.[0] ?? "";
    const lastChildBody = css.match(/\.page-crumbs__item:last-child\s*{[^}]*}/)?.[0] ?? "";
    const itemShrink = Number(itemBody.match(/flex-shrink:\s*(\d+)\s*;/)?.[1] ?? NaN);
    const lastShrink = Number(lastChildBody.match(/flex-shrink:\s*(\d+)\s*;/)?.[1] ?? NaN);
    expect(Number.isNaN(itemShrink)).toBe(false);
    expect(Number.isNaN(lastShrink)).toBe(false);
    expect(itemShrink).toBeGreaterThan(lastShrink);
  });
});
