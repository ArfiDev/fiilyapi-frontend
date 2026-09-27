import { expect, test, type Page } from "@playwright/test";

import { login } from "./earned-value-helpers";
import { prepareFrame } from "./visual-scroll";

// PLN-F3.6b · `Günlük İlerleme Raporu` (GİR) görsel kadrajları.
// Kanonik mockup: `projedesign/Planlama - Günlük İlerleme Raporu.dc.html`.
// Ekran: `components/earned-value/reports/daily/**` (DailyReportScreen +
// DailyPrintView + DailyApproveModal), şantiye ikizi `SiteDailyReportView`.
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER (5. kapı `--grep-invert`
// ile BAŞLIĞA göre süzer).
//
// 📅 SAAT ÇAKILIDIR (`login()` → `FIXED_NOW = 2026-09-24T06:00:00Z`,
// NAVİGASYONDAN ÖNCE): `daily-url-state.ts::todayIso()` `?tarih=` YOKSA
// bugüne düşer — `product-date-inventory.test.ts` kaydı bu dosyayı BEKLİYORDU
// ("F3.6b'de sabitlenecek"). Diğer tarihler (22.09 onaylı, 25.09 üretilemedi,
// 26.09 onay-etkin) `?tarih=` İLE açılır; saat HER ZAMAN 24.09'da kalır —
// yalnız `?tarih=` varsayılanını etkiler, gelecek-gün soluklaştırma
// (`WeatherStrip`) `day > report_date` karşılaştırmasına bakar, "bugün"e değil.
//
// 🔒 SALT-OKUR: hiçbir kadraj YAZMAZ; onay modalı AÇILIR ama "Onayla ve
// kilitle" TIKLANMAZ (onaylama e2e'si A'nın `planning-reports-flow.spec.ts`
// dosyasında, 27.09 günüyle).
//
// Mock sentinel'leri: `e2e/mock-backend.ts` `EV_DAILY_SCENARIO` — 24.09
// taslak (draft_diary_dates dolu → S10 onay PASİF), 22.09 onaylı, 25.09
// üretilemedi, 26.09 onay-ETKİN (yalnız bu kare için, missing_diary_dates
// dolu → modal uyarı bandı basar). Backend `?scenario=error` sorgu parametresi
// EKRANIN KENDİ URL'sinden GEÇMİYOR (`?tarih=` tek durum alanı) → `page.route`
// ile ARKA UÇ isteğine eklenir (protokol: mock değiştirmekten iyi).

const GIR_URL = "/projeler/p-1/santiyeler/s-1/gunluk-ilerleme-raporu";
const VIEWPORT = { width: 1440, height: 900 } as const;

/** GİR'i açar, saat çakılı `login()` ile (NAVİGASYONDAN ÖNCE saat dondurulur). */
async function openDailyReport(page: Page, date?: string) {
  await page.setViewportSize(VIEWPORT);
  await login(page);
  const url = date === undefined ? GIR_URL : `${GIR_URL}?tarih=${date}`;
  await page.goto(url);
  await expect(page.locator("main").locator(".ev-daily-toolbar")).toBeVisible();
}

// ---------------------------------------------------------------------------
// 1) Taslak + eksik günlük bandı — GİR:87-297 (24.09, varsayılan `?tarih=`
//    YOK). S10: draft_diary_dates dolu → "Onayla ve kilitle" PASİF + neden;
//    eksik günlük bandı "Günlük Kayıt →" bağlantısıyla.
// ---------------------------------------------------------------------------
test("gunluk ilerleme raporu taslak gorsel", async ({ page }) => {
  await openDailyReport(page);

  await expect(page.locator("main").getByText("Taslak", { exact: true })).toBeVisible();
  // F3.6b lider denetimi (madde 15) — tarih biçimi "gg.aa" + "ve" bağlacı (yıl yok, virgül yok).
  await expect(page.locator("main").locator(".ev-daily-missing-band")).toContainText("21.09 ve 23.09 günlükleri gönderilmedi");
  await expect(page.locator("main").locator(".ev-daily-missing-band__link")).toBeVisible();
  const approveButton = page.getByRole("button", { name: "Onayla ve kilitle" });
  await expect(approveButton).toBeDisabled();
  await expect(page.locator("main").locator(".ev-daily-toolbar__gate-reason")).toBeVisible();
  await expect(page.getByText("1 · Disiplin KPI")).toBeVisible();
  await expect(page.getByText("2 · 7 günlük trend · Genel kümülatif")).toBeVisible();
  await expect(page.getByText("3 · Miktar tablosu")).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-ilerleme-raporu-taslak.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 2) Onaylandı (genişletilmiş) — 22.09, "Raporu göster" tıklanır (S30
//    arşiv özetinden tam gövdeye geçiş). Rozet "Onaylandı — Mehmet Kaya, …".
// ---------------------------------------------------------------------------
test("gunluk ilerleme raporu onaylandi gorsel", async ({ page }) => {
  await openDailyReport(page, "2026-09-22");

  await expect(page.locator(".ev-daily-archive-summary")).toBeVisible();
  await page.getByRole("button", { name: "Raporu göster" }).click();
  await expect(page.getByText(/^Onaylandı — Mehmet Kaya, /)).toBeVisible();
  await expect(page.getByText("1 · Disiplin KPI")).toBeVisible();
  await expect(page.getByRole("button", { name: "Onayla ve kilitle" })).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-ilerleme-raporu-onaylandi.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 3) Üretilemedi — 25.09, S11 "günlüğü yok" metni (mockup "üretilemedi"
//    DEĞİL); "Günlük Kayıt'a git" bağlantısı.
// ---------------------------------------------------------------------------
test("gunluk ilerleme raporu uretilemedi gorsel", async ({ page }) => {
  await openDailyReport(page, "2026-09-25");

  await expect(page.getByText("25.09.2026 günlüğü yok — rapor üretilemedi")).toBeVisible();
  await expect(page.getByRole("link", { name: "Günlük Kayıt'a git" })).toBeVisible();
  await expect(page.getByText("1 · Disiplin KPI")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-ilerleme-raporu-uretilemedi.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 4) Arşiv özet (daraltılmış) — 22.09, S30 varsayılan hâl: özet kart +
//    "Raporu göster", tam gövde basılmaz.
// ---------------------------------------------------------------------------
test("gunluk ilerleme raporu arsiv ozet gorsel", async ({ page }) => {
  await openDailyReport(page, "2026-09-22");

  await expect(page.locator(".ev-daily-archive-summary")).toBeVisible();
  await expect(page.locator(".ev-daily-archive-summary__title")).toContainText("22.09.2026 raporu · arşiv");
  await expect(page.locator(".ev-daily-archive-summary__metrics")).toBeVisible();
  await expect(page.getByRole("button", { name: "Raporu göster" })).toBeVisible();
  await expect(page.getByText("1 · Disiplin KPI")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-ilerleme-raporu-arsiv-ozet.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 5) Yazdırma önizlemesi — 24.09 taslaktan "Yazdırma önizlemesi" segmenti;
//    A4 yatay sayfalar (`PrintSheet` + `paginateByGroup`).
// ---------------------------------------------------------------------------
test("gunluk ilerleme raporu yazdirma onizlemesi gorsel", async ({ page }) => {
  await openDailyReport(page);
  await page.getByRole("button", { name: "Yazdırma önizlemesi" }).click();

  await expect(page.locator(".ev-daily-print")).toBeVisible();
  await expect(page.locator(".ev-daily-report__sheet")).toHaveCount(0);
  await expect(page.getByText(/Sayfa 1 \//)).toBeVisible();

  // F3.6b lider denetimi (2. tur, 28 satır kapasitesi) — `.ev-print-sheet`
  // `overflow:hidden` taşır (`print-sheet.css:13`), yani taşan içerik
  // `fullPage` kadrajda GÖRÜNMEZ CE kırpılır; gerçek sığmayı `scrollHeight`
  // ile ÖLÇMEK gerekir (mockup'taki A4 sayfa 794px yükseklik sınırı).
  const overflow = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".ev-print-sheet")).map((sheet, i) => ({
      page: i + 1,
      clientHeight: sheet.clientHeight,
      scrollHeight: sheet.scrollHeight,
    })),
  );
  for (const sheet of overflow) {
    expect(sheet.scrollHeight, `sayfa ${sheet.page} taşıyor (${sheet.scrollHeight}px > ${sheet.clientHeight}px)`).toBeLessThanOrEqual(
      sheet.clientHeight,
    );
  }

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-ilerleme-raporu-yazdirma.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 6) Onay modalı — 26.09 (lider onayı: yalnız bu kare için, draft_diary_dates
//    boş → onay ETKİN; missing_diary_dates dolu → modal uyarı bandı basar).
//    Eleman kadrajı (tıklama + `fullPage` = bozuk kare, `site-diary` emsali).
// ---------------------------------------------------------------------------
test("gunluk ilerleme raporu onay modali gorsel", async ({ page }) => {
  await openDailyReport(page, "2026-09-26");

  const approveButton = page.getByRole("button", { name: "Onayla ve kilitle" });
  await expect(approveButton).toBeEnabled();
  await approveButton.click();
  const dialog = page.getByRole("dialog", { name: "Raporu onayla ve kilitle" });
  await expect(dialog).toContainText("kilitlenecek.");
  await expect(dialog).toContainText("Devam?");
  await expect(dialog.locator(".ev-daily-approve-modal__warning")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Vazgeç" })).toBeVisible();

  await prepareFrame(page);
  await expect(dialog).toHaveScreenshot("gunluk-ilerleme-raporu-onay-modali.png");
});

// ---------------------------------------------------------------------------
// 7) Hata — backend 500 (`?scenario=error`, ekranın KENDİ URL'si taşımıyor →
//    `page.route` ile arka uç isteğine eklenir).
// ---------------------------------------------------------------------------
test("gunluk ilerleme raporu hata gorsel", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await login(page);
  await page.route("**/reports/daily?**", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("scenario", "error");
    await route.continue({ url: url.toString() });
  });
  await page.goto(GIR_URL);

  await expect(page.getByText("Rapor alınamadı")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tekrar dene" })).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-ilerleme-raporu-hata.png", { fullPage: true });
});
