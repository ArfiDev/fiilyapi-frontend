import { expect, test, type Page } from "@playwright/test";

import { login } from "./earned-value-helpers";
import { prepareFrame } from "./visual-scroll";

// DSC-F3a · Kısıtlı (disiplini atanmış) kullanıcıda fiziksel % etiketi (yalnız 1440×900).
// Backend DSC-B4: kart/hero fiziksel yüzdesi kullanıcının KENDİ disiplinlerinden hesaplanır;
// etiket "Fiziksel (disiplinlerim)" der. İki kare: (i) proje detay şantiye kartları (SiteCard
// KPI etiketi, dar 10px hücre — sarma riski), (ii) bölüm detay hero (büyük harf + harf aralığı).
//
// 🔒 İZOLASYON (restricted-daily-report-visual.spec.ts kanonu): kısıtlılık YALNIZ tarayıcı
// katmanında (`page.route("**/api/auth/me")`) kurulur; paylaşılan sahte backend durumuna
// YAZILMAZ, atamasız kareler (proje-detay.png · bolum-detay.png) değişmez.
//
// ⏱️ Saat NAVİGASYONDAN ÖNCE çakılır (bölüm kadrajında "Kalan Gün" deterministik: section-detail-visual
// ile aynı 2026-08-20); `prepareFrame` `toHaveScreenshot`tan hemen önceki SON çağrıdır.

const VIEWPORT = { width: 1440, height: 900 } as const;
const FIXED_TODAY = new Date("2026-08-20T12:00:00Z");
const KAB = { id: "e7d15000-0000-4000-8000-000000000001", code: "KAB", name: "Kaba İnşaat", color: "#2563eb" };
const RESTRICTED_LABEL = "Fiziksel (disiplinlerim)";

async function restrictToOneDiscipline(page: Page) {
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as Record<string, unknown>;
    await route.fulfill({ response, json: { ...me, all_projects: false, projects: [{ project_id: "p-1", role_key: "patron", discipline_ids: [KAB.id] }] } });
  });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ ...VIEWPORT });
  await restrictToOneDiscipline(page);
  await login(page);
  await page.clock.setFixedTime(FIXED_TODAY);
});

test("kisitli proje detay santiye kartlari fiziksel etiket gorsel", async ({ page }) => {
  await page.goto("/projeler/p-1");
  await expect(page.getByRole("heading", { level: 1, name: "Kule A" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A-Blok Şantiyesi", level: 3 })).toBeVisible();
  await expect(page.getByTestId("site-list-grid")).toBeVisible();
  await expect(page.getByText("Yükleniyor…")).toHaveCount(0);
  // Her şantiye kartının KPI etiketi kısıtlı metni basar; "İlerleme" etiketi kalmaz.
  const labels = page.locator(".site-card__kpi-label");
  await expect(labels.filter({ hasText: RESTRICTED_LABEL })).toHaveCount(await page.locator(".site-card").count());
  await expect(labels.filter({ hasText: /^İlerleme$/ })).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("kisitli-proje-detay-fiziksel-etiket.png", { fullPage: true });
});

test("kisitli bolum detay hero fiziksel etiket gorsel", async ({ page }) => {
  await page.goto("/projeler/p-1/santiyeler/s-1/bolumler/sec-1");
  await expect(page.getByRole("heading", { level: 1, name: "Kat 6–10 Kaba İnşaat" })).toBeVisible();
  await expect(page.getByTestId("section-hero-kpi-budget")).toContainText("₺");
  await expect(page.getByTestId("section-hero-kpi-progress")).toContainText(RESTRICTED_LABEL);
  await expect(page.getByTestId("section-hero-kpi-days")).toContainText("41");
  await expect(page.getByTestId("section-boq-row")).toHaveCount(3);
  await expect(page.getByTestId("section-workers-row")).toHaveCount(3);
  await expect(page.getByText("Yükleniyor…")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("kisitli-bolum-detay-fiziksel-etiket.png", { fullPage: true });
});
