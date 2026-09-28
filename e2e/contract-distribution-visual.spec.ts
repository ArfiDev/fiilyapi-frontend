import { test, expect } from "@playwright/test";

import { login, pinContractDistribution, prepareFrame } from "./contracts-visual-helpers";

// F-P5 T8 · POZ (`/sozlesmeler/isveren/p-1/poz-dagilimi`) görsel testi. Kanon:
// projedesign `İşveren Sözleşme - Poz Dağılımı.dc.html`.
//
// ⚠️ Sayfa `--anim-fade-up` altındadır ve kare FİİLEN animasyonun ortasında
// yakalanabiliyor → kadrajdan önce durum-tabanlı iddia ŞART (WORKFLOW §4).
// Burada iddia ızgaranın GERÇEKTEN dolduğuna bakar: dinamik şantiye kolonları
// + sayaç kutuları + hücre değerleri.
//
// 🔒 FİKSTÜR İZOLASYONU: bu dosya HİÇBİR hücreye yazmaz, "Dağılımı Kaydet"e
// basmaz. Ama KENDİ salt-okurluğu YETMEZ: `contract-distribution.spec.ts`
// `ci-1`/`s-1` kotasını geçici olarak 1.900 yapıp geri alır ve `fullyParallel`
// altında dosya sırası garanti değildir → kadraj kâh 1.800 kâh 1.900 üretirdi.
// `pinContractDistribution` TEK GET yanıtını tohum değerine sabitler (türev
// kalan/özet tutarlar birlikte); paylaşılan mock durumuna DOKUNULMAZ.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir; macOS'ta commit edilmez.

test("poz dagilimi izgarasi gorsel", async ({ page }) => {
  await login(page);
  await pinContractDistribution(page);
  await page.goto("/sozlesmeler/isveren/p-1/poz-dagilimi");

  await expect(page.getByRole("heading", { level: 1, name: "Kule A" })).toBeVisible();
  // Yerleşim oturdu: "Yükleniyor…" dalı geçildi, iki şantiye kolonu çizildi,
  // sayaçlar ve sabitlenen hücre değeri basıldı.
  await expect(page.getByTestId("cdist-site-column")).toHaveCount(2);
  await expect(page.getByTestId("cdist-distributed-count")).toHaveText("4/4");
  await expect(page.locator("main").getByLabel("03.001 · A-Blok Şantiyesi kotası").first()).toHaveValue("1800");
  // Şantiye özet kartları (mockup alt bloğu) da kadrajdadır.
  await expect(page.getByTestId("cdist-summary-card")).toHaveCount(2);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("poz-dagilimi.png", { fullPage: true });
});
