import { test, expect, type Page, type Route } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// DSC-F1.2 · avatar menüsü disiplin kareleri (yalnız 1440×900).
//
// 🔴 IZN-F3.2: kullanıcı tablosu / disiplin ataması modalı kareleri KALDIRILDI — o ekranlar
// "Kullanıcıyı düzenle" modalına taşındı (`settings-users-access-visual.spec.ts`). Geriye yalnız
// `/auth/me.disciplines` okuyan avatar menüsü kareleri kaldı (hâlâ geçerli sözleşme).
//
// 🔒 İZOLASYON: `/auth/me` yalnız bu sayfada `page.route` ile değiştirilir; paylaşılan sahte
// backend durumuna YAZILMAZ.
//
// ⏱️ Tarih sabitlenir (`page.clock.setFixedTime`) — navigasyondan ÖNCE.

const FIXED_NOW = "2026-09-24T09:00:00Z";

interface Discipline {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly color: string;
}

const KAB: Discipline = { id: "00000000-0000-4000-8000-0000000000a1", code: "KAB", name: "Kaba İnşaat", color: "#2563eb" };
const DUV: Discipline = { id: "00000000-0000-4000-8000-0000000000a2", code: "DUV", name: "Duvar & Sıva", color: "#93c5fd" };

const ref = (d: Discipline) => ({ id: d.id, code: d.code, name: d.name, color: d.color });

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function login(page: Page) {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("gorsel: avatar menusu acik atamasiz", async ({ page }) => {
  await login(page);
  await page.goto("/ayarlar/kullanicilar");
  await expect(page.getByRole("cell", { name: /Ahmet Yılmaz/ })).toBeVisible();
  await page.getByRole("button", { name: "Kullanıcı menüsü" }).click();
  const menu = page.getByRole("menu", { name: "Kullanıcı menüsü" });
  await expect(menu).toBeVisible();
  await expect(page.getByText("Tümü (kısıtsız)").first()).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-avatar-menu-kisitsiz.png", { fullPage: true });
});

test("gorsel: avatar menusu acik kisitli", async ({ page }) => {
  await login(page);
  // `/auth/me` yalnız bu sayfada 2 disiplinli döner; sahte backend durumu kirlenmez.
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    return fulfillJson(route, { ...body, disciplines: [ref(KAB), ref(DUV)] });
  });
  await page.goto("/ayarlar/kullanicilar");
  await expect(page.getByRole("cell", { name: /Ahmet Yılmaz/ })).toBeVisible();
  await page.getByRole("button", { name: "Kullanıcı menüsü" }).click();
  await expect(page.getByRole("menu", { name: "Kullanıcı menüsü" })).toBeVisible();
  await expect(page.getByText("Kaba İnşaat ve Duvar & Sıva")).toBeVisible();
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-disiplin-avatar-menu-kisitli.png", { fullPage: true });
});
