import { expect, test, type Page } from "@playwright/test";

import { ACTIVE_SITE_ID, login, openWeeklyQurr } from "./earned-value-helpers";

// YZD-F1 · "Yazdır" çıktısında uygulama kabuğu (yan menü, üst bar, çalışma
// sekmeleri) BASILMAMALI; yalnız içerik. Fonksiyonel (ekran görüntüsü YOK):
// `emulateMedia({ media: "print" })` gerçek yazdırma CSS'ini uygular.

const GIR_URL = "/projeler/p-1/santiyeler/s-1/gunluk-ilerleme-raporu";

async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __printCalls: number }).__printCalls = 0;
    window.print = () => {
      (window as unknown as { __printCalls: number }).__printCalls += 1;
    };
  });
}

const printCalls = (page: Page) => page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls);

async function expectShellHidden(page: Page) {
  await expect(page.locator("aside.sidebar")).toBeHidden();
  await expect(page.locator("header.topbar")).toBeHidden();
  await expect(page.locator(".topbar-tabs")).toBeHidden();
}

test("ekranda kabuk gorunur (regresyon bekcisi)", async ({ page }) => {
  await login(page);
  await expect(page.locator("aside.sidebar")).toBeVisible();
  await expect(page.locator("header.topbar")).toBeVisible();
  await expect(page.locator(".topbar-tabs")).toBeVisible();
  const box = await page.locator("main.app-content").boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(200);
});

test("gunluk rapor yazdirinca kabuk ve ekran kromu basilmaz, yalniz rapor basilir", async ({ page }) => {
  await stubPrint(page);
  await login(page);
  await page.goto(GIR_URL);
  await expect(page.locator("main .ev-daily-toolbar")).toBeVisible();
  await page.getByRole("button", { name: "Yazdır / PDF" }).click();
  await expect.poll(() => printCalls(page)).toBe(1);
  await page.emulateMedia({ media: "print" });

  await expectShellHidden(page);
  await expect(page.locator("main .ev-daily-print")).toBeVisible();
  await expect(page.locator("main .ev-daily-toolbar")).toBeHidden();
  await expect(page.locator("main .ev-daily-page-title")).toBeHidden();
  const box = await page.locator("main").boundingBox();
  expect(box!.x).toBeLessThanOrEqual(1);
});

test("haftalik qurr yazdirinca kabuk basilmaz, qurr yazdirma icerigi gorunur", async ({ page }) => {
  await stubPrint(page);
  await login(page);
  await openWeeklyQurr(page, { siteId: ACTIVE_SITE_ID });
  await page.getByRole("button", { name: "Yazdır / PDF" }).click();
  await expect.poll(() => printCalls(page)).toBe(1);
  await page.emulateMedia({ media: "print" });

  await expectShellHidden(page);
  await expect(page.locator("main .qurr-no-print").first()).toBeHidden();
  await expect(page.locator("main .ev-print-sheet").first()).toBeVisible();
  const box = await page.locator("main").boundingBox();
  expect(box!.x).toBeLessThanOrEqual(1);
});

test("siradan sayfada yazdirinca kabuk gizli, icerik sayfa genisligine yayilir", async ({ page }) => {
  await login(page);
  await page.emulateMedia({ media: "print" });
  await expectShellHidden(page);
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
  const box = await page.locator("main").boundingBox();
  expect(box!.x).toBeLessThanOrEqual(1);
  expect(box!.y).toBeLessThanOrEqual(1);
});
