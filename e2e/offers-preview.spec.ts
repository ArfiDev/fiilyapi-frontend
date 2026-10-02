import { test, expect, type Page } from "@playwright/test";

import { SEED_NO, loginForOffers, openItemPicker, openOfferDetail, openOfferPrint } from "./offers-helpers";

// TKL-F3.8 · T13 ONAY KARELERİ — BASELINE DEĞİL, `toHaveScreenshot` YOK (`work-item-picker-preview.spec.ts` emsali).
//
//   OFFER_PREVIEW=/yol/teklif-kareler pnpm exec playwright test e2e/offers-preview.spec.ts
//
// 🔴 CI'DA ATLANIR (`OFFER_PREVIEW` yok → skip): kareler macOS'ta üretilen İNCELEME çıktısıdır; görsel kapıya girmez.
// 🔒 Salt-okur: `/offers*` sahte sunucudan yanıtlanır, paylaşılan mock'a yazma YOK. Saat `login` içinde donuk (24.09.2026).

const OUT_DIR = process.env.OFFER_PREVIEW ?? "";
test.skip(OUT_DIR === "", "OFFER_PREVIEW (çıktı dizini) verilmedi — onay kareleri yalnız elle üretilir");

async function snap(page: Page, name: string, fullPage: boolean): Promise<void> {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png`, fullPage });
}

for (const kind of ["isveren", "ic"] as const) {
  test(`onizleme teklif-pdf-${kind}`, async ({ page }) => {
    await loginForOffers(page);
    await openOfferPrint(page, SEED_NO.sentUnpriced, kind);
    await page.mouse.move(0, 0);
    await snap(page, `teklif-pdf-${kind}`, true);
  });
}

test("onizleme teklif-secici", async ({ page }) => {
  await loginForOffers(page);
  await openOfferDetail(page, SEED_NO.draftItems);
  const picker = await openItemPicker(page);
  await expect(picker.getByTestId("wip-selected")).toHaveText("0");
  await snap(page, "teklif-secici", false);
});

test("onizleme teklif-detay-kalemler", async ({ page }) => {
  await loginForOffers(page);
  await openOfferDetail(page, SEED_NO.draftItems);
  await expect(page.getByTestId("oit-amount").first()).toBeVisible();
  await page.mouse.move(0, 0);
  await snap(page, "teklif-detay-kalemler", true);
});
