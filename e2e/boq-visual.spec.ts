import { test, expect } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// Ekran 13 · İş Kalemleri (BOQ) görsel testi (F11, spec §11.2). mock-backend.ts'in
// BOQ_FIXTURE'ı mockup satır 106–178'i birebir yansıtır: 3 grup / 6 kalem /
// GENEL TOPLAM 12.399.900.
//
// Mock oturumda (`ME`) `permissions` alanı YOKTUR → bilinmezlik kuralı (spec
// §2.5.3) gereği yazma yüzeyleri GÖRÜNÜR hâlde baseline'a girer: "+ İş Kalemi"
// butonu ve Poz No sütunundaki satır tetikleyicileri kadrajdadır. Backend izin
// alanını yayımladığı gün bu baseline bilerek kayar.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch); macOS'ta koşturulup commit edilmez.
test("is kalemleri (BOQ) ekrani gorsel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();

  await page.goto("/projeler/p-1/santiyeler/s-1/is-kalemleri");
  await expect(page.getByRole("heading", { level: 1, name: "İş Kalemleri (BOQ)" })).toBeVisible();
  // Tablo yüklendi: son grubun son kalemi ve GENEL TOPLAM basılı olmadan
  // ekran görüntüsü alınırsa baseline yükleme durumunu dondurur.
  await expect(page.locator("main").getByText("İç Sıva (Çimento+Alçı)")).toBeVisible();
  await expect(page.locator("main").getByText("12.399.900")).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("is-kalemleri.png", { fullPage: true });
});
