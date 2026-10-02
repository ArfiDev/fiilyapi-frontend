import { test, expect } from "@playwright/test";

import { OFFERS_URL, SEED_NO, loginForOffers, openItemPicker, openOfferDetail, openOfferPrint } from "./offers-helpers";
import { prepareFrame } from "./visual-scroll";

// TKL-F3.8 · Teklif Hazırlama görsel kadrajları (plan §1: TL/TY/TD mockup'ları + PDF onay kareleri).
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER (5. kapı `--grep-invert` ile BAŞLIĞA göre süzer).
// 🔒 SALT-OKUR: `/offers*` TÜMÜ `offers-fake-server.ts` ile sayfaya özel durumdan yanıtlanır; hiçbir kadraj
//    paylaşılan mock'a yazmaz. "Teklifi oluştur" yalnız BOŞ formla (istemci doğrulaması, istek gitmez) basılır.
// 📅 Saat `loginForOffers` → `login` içinde NAVİGASYONDAN ÖNCE çakılır (24.09.2026): "süresi geçti" ve
//    geçerlilik bitişi `new Date()`e bağlıdır.
// 🖨️ PDF kareleri `print` medyasında; sayfa kutusu sabit A4 olduğundan kadraj deterministiktir.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir; macOS'ta commit edilmez.

test("teklif liste gorsel", async ({ page }) => {
  await loginForOffers(page);
  await page.goto(OFFERS_URL);
  await expect(page.getByTestId("offers-count")).toContainText("7");
  await expect(page.getByTestId(`offers-row-${SEED_NO.sent}`)).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-liste.png", { fullPage: true });
});

test("teklif liste bos gorsel", async ({ page }) => {
  await loginForOffers(page, { seeded: false });
  await page.goto(OFFERS_URL);
  await expect(page.getByText("Henüz teklif hazırlanmadı")).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-liste-bos.png", { fullPage: true });
});

test("teklif yeni gorsel", async ({ page }) => {
  await loginForOffers(page);
  await page.goto(`${OFFERS_URL}/yeni`);
  await expect(page.getByRole("heading", { level: 1, name: "Yeni Teklif" })).toBeVisible();
  // Ayar ön değerleri geldi (yükleme durumu dondurulmasın).
  await expect(page.getByText(/Teklif ayarı varsayılanı/).first()).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-yeni.png", { fullPage: true });
});

test("teklif yeni hata gorsel", async ({ page }) => {
  await loginForOffers(page);
  await page.goto(`${OFFERS_URL}/yeni`);
  await expect(page.getByText(/Teklif ayarı varsayılanı/).first()).toBeVisible();
  await page.getByRole("button", { name: "Teklifi oluştur ve kalemlere geç →" }).click();
  await expect(page.getByText(/alan eksik\./)).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-yeni-hata.png", { fullPage: true });
});

test("teklif detay taslak gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferDetail(page, SEED_NO.draftEmpty);
  await expect(page.getByRole("button", { name: "Taslak Kaydet" })).toBeVisible();
  await expect(page.getByText("Revizyon yükleniyor")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-detay-taslak.png", { fullPage: true });
});

test("teklif detay eski revizyon gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferDetail(page, SEED_NO.withHistory, "?rev=0");
  await expect(page.getByText(/salt okunur/).first()).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-detay-eski-rev.png", { fullPage: true });
});

test("teklif kaybedildi modal gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferDetail(page, SEED_NO.sent);
  await page.getByRole("button", { name: "Kaybedildi" }).click();
  const modal = page.getByRole("dialog", { name: "Kaybedildi olarak işaretle" });
  await expect(modal).toBeVisible();
  await modal.getByLabel("Kayıp nedeni (isteğe bağlı)").fill("Rakip daha ucuz");
  await modal.getByLabel("Kazanan teklif tutarı (isteğe bağlı, KDV hariç ₺)").fill("1500000");
  await page.mouse.move(0, 0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-kaybedildi-modal.png", { fullPage: true });
});

test("teklif detay kalemler gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferDetail(page, SEED_NO.draftItems);
  await expect(page.getByTestId("oit-amount").first()).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-detay-kalemler.png", { fullPage: true });
});

test("teklif secici gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferDetail(page, SEED_NO.draftItems);
  const picker = await openItemPicker(page);
  await expect(picker.getByTestId("wip-selected")).toHaveText("0");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-secici.png", { fullPage: true });
});

test("teklif pdf isveren gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferPrint(page, SEED_NO.sentUnpriced, "isveren");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-pdf-isveren.png", { fullPage: true });
});

test("teklif pdf ic gorsel", async ({ page }) => {
  await loginForOffers(page);
  await openOfferPrint(page, SEED_NO.sentUnpriced, "ic");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-pdf-ic.png", { fullPage: true });
});
