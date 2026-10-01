import { test, expect } from "@playwright/test";

import { loginForCatalog, openWorkItemCatalog, withContractsLevel } from "./work-item-catalog-helpers";
import { prepareFrame } from "./visual-scroll";

// TKL-F1.5 · `Planlama - İş Kalemi Kataloğu` (KIK) görsel kadrajları.
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER (5. kapı `--grep-invert` ile BAŞLIĞA göre süzer).
//
// 🔒 SALT-OKUR: hiçbir kadraj bir kaydı GÖNDERMEZ. Satır hatası istemci doğrulamasıdır (boş
// "Tarif" → istek gitmez); düzenleme/yeni satır açılıp kadraja alınır, "Kaydet" yalnız hata
// kadrajında ve yalnız BOŞ formla basılır. Paylaşılan mock kataloğu `fullyParallel` altında oynamaz.
//
// 📅 Saat `loginForCatalog` → `login` içinde NAVİGASYONDAN ÖNCE çakılır (24.09.2026): "Fiyat
// güncelleme" turuncusu (> 182 gün: Demir 10.12.2025, Pis su borusu 01.02.2026) ekranın `new Date()`
// değerine bağlıdır; mock'un `EV_NOW`ı (24.09.2026) ile aynı gündür.
//
// 👁️ SALT OKUNUR hâl: mock'ta rol taklidi yok → `/api/auth/me` yanıtı bu sayfaya özel
// `page.route` ile yeniden yazılır (`withContractsLevel`, `contracts: "view"`); paylaşılan durum oynamaz.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir; macOS'ta commit edilmez.

test.beforeEach(async ({ page }) => {
  await loginForCatalog(page);
});

// ---------------------------------------------------------------------------
// 1) KIK:128-181 · ana liste — sekmeler, çipler, arama, 16 kalem, eski fiyat turuncusu, dipnot
// ---------------------------------------------------------------------------
test("is kalemi katalogu ana liste gorsel", async ({ page }) => {
  await openWorkItemCatalog(page);
  await expect(page.locator(".wik-upd--stale")).toHaveCount(2);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("is-kalemi-katalogu-liste.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 2) KIK:149-176 · satır içi düzenleme — Demir (eski fiyat), poz no salt okunur, ipucu satırı
// ---------------------------------------------------------------------------
test("is kalemi katalogu duzenleme satiri gorsel", async ({ page }) => {
  await openWorkItemCatalog(page);
  await page.getByRole("button", { name: "KAB-0003 · Demir düzenle" }).click();
  const row = page.locator('main [data-testid^="wik-edit-"]');
  await expect(row.getByLabel("Referans fiyat")).toHaveValue("28500,00");
  await expect(row.getByTestId("wik-poz")).toHaveText("KAB-0003");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("is-kalemi-katalogu-duzenleme-satiri.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 3) KIK:285 · yeni satır — "Otomatik" poz, ilk disiplin alt satırı (KAB), boş alanlar
// ---------------------------------------------------------------------------
test("is kalemi katalogu yeni satir gorsel", async ({ page }) => {
  await openWorkItemCatalog(page);
  await page.getByRole("button", { name: "+ Kalem Ekle" }).click();
  const row = page.locator('main [data-testid^="wik-edit-new-"]');
  await expect(row).toContainText("Otomatik");
  await expect(row).toContainText("KAB · Kaba İnşaat");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("is-kalemi-katalogu-yeni-satir.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 4) KIK:263-266 · satır hatası — boş yeni satır "Kaydet" → "Tarif zorunlu" (istek GİTMEZ)
// ---------------------------------------------------------------------------
test("is kalemi katalogu satir hatasi gorsel", async ({ page }) => {
  await openWorkItemCatalog(page);
  await page.getByRole("button", { name: "+ Kalem Ekle" }).click();
  const row = page.locator('main [data-testid^="wik-edit-new-"]');
  await row.getByRole("button", { name: "Kaydet" }).click();
  await expect(row).toContainText("Tarif zorunlu");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("is-kalemi-katalogu-satir-hatasi.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 5) ÜS-10 · görüntüleyici (contracts = view) — salt okunur şerit, "Kalem Ekle"/"Düzenle" YOK
// ---------------------------------------------------------------------------
test("is kalemi katalogu salt okunur gorsel", async ({ page }) => {
  await withContractsLevel(page, "view");
  await openWorkItemCatalog(page);
  await expect(page.getByRole("note")).toContainText("Görüntüleyici · yalnız okuma");
  await expect(page.getByRole("button", { name: "+ Kalem Ekle" })).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("is-kalemi-katalogu-salt-okunur.png", { fullPage: true });
});
