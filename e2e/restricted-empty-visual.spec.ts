import { expect, test, type Page, type Route } from "@playwright/test";

import { UNIT_RATE_CATALOG_URL, login, openPlanningPanel } from "./earned-value-helpers";
import { prepareFrame } from "./visual-scroll";

// DSC-F1.3 · Kısıtlı (disiplini atanmış) kullanıcının BOŞ liste bildirimi (yalnız 1440×900).
// Kaynak mockup: Ayarlar - Kullanıcı Disiplin Ataması.dc.html · "Yapılan miktarlar · filtre".
//
// 🔒 İZOLASYON: kısıtlılık ve boşluk YALNIZ tarayıcı katmanında (`page.route`)
// kurulur — `/auth/me` yanıtına TEK bir projede TEK `discipline_id` eklenir (ad EV kataloğundan çözülür), ilgili liste
// uçlarının gövdesi boşaltılır. Paylaşılan sahte backend durumuna YAZILMAZ;
// başka spec'lerin kareleri (atamasız davranış) değişmez.
//
// ⏱️ Saat `login()` içinde NAVİGASYONDAN ÖNCE çakılır; her karede `prepareFrame`
// `toHaveScreenshot`tan hemen önceki SON çağrıdır.

const VIEWPORT = { width: 1440, height: 900 } as const;
const KAB = { id: "e7d15000-0000-4000-8000-000000000001", code: "KAB", name: "Kaba İnşaat", color: "#2563eb" };
const NOTICE_TITLE = "Disiplininize ait kayıt yok.";

/** `/auth/me` yanıtına yalnız bu sayfa için TEK disiplin atar. */
async function restrictToOneDiscipline(page: Page) {
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...me, all_projects: false, projects: [{ project_id: "p-1", role_key: "patron", discipline_ids: [KAB.id] }] } });
  });
}

/** Liste ucunun GERÇEK (mock) yanıtını alır, yalnız verilen alanları boşaltır. */
async function emptyFields(page: Page, glob: string, patch: (body: Record<string, unknown>) => Record<string, unknown>) {
  await page.route(glob, async (route: Route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: patch(body) });
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ ...VIEWPORT });
  await restrictToOneDiscipline(page);
  await login(page);
});

test("kisitli bos yapilan miktarlar gorsel", async ({ page }) => {
  await emptyFields(page, "**/api/backend/sites/*/earned-value/reports/daily*", (b) => ({ ...b, quantities: [] }));
  await page.goto("/projeler/p-1/santiyeler/s-1/gunluk-ilerleme-raporu");
  await expect(page.getByText(NOTICE_TITLE)).toBeVisible();
  // IZN-F3.1c: ad katalogtan ASENKRON çözülür — kare adı da basmadan önce beklenir.
  await expect(page.getByTestId("restricted-empty-notice").getByText("Kaba İnşaat").first()).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("kisitli-bos-yapilan-miktarlar.png", { fullPage: true });
});

test("kisitli bos is kalemleri gorsel", async ({ page }) => {
  await emptyFields(page, "**/api/backend/sites/*/boq*", (b) => ({ ...b, groups: [] }));
  await page.goto("/projeler/p-1/santiyeler/s-1/is-kalemleri");
  await expect(page.getByRole("heading", { level: 1, name: "İş Kalemleri (BOQ)" })).toBeVisible();
  await expect(page.getByText(NOTICE_TITLE)).toBeVisible();
  // IZN-F3.1c: ad katalogtan ASENKRON çözülür — kare adı da basmadan önce beklenir.
  await expect(page.getByTestId("restricted-empty-notice").getByText("Kaba İnşaat").first()).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("kisitli-bos-is-kalemleri.png", { fullPage: true });
});

test("kisitli bos planlama paneli gorsel", async ({ page }) => {
  await emptyFields(page, "**/api/backend/sites/*/earned-value/panel*", (b) => ({ ...b, rows: [] }));
  await openPlanningPanel(page, { siteId: "s-1" });
  await expect(page.getByText(NOTICE_TITLE)).toBeVisible();
  // IZN-F3.1c: ad katalogtan ASENKRON çözülür — kare adı da basmadan önce beklenir.
  await expect(page.getByTestId("restricted-empty-notice").getByText("Kaba İnşaat").first()).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("kisitli-bos-planlama-paneli.png", { fullPage: true });
});

test("kisitli bos birim oran katalogu gorsel", async ({ page }) => {
  await page.route("**/api/backend/earned-value/catalog*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await page.goto(UNIT_RATE_CATALOG_URL);
  await expect(page.getByRole("heading", { level: 1, name: "Birim Oran Kataloğu" })).toBeVisible();
  await expect(page.getByText(NOTICE_TITLE)).toBeVisible();
  // IZN-F3.1c: ad katalogtan ASENKRON çözülür — kare adı da basmadan önce beklenir.
  await expect(page.getByTestId("restricted-empty-notice").getByText("Kaba İnşaat").first()).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("kisitli-bos-birim-oran-katalogu.png", { fullPage: true });
});
