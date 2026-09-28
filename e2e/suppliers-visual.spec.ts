import { test, expect } from "@playwright/test";

import { login, pinPurchasingFixtures } from "./purchasing-visual-helpers";
import { prepareFrame } from "./visual-scroll";

// F-SA T5a · TED (`/satinalma/tedarikciler`) Tedarikçiler ızgarası — mockup
// `Satınalma - Tedarikçiler.dc.html`.
//
// SALT-OKUR: hiçbir tedarikçi oluşturulmaz.
//
// 🔒 FİKSTÜR SABİTLEME BURADA ŞARTTIR: `GET /suppliers` ucunun proje süzgeci
// YOKTUR, yani yazma e2e'sinin (`purchasing-flows.spec.ts`) doğurduğu tedarikçi
// ızgaraya BEŞİNCİ kart olarak düşer ve baseline'ı sessizce kaydırırdı.
// `pinPurchasingFixtures` kadrajı tohum kartlarına indirger (gövde süzme —
// gerekçesi `purchasing-visual-helpers.ts`te).
//
// 📅 TARİH BAĞIMSIZ: kartta tarih basılmaz; "Bu Yıl Toplam Sipariş" SUNUCU
// türevidir (`orders_total_this_year`). `page.clock` gerekmez.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

const SUPPLIERS_URL = "/satinalma/tedarikciler";

test("tedarikciler izgarasi gorsel", async ({ page }) => {
  await pinPurchasingFixtures(page);
  await login(page);

  await page.goto(SUPPLIERS_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Tedarikçiler" })).toBeVisible();

  // YERLEŞİM OTURDU (WORKFLOW §4, 1. parça):
  // (a) kartlar geldi ("Tedarikçi listesi yükleniyor…" kadraja giremez),
  await expect(page.getByTestId("ted-card-sup-1")).toContainText("Yıldız Hazır Beton A.Ş.");
  // (b) SUNUCU türevi ciro basıldı; siparişsiz tedarikçide "veri yok" değil
  //     SIFIR ve gerekçesi ayrıca yazılır,
  await expect(page.getByTestId("ted-total-sup-1")).toContainText("₺");
  await expect(page.getByTestId("ted-card-sup-4")).toContainText("Bu yıl hiç sipariş verilmedi");
  // (c) pasif tedarikçinin rozeti tonu düşmüş hâlde kadrajda,
  await expect(page.getByTestId("ted-card-sup-4")).toContainText("Pasif");
  // (d) kesikli ekleme kartı ızgaranın sonunda,
  await expect(page.getByTestId("ted-add-card")).toBeVisible();
  // (e) fikstür sabitlemesi İŞLEDİ: yalnız dört tohum kartı kadrajda.
  await expect(page.locator("main .ted-card")).toHaveCount(4);
  await expect(page.getByTestId("ted-truncation-notice")).toHaveCount(0);

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("tedarikciler.png", { fullPage: true });
});
