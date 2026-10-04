import { test, expect } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

async function login(page: import("@playwright/test").Page) {
  // F-ST T1 (onaylı görsel borç) — kadraj penceresi AÇIKÇA kurulur; bkz.
  // `login-visual.spec.ts` notu (config varsayılanı 1280×900, kanon 1440×900).
  // Sekiz Ayarlar baseline'ının hepsi bu yardımcıdan geçer (izin matrisi karesi IZN-F2'de
  // `page-access-visual.spec.ts`e TAŞINDI).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("gorsel: ayarlar kullanicilar", async ({ page }) => {
  await login(page);
  await page.goto("/ayarlar/kullanicilar");
  await expect(page.getByRole("cell", { name: "Ahmet Yılmaz" })).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-kullanicilar.png", { fullPage: true });
});

test("gorsel: ayarlar roller", async ({ page }) => {
  await login(page);
  await page.goto("/ayarlar/roller");
  // IZN-F2: kart ızgarası (mockup 14 kart; sahte backend 6 rol) — "Modül Erişimleri" paneli KALKTI.
  await expect(page.getByRole("article", { name: "Şantiye Şefi" })).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-roller.png", { fullPage: true });
});

test("gorsel: ayarlar sirket bilgileri", async ({ page }) => {
  await login(page);
  await page.goto("/ayarlar/sirket-bilgileri");
  // "Firma Bilgileri" hem kart basligi hem de sayfa alt basligindaki "Firma bilgilerini…"
  // metniyle esleser; iddiayi kart basligina (.company-card__title — mockup'ta kart
  // basligi ayirici cizgisiz, kart govdesinin icinde) sabitleyerek strict-mode
  // "resolved to 2 elements" hatasini onluyoruz (bkz. ayni dosyadaki matris/gorunum notlari).
  await expect(page.locator(".company-card__title", { hasText: "Firma Bilgileri" })).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-sirket-bilgileri.png", { fullPage: true });
});

test("gorsel: ayarlar bildirimler", async ({ page }) => {
  await login(page);
  await page.goto("/ayarlar/bildirimler");
  await expect(page.getByText("Hakediş & Ödeme")).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-bildirimler.png", { fullPage: true });
});

test("gorsel: ayarlar gorunum", async ({ page }) => {
  await login(page);
  await page.goto("/ayarlar/gorunum");
  // "Tema" hem karta baslik hem de olasi baska yerlerde gecebilir; kart basligina
  // (span.s-card__title) sabitleyerek sidebar'daki "Görünüm" ile karisikligi onluyoruz.
  await expect(page.getByText("Tema", { exact: true })).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-gorunum.png", { fullPage: true });
});

test("gorsel: ayarlar entegrasyonlar", async ({ page }) => {
  await login(page);
  await page.goto("/ayarlar/entegrasyonlar");
  await expect(page.getByText("GİB e-Fatura")).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-entegrasyonlar.png", { fullPage: true });
});

test("gorsel: ayarlar yedekleme", async ({ page }) => {
  await login(page);
  await page.goto("/ayarlar/yedekleme");
  await expect(page.getByText("Depolama Kullanımı")).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-yedekleme.png", { fullPage: true });
});

test("gorsel: ayarlar denetim gunlugu", async ({ page }) => {
  await login(page);
  await page.goto("/ayarlar/denetim-gunlugu");
  await expect(page.getByText("Sistemdeki tüm işlemler ve değişiklikler")).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ayarlar-denetim-gunlugu.png", { fullPage: true });
});
