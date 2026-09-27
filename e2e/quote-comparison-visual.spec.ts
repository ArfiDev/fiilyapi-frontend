import { test, expect } from "@playwright/test";

import { login, pinPurchasingFixtures } from "./purchasing-visual-helpers";
import { prepareFrame } from "./visual-scroll";

// F-SA T5a · TEK (`/satinalma/talepler/{id}/teklifler`) Teklif Karşılaştırması
// — mockup `Satınalma - Teklifler.dc.html`.
//
// SALT-OKUR: kadraj `pr-1`in ÜÇ tohum teklifini render eder; hiçbir teklif
// girilmez, hiçbir sipariş verilmez. Yazma zinciri (`purchasing-flows.spec.ts`)
// KENDİ talebini açar ve `pr-1`e HİÇ DOKUNMAZ → `fullyParallel` altında yarış
// yoktur. (Bir teklif `pr-1`e eklenseydi kart sayısı ve "en iyi fiyat" rozeti
// oynardı.)
//
// 📅 TARİH BAĞIMSIZ: ekranda bugüne bağlı hiçbir türev yoktur — "Talep Tarihi"
// sunucunun `request_date`i, "Teslimat" teklifin SERBEST METNİ, toplamlar ve
// "EN İYİ FİYAT" rozeti SUNUCU türevidir. `page.clock` gerekmez.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

const QUOTES_URL = "/satinalma/talepler/pr-1/teklifler";

test("teklif karsilastirma gorsel", async ({ page }) => {
  await pinPurchasingFixtures(page);
  await login(page);

  await page.goto(QUOTES_URL);
  await expect(
    page.getByRole("heading", { level: 1, name: "Teklif Karşılaştırması" }),
  ).toBeVisible();

  // YERLEŞİM OTURDU (WORKFLOW §4, 1. parça):
  // (a) talep DETAYI geldi — özet şeridi malzemeyi ve miktarı basıyor
  //     (liste satırı kalem taşımaz; şerit ayrı uçtan beslenir).
  await expect(page.getByTestId("tek-request-strip")).toContainText("Nervürlü Demir Ø12");
  await expect(page.getByTestId("tek-strip-quantity")).toHaveText("12 Ton");
  await expect(page.getByTestId("tek-priority")).toHaveText("Acil");
  // (b) üç teklif kartı da geldi.
  for (const quoteId of ["q-1", "q-2", "q-3"]) {
    await expect(page.getByTestId(`tek-card-${quoteId}`)).toBeVisible();
  }
  // (c) "EN İYİ FİYAT" rozeti SUNUCUDAN geldi ve TOPLAM maliyete bakıyor:
  //     birim fiyatı en düşük teklif (`q-2`) nakliyesi hariç olduğu için
  //     rozeti ALMAZ — rozet tek karttadır.
  await expect(page.getByTestId("tek-best-q-1")).toBeVisible();
  await expect(page.locator("main .tek-card__badge--best")).toHaveCount(1);
  await expect(page.getByTestId("tek-shipping-q-2")).toContainText("Hariç");
  // (d) karşılaştırma özeti hesaplandı ("—" yer tutucusu değil).
  await expect(page.getByTestId("tek-summary-lowest")).not.toHaveText("—");
  await expect(page.getByTestId("tek-summary-difference")).not.toHaveText("—");

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("teklif-karsilastirma.png", { fullPage: true });
});
