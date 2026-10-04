import { test, expect } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// Şantiye Detay ekranı görsel testi (Task 12). mock-backend.ts'teki s-1
// (A-Blok Şantiyesi) iki bölümle gelir — biri aktif (mavi ilerleme şeması),
// biri tamamlandı (yeşil) — SectionCard'ın durum bazlı varyantlarını kapsar.
test("santiye detay ekrani gorsel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();

  await page.goto("/projeler/p-1/santiyeler/s-1");
  await expect(page.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi" })).toBeVisible();
  await expect(page.getByText("Kat 6–10 Kaba İnşaat")).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("santiye-detay.png", { fullPage: true });
});

// SIL-F1.2 — ortak silme onay penceresi. Mock oturum `is_system_admin: false`
// döner (yukarıdaki kare Sil düğmesini GÖRMEZ); bu test oturumu yalnız kendi
// kadrajı için Sistem Yöneticisi yapar (`page.route`, paylaşılan durum oynamaz).
// Önizleme mock'u mali satır + "silinmeyecek" bölümü + "+N daha" örneği taşır.
test("silme onay penceresi gorsel", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...me, is_system_admin: true }),
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();

  await page.goto("/projeler/p-1/santiyeler/s-1");
  await expect(page.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi" })).toBeVisible();
  await page.getByRole("button", { name: "Sil" }).click();
  const dialog = page.getByRole("dialog", { name: "Şantiye silinsin mi?" });
  await expect(dialog.getByText("A-Blok Şantiyesi ve bağlı 14 kayıt silinecek.")).toBeVisible();
  await expect(dialog.getByText("mali kayıt")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Sil" })).toBeEnabled();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("silme-onay-penceresi.png", { fullPage: true });
});
