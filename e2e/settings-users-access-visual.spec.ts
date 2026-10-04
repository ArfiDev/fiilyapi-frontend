import { test, expect, type Page } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// IZN-F3.2 · "Kullanıcıyı düzenle" modalı görsel kareleri (yalnız 1440×900).
// Kaynak mockup: Ayarlar - Kullanıcılar (TASLAK).dc.html — Durum 2 (proje bazlı) ve Durum 3 (tüm projeler).
//
// 🔒 İZOLASYON: paylaşılan sahte backend durumuna YAZILMAZ — modal yalnız AÇILIR (Kaydet yok). Proje bazlı
// karedeki ELK disiplin çipi paylaşılan durumu kirletmemek için YALNIZ bu sayfada `page.route` ile eklenir
// (tohum disiplin atamasızdır; `user_count` kareleri değişmez).
//
// ⏱️ Tarih sabitlenir (`page.clock.setFixedTime`) — navigasyondan ÖNCE. Her karede `prepareFrame` kareden hemen
// önceki SON çağrıdır; kareler `fullPage`tir (örtü katmanı da kadraja girsin).

const FIXED_NOW = "2026-09-24T09:00:00Z";
const ELK = { id: "00000000-0000-4000-8000-0000000000a4", code: "ELK", name: "Elektrik", color: "#cbd5e1" };

async function login(page: Page) {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

async function openEditModal(page: Page, userName: RegExp) {
  await page.goto("/ayarlar/kullanicilar");
  await expect(page.getByRole("cell", { name: /Ahmet Yılmaz/ })).toBeVisible();
  await page.getByRole("row", { name: userName }).getByRole("button", { name: "Düzenle" }).click();
  const dialog = page.getByRole("dialog", { name: "Kullanıcıyı düzenle" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("gorsel: kullanici duzenle proje bazli", async ({ page }) => {
  await login(page);
  // Kadir Arslan (u-4): iki projede ekipte; Kule A'da ELK disiplini (yalnız bu sayfada eklenir).
  await page.route("**/api/backend/users/u-4/access", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as { projects: Array<{ project_id: string; disciplines: unknown[] }> };
    const projects = body.projects.map((p) => (p.project_id === "p-1" ? { ...p, disciplines: [ELK] } : p));
    return route.fulfill({ response, json: { ...body, projects } });
  });
  const dialog = await openEditModal(page, /Kadir Arslan/);
  await expect(dialog.getByText("2 projede ekipte")).toBeVisible();
  await expect(dialog.locator(".dsc-chip__name", { hasText: "Elektrik" })).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-kullanici-duzenle-proje-bazli.png", { fullPage: true });
});

test("gorsel: kullanici duzenle tum projeler", async ({ page }) => {
  await login(page);
  // Ayşe Demir (u-3): `all_projects` — tablo yerine "Tüm projelere erişir · disiplin kısıtı yok" kutusu.
  const dialog = await openEditModal(page, /Ayşe Demir/);
  await expect(dialog.getByText("Tüm projelere erişir · disiplin kısıtı yok")).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-kullanici-duzenle-tum-projeler.png", { fullPage: true });
});
