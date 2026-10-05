import { test, expect } from "@playwright/test";

import { VISUAL_VIEWPORT, login, openApprovalRoles } from "./onay-rolleri-helpers";
import { prepareFrame } from "./visual-scroll";

// F-OKROL · `Ayarlar > Onay Eşiği` görsel kadrajları (IZN-B3b: tablo karesi KALKTI).
// Kanonik mockup: `projedesign/Ayarlar - Onay Rolleri.dc.html`.
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER (5. kapı `--grep-invert`
// ile BAŞLIĞA göre süzer).
//
// 🔴 NEDEN `fullPage` DEĞİL, ELEMAN KADRAJI: Ayarlar kenar çubuğu ZATEN dokuz
// `settings-visual` karesinde basılıdır; bu ekranın kendi yüzeyi tek eşik
// kartıdır. `onay-rolleri-api.spec.ts` yalnız REDDEDİLEN gövde dener (durum
// değişmez) → eleman kadrajı yapısal olarak yarışsızdır.
//
// 🔒 SALT-OKUR: bu dosya hiçbir mutasyon tetiklemez.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir; macOS'ta commit edilmez.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await login(page);
});

// ---------------------------------------------------------------------------
// 1) :136-176 · Eşik kartı — kilit rozeti, "YALNIZ YÖNETİCİ" bandı, akış şeridi
// ---------------------------------------------------------------------------
test("ayarlar onay rolleri esik karti gorsel", async ({ page }) => {
  await openApprovalRoles(page);
  const card = page.locator(".okr-card--threshold");
  await expect(card).toBeVisible();

  await prepareFrame(page);
  await expect(card).toHaveScreenshot("ayarlar-onay-rolleri-esik.png");
});
