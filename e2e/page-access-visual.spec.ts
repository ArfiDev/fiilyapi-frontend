import { test, expect, type Page } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// IZN-F2.2 · `Ayarlar - Sayfa İzinleri (TASLAK).dc.html` görsel kadrajları (2 kare).
// Kanonik mockup: `projedesign/Ayarlar - Sayfa İzinleri (TASLAK).dc.html`.
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER (5. kapı `--grep-invert` ile BAŞLIĞA göre süzer).
// 🔴 Kare adları SABİT dizgedir, döngü YOK (görsel kadraj bekçisi `for` içindeki kareyi çarpanla sayar).
// 🔒 YAZMA YOK: ikinci kare yalnız taslak düzenler, "Kaydet"e BASMAZ; sahte backend PUT'u zaten yankılar
//    ve durumu değiştirmez (`mock-role-pages.ts`).
//
// Baseline `.png` YALNIZ Linux CI'da üretilir; macOS'ta commit edilmez.

async function openPageAccess(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
  // `?rol=` ile Şantiye Şefi seçili açılır (seçim URL durumudur).
  await page.goto("/ayarlar/izin-matrisi?rol=role-saha");
  await expect(page.getByRole("heading", { name: "Şantiye Şefi" })).toBeVisible();
  // Mockup'taki gibi SAHA grubu açık.
  await page.getByRole("button", { name: /^Saha/ }).click();
  await expect(page.getByRole("group", { name: "Puantaj erişim düzeyi" })).toBeVisible();
}

test("ayarlar sayfa izinleri sef secili gorsel", async ({ page }) => {
  await openPageAccess(page);
  await expect(page.getByRole("button", { name: "Kaydet" })).toBeDisabled();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-sayfa-izinleri-sef-secili.png", { fullPage: true });
});

test("ayarlar sayfa izinleri kaydedilmemis degisiklik gorsel", async ({ page }) => {
  await openPageAccess(page);
  await page
    .getByRole("group", { name: "Makine & Ekipman › Kira Hakedişi erişim düzeyi" })
    .getByRole("button", { name: "Görmez" })
    .click();
  await page.getByRole("checkbox", { name: /Maliyet ve kâr/ }).check();
  await expect(page.getByRole("status")).toHaveText("2 kaydedilmemiş değişiklik");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-sayfa-izinleri-kaydedilmemis-degisiklik.png", { fullPage: true });
});
