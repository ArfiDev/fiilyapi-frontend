import { test, expect } from "@playwright/test";

import { login, prepareFrame } from "./contracts-visual-helpers";

// F-P5 T8 · FSO (`/sozlesmeler/taseron/yeni`) görsel testi. Kanon: projedesign
// `Taşeron Sözleşme Oluştur.dc.html`.
//
// Kadraj formun BOŞ (pristine) hâlini basar: beş kartın tamamı, devre-dışı
// belge kutuları ve "İşveren Sözleşmesinden Yükle" butonunun kapalı hâli
// tek karede görünür. Seçici DEĞİŞTİRİLMEZ — `selectOption` da hedefi görünür
// alana kaydırabilir ve `fullPage` kare o ofsette bozulurdu.
//
// ⚠️ Yerleşim oturdu iddiası "seçiciler ÇÖZÜLDÜ" üzerinden kurulur: proje ve
// taşeron `Select`leri veri gelene kadar DEVRE DIŞI çizilir (`ProjectLinkCard`
// · `SubcontractorInfoCard`), yani `toBeEnabled()` yükleme hâlinin baseline'a
// donmasını yapısal olarak engeller.
//
// 🔒 FİKSTÜR İZOLASYONU: bu dosya HİÇBİR kayda dokunmaz — "Sözleşmeyi Oluştur"
// TIKLANMAZ, POST atılmaz (atılsaydı `state.subcontractorContracts` büyür ve
// TL/SZL kareleri kirlenirdi).
//
// Baseline `.png` YALNIZ Linux CI'da üretilir; macOS'ta commit edilmez.

test("taseron sozlesme formu gorsel", async ({ page }) => {
  await login(page);
  await page.goto("/sozlesmeler/taseron/yeni");

  await expect(
    page.getByRole("heading", { level: 1, name: "Yeni Taşeron Sözleşmesi" }),
  ).toBeVisible();
  await expect(page.getByTestId("fso-body")).toBeVisible();
  // Seçiciler çözüldü — "yükleniyor" (devre-dışı) hâli baseline'a girmesin.
  await expect(page.locator("main").getByLabel("Proje", { exact: true })).toBeEnabled();
  await expect(page.locator("main").getByLabel("Taşeron Firma", { exact: true })).toBeEnabled();
  // Proje seçilmeden poz yükleme kapalıdır — kadrajın beklenen başlangıcı.
  await expect(page.getByRole("button", { name: "İşveren Sözleşmesinden Yükle" })).toBeDisabled();
  // Altı belge kutusu + ortak "sürükle" satırı devre-dışı basılır.
  await expect(page.locator("main .pf-doc[aria-disabled='true']")).toHaveCount(7);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("taseron-sozlesme-formu.png", { fullPage: true });
});
