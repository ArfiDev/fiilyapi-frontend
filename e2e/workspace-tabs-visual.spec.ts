import { test, expect } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";
import { login, openViaSidebar, tabByName } from "./workspace-tabs-helpers";

/**
 * SEKME-F1.5 · çalışma sekmeleri şeridi — GÖRSEL kareler (emir §3).
 *
 * KADRAJ: depodaki emsalin ÇOĞUNLUĞU (205 karenin 204'ü) TAM SAYFA 1440'tır
 * (`shell-visual.spec.ts`, `dashboard.visual.spec.ts` vb. — `toHaveScreenshot`
 * `fullPage: true`). Bu dosya da aynı kanonu izler: şerit kabuğun (topbar)
 * bir PARÇASI ve içerik ile aynı karede birlikte anlam taşıyor (aktif sekmenin
 * altındaki sayfa da karede görünür) — yalnız şeridi kırpmak bunu keserdi ve
 * depoda "yalnız şerit" diye ayrı bir emsal de YOK. Baseline'lar YALNIZ CI'dan
 * (Linux) alınır — bu dosya yerelde YALNIZ "yüklendi" iddialarını sınamak
 * için koşulur (bkz. RAPOR).
 */

const VIEWPORT_1440 = { width: 1440, height: 900 } as const;
const VIEWPORT_390 = { width: 390, height: 844 } as const;

test.describe("çalışma sekmeleri — 1440", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORT_1440);
    await login(page);
  });

  test("4 sekme (biri aktif)", async ({ page }) => {
    await openViaSidebar(page, "Onay Kutusu");
    await openViaSidebar(page, "Raporlar");
    await openViaSidebar(page, "Puantaj");
    await expect(tabByName(page, "Puantaj")).toHaveAttribute("aria-selected", "true");

    await prepareFrame(page);
    await expect(page).toHaveScreenshot("workspace-tabs-4-tabs.png", { fullPage: true });
  });

  test("10 sekme sona kaydırılmış (panel sticky, aktif görünür)", async ({ page }) => {
    const modules = [
      "Onay Kutusu",
      "FİİL AI",
      "Raporlar",
      "Projeler",
      "Puantaj",
      "Makine & Ekipman",
      "Günlük Kayıt",
      "Personel",
      "Planlama Paneli",
    ];
    for (const label of modules) await openViaSidebar(page, label);
    await expect(tabByName(page, "Planlama Paneli")).toHaveAttribute("aria-selected", "true");

    await prepareFrame(page);
    await expect(page).toHaveScreenshot("workspace-tabs-10-tabs-scrolled.png", { fullPage: true });
  });

  test("sağ tık menüsü açık", async ({ page }) => {
    await openViaSidebar(page, "Onay Kutusu");
    await openViaSidebar(page, "Raporlar");
    // Sabit imleç koordinatı: menü konumu deterministik olsun (park noktasına
    // BAĞIMSIZ — menü kendi `x`/`y`sinde açılır, bu tıklama koordinatıdır).
    await tabByName(page, "Raporlar").click({ button: "right", position: { x: 10, y: 10 } });
    await expect(page.getByRole("menu", { name: "Sekme seçenekleri" })).toBeVisible();

    // `prepareFrame` imleci sağ-alt köşeye park eder — menü ZATEN açık
    // olduğundan hover kararsızlığı yok, yalnız kaydırma/park uygulanır.
    await prepareFrame(page);
    await expect(page).toHaveScreenshot("workspace-tabs-context-menu.png", { fullPage: true });
  });

  test("dirty onay modalı", async ({ page }) => {
    await openViaSidebar(page, "Projeler");
    await page.getByRole("link", { name: "+ Yeni Proje" }).click();
    await page.getByLabel("Proje Adı").fill("Deneme Projesi");
    await openViaSidebar(page, "Puantaj");
    await expect(page.getByRole("dialog", { name: "Kaydedilmemiş değişiklikler var" })).toBeVisible();

    await prepareFrame(page);
    await expect(page).toHaveScreenshot("workspace-tabs-dirty-modal.png", { fullPage: true });
  });
});

test.describe("çalışma sekmeleri — 390 (dar ekran amblemi)", () => {
  test("4 sekme, logo amblemi", async ({ page }) => {
    await page.setViewportSize(VIEWPORT_390);
    await login(page);
    await openViaSidebar(page, "Onay Kutusu");
    await openViaSidebar(page, "Raporlar");
    await openViaSidebar(page, "Puantaj");
    await expect(tabByName(page, "Puantaj")).toHaveAttribute("aria-selected", "true");

    await prepareFrame(page);
    await expect(page).toHaveScreenshot("workspace-tabs-390-emblem.png", { fullPage: true });
  });
});
