import { test, expect, type Page } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// F-SD T6 · "Kayıt Gir" ekranı görsel testi (mockup `Şantiye - Günlük
// Kayıt.dc.html`, GK). `section-detail-visual.spec.ts` deseninin aynısı.
//
// SALT-OKUR: bu dosya hiçbir POST/PATCH/PUT tetiklemez — yalnız fikstürleri
// render eder. Mutasyon yapan tek günlük spec'i (`site-diary.spec.ts`)
// bilerek EYLÜL 2026'da çalışır; burada bakılan TEMMUZ 2026 fikstürleri
// (d-1 gönderilmiş, d-2 taslak) hiçbir spec tarafından değiştirilmez, bu
// yüzden `fullyParallel` altında yarış yoktur (P7 dersi).
//
// ⏱️ SAAT SABİTLEME (zorunlu): ekranın varsayılan günü BUGÜNdür
// (`derive.ts · isoDate(new Date())`) ve sağ paneldeki "Son Kayıtlar" +
// gömülü planlama bloğu o güne göre çekilir. Sabitlenmezse baseline üretildiği
// güne donar ve ertesi gün kırılır. `page.clock.setFixedTime` NAVİGASYONDAN
// ÖNCE kurulur.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch); macOS'ta koşturulup commit edilmez.

/** Temmuz fikstürlerinin ayı; kayıt OLMAYAN gün → "boş form" durumu. */
const JULY_FREE_DAY = "2026-07-20T09:00:00Z";
/** d-2 taslak kaydının günü → "dolu / taslak" durumu. */
const JULY_DRAFT_DAY = "2026-07-16T09:00:00Z";

const SITE_DIARY_URL = "/projeler/p-1/santiyeler/s-1/gunluk-kayit";

async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("gunluk kayit gir ekrani (bos gun) gorsel", async ({ page }) => {
  await page.clock.setFixedTime(new Date(JULY_FREE_DAY));
  await login(page);

  await page.goto(SITE_DIARY_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" })).toBeVisible();
  // Kayıt açılmamış gün (GKS-F1): satırlar kaydı beklemeden iskelet önizlemesinden
  // gelir — kare ÖNİZLEME satırları görününce çekilir (yükleme durumu dondurulmasın).
  // S:0 gizli SSR kopyası riski (React 19 streaming, bkz. streaming-duplicate-guard.spec.ts):
  // locator'lar `main` kapsamına daraltılır, yoksa strict-mode iki öğe bulabilir.
  await expect(page.locator("main").getByLabel("01.001 bugün yapılan miktar", { exact: true })).toBeVisible();
  await expect(page.locator("main").getByText("İş kalemleri yükleniyor…")).toHaveCount(0);
  // Sağ panel GERÇEK veriyle doldu (yükleme durumu dondurulmasın).
  await expect(page.locator("main .diary-recent__list")).toContainText("16 Temmuz");
  // Gömülü planlama bloğu (day-summary) geldi.
  await expect(page.locator("main .diary-plan")).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-kayit-bos.png", { fullPage: true });
});

test("gunluk kayit gir ekrani (dolu taslak) gorsel", async ({ page }) => {
  await page.clock.setFixedTime(new Date(JULY_DRAFT_DAY));
  await login(page);

  await page.goto(SITE_DIARY_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" })).toBeVisible();
  // d-2 (16 Temmuz, taslak): başlık alanları + satır miktarı dolu.
  await expect(page.locator("main .diary__status-row")).toContainText("Taslak");
  await expect(page.locator("main").getByLabel("03.002 bugün yapılan miktar")).toHaveValue("180.000");
  await expect(page.locator("main .diary-lines__total-amount")).toContainText("₺ 26.100");

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-kayit-dolu.png", { fullPage: true });
});
