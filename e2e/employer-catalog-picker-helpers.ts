import { expect, type Page } from "@playwright/test";

// TKL-F2.6 · İşveren sözleşmesi "+ Poz Ekle" artık KATALOG SEÇİCİSİNİ açar; eski tekli form
// seçicinin altbilgisindeki "Katalogda yok mu? Elle poz ekle" köprüsünden açılır. Eski formu
// sınayan spec'ler (fonksiyonel + görsel) köprüyü TEK yerden geçer.
//
// ⚠️ `*.spec.ts` DEĞİLDİR (Playwright bunu test dosyası saymaz).
// ⚠️ `getByRole("alert")` KULLANILMAZ; bekleme durum tabanlıdır.

export const PICKER_DIALOG_NAME = "Katalogdan Poz Ekle";
export const MANUAL_DIALOG_NAME = "İşveren Sözleşmesine Poz Ekle";
export const MANUAL_ADD_LABEL = "Katalogda yok mu? Elle poz ekle";

/**
 * "+ Poz Ekle" → seçici açılır → "Elle poz ekle" köprüsü → eski tekli form. Dönüşte seçici KAPALI,
 * tekli form AÇIK (kare/iddia öncesi iki yüzey de belirli).
 */
export async function openManualItemForm(page: Page) {
  await page.getByTestId("ecd-add-item").click();
  const picker = page.getByRole("dialog", { name: PICKER_DIALOG_NAME });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: MANUAL_ADD_LABEL }).click();
  await expect(picker).toHaveCount(0);
  const dialog = page.getByRole("dialog", { name: MANUAL_DIALOG_NAME });
  await expect(dialog).toBeVisible();
  return dialog;
}
