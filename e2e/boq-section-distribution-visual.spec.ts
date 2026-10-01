import { test, expect, type Page } from "@playwright/test";

import {
  maskedSectionDistribution,
  wideSectionDistribution,
} from "@/components/boq-section-distribution/section-distribution.fixture";

import { login, prepareFrame } from "./contracts-visual-helpers";

// BDG-F1.4 · Bölüm Dağılımı (`/projeler/p-1/santiyeler/s-1/is-kalemleri/bolum-dagilimi`)
// görsel kareleri. K1: mockup YOK — ekran sözleşme Poz Dağılımı ile aynı dili
// konuşur; baseline Linux CI'da ilk kez üretilir (kare + yapışkan kolon).
//
// Üç kare:
//   bolum-dagilimi.png               3 bölüm, fullPage, 1440
//   bolum-dagilimi-genis.png         12 bölüm, kap yatay kaydırılmış, tablo kartı
//   bolum-dagilimi-metraj-gizli.png  metraj gizli rol (maskeli yanıt)
//
// 🔒 MOCK'A YAZMA YOK: bu dosya hiçbir hücreye yazmaz, "Kaydet"e basmaz.
// Varyantlar `page.route` ile GET yanıtını değiştirir; ana kare mock-backend'in
// fikstür yanıtını (aynı kaynak) doğrudan okur.
//
// ⚠️ Sayfa `--anim-fade-up` altındadır → kadrajdan önce durum-tabanlı iddia
// ŞART (ızgara GERÇEKTEN doldu mu?). `prepareFrame` `toHaveScreenshot`tan
// HEMEN önceki satırdır (kanon: visual-frame-guard).
//
// ⚠️ Yatay kaydırma kare: `settleScrollTop` tüm kapları sıfırlar; kasıtlı
// `scrollLeft` yalnız `.bdg-scroll` için `preserveScrollLeft` ile korunur
// (izin listesi gerekçesi visual-frame-guard.test.ts'tedir). Kaydırma OTURDU
// beklemesi `prepareFrame`den ÖNCE durum tabanlı (`expect.poll`) yapılır.
//
// Saat: ekranın rota grafiğinde `new Date()` YOK (tarih alanı basılmaz);
// muafiyet kaydı visual-frame-guard.test.ts `KASTEN_DISARIDA`dadır.

const URL = "/projeler/p-1/santiyeler/s-1/is-kalemleri/bolum-dagilimi";
const DISTRIBUTION_API = "**/sites/s-1/boq/section-distribution";
const WIDE_SECTION_COUNT = 12;
const SCROLL_TARGET = 600;

async function replaceGet(page: Page, payload: unknown) {
  await page.route(DISTRIBUTION_API, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    return route.fulfill({ status: 200, contentType: "application/json", json: payload });
  });
}

test("bolum dagilimi gorsel", async ({ page }) => {
  await login(page);
  await page.goto(URL);

  await expect(page.getByRole("heading", { level: 1, name: "A-Blok" })).toBeVisible();
  const main = page.locator("main");
  // Yerleşim oturdu: üç bölüm kolonu, sayaçlar, hücre değeri ve özet kartları.
  await expect(main.getByTestId("bdg-section-column")).toHaveCount(3);
  await expect(main.getByTestId("bdg-distributed-count")).toHaveText("1/4");
  await expect(main.getByLabel("03.001 · Kat 1-5 payı")).toHaveValue("400");
  await expect(main.getByTestId("bdg-summary-card")).toHaveCount(3);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("bolum-dagilimi.png", { fullPage: true });
});

test("bolum dagilimi genis (12 bolum, yatay kaydirilmis) gorsel", async ({ page }) => {
  await login(page);
  await replaceGet(page, wideSectionDistribution(WIDE_SECTION_COUNT));
  await page.goto(URL);

  const main = page.locator("main");
  await expect(main.getByTestId("bdg-section-column")).toHaveCount(WIDE_SECTION_COUNT);
  await expect(main.getByLabel("03.001 · Kat 1 payı")).toHaveValue("100");

  const scroller = main.locator(".bdg-scroll");
  await scroller.evaluate((el, target) => {
    el.scrollLeft = target;
  }, SCROLL_TARGET);
  // Kaydırma OTURDU (yarış: settleScrollTop dersi) — durum tabanlı bekleme.
  await expect.poll(() => scroller.evaluate((el) => Math.round(el.scrollLeft))).toBe(SCROLL_TARGET);

  const tableCard = main.locator("section.ecd-items");
  await prepareFrame(page, { preserveScrollLeft: [".bdg-scroll"] });
  await expect(tableCard).toHaveScreenshot("bolum-dagilimi-genis.png");
});

test("bolum dagilimi metraj gizli gorsel", async ({ page }) => {
  await login(page);
  await replaceGet(page, maskedSectionDistribution());
  await page.goto(URL);

  await expect(page.getByRole("heading", { level: 1, name: "A-Blok" })).toBeVisible();
  const main = page.locator("main");
  // Maskeli yanıt çizildi: gerekçe satırı + kapalı girdiler + "—" rozetleri.
  await expect(main.getByTestId("bdg-write-reason")).toBeVisible();
  await expect(main.getByTestId("bdg-cell-input").first()).toBeDisabled();
  await expect(main.getByTestId("bdg-remaining")).toHaveText(["—", "—", "—", "—"]);
  await expect(main.getByTestId("bdg-summary-card")).toHaveCount(3);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("bolum-dagilimi-metraj-gizli.png", { fullPage: true });
});
