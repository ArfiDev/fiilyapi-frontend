import { test, expect, type Page } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// F-PL T4 · Şantiye Planlama görsel testi (mockup `Şantiye - Planlama.dc.html`,
// P). `site-diary-visual.spec.ts` / `site-detail-visual.spec.ts` deseninin aynısı.
//
// SALT-OKUR: bu dosya hiçbir PUT tetiklemez — yalnız fikstürleri render eder.
// Planlamayı MUTASYONA uğratan tek spec (`site-planning.spec.ts`) bilerek
// s-2'de çalışır; buradaki kadrajlar s-1'e bakar ve s-1'in planını hiçbir spec
// değiştirmez, bu yüzden `fullyParallel` altında yarış yoktur (P7 dersi).
//
// 📅 TARİH BAĞIMSIZLIĞI: ekranın varsayılan haftası İÇİNDE BULUNULAN haftadır;
// kadrajlar bu yüzden AÇIK `?week=` ile kurulur. `page.clock` gerekmez —
// parametre verildiğinde ekranda tarihe bağlı başka bir türev kalmaz.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

/** Mock fikstürlerinin haftası — `mock-backend.ts` ile aynı sabit. */
const FIXTURE_WEEK = "2026-08-03";
const PLANNING_URL = `/projeler/p-1/santiyeler/s-1/gunluk-kayit/planlama?week=${FIXTURE_WEEK}`;

async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/**
 * Izgara gerçekten doldu mu — yükleme durumu dondurulmasın.
 *
 * ⚠️ `.first()` ZORUNLU: akış-SSR (streamed SSR) sırasında sunucudan gelen ve
 * hidrasyonla eklenen KOPYA kısa bir an yan yana durur, `.plan-week-nav__label`
 * iki elemana çözülür ve strict-mode ihlali verir. Yalnız Linux CI'da patladı
 * (run 30997344422), macOS'ta hiç görülmedi — F-SD'nin `getByRole("alert")`
 * tuzağıyla aynı sınıf. Planlama ekranındaki locator'lar HER ZAMAN karta
 * kapsamlanır ve/veya `.first()` alır.
 */
async function expectGridLoaded(page: Page) {
  const content = page.locator("main");
  await expect(
    content.locator(".plan-card--grid .plan-week-nav__label").first(),
  ).toHaveText("3 – 9 Ağustos 2026");
  await expect(content.locator(".plan-card--grid").first().locator(".plan-grid__row")).not.toHaveCount(
    0,
  );
}

test("planlama izgarasi (dolu) gorsel", async ({ page }) => {
  await login(page);
  await page.goto(PLANNING_URL);
  const content = page.locator("main");
  await expect(
    page.getByRole("heading", { level: 1, name: "Planlama — A-Blok Şantiyesi" }),
  ).toBeVisible();
  await expectGridLoaded(page);

  // Fikstür altı renk etiketinin HEPSİNİ kullanır — kadraj çip paletinin
  // tamamını taşır (blue/green/yellow/purple/gray/red).
  for (const tag of ["blue", "green", "yellow", "purple", "gray", "red"]) {
    await expect(content.locator(`.plan-cell__chip--${tag}`).first(), tag).toBeVisible();
  }
  // Alt sıra: pending Malzeme Planı kartı + dört hedef.
  // ⚠️ Metin locator'ı da akış-SSR çift kopyasına AÇIKTIR (sınıf locator'ları
  // gibi) — `.first()` olmadan strict-mode ihlali verir. Yalnız Linux CI'da.
  await expect(
    content.getByText("Haftalık malzeme ihtiyacı hesaplanmıyor", { exact: false }).first(),
  ).toBeVisible();
  // Kapsamsız `.plan-goals__row` sayımı akış-SSR çift kopyasında İKİYE KATLANIR
  // (bkz. expectGridLoaded notu) — kart kapsamı + `.first()` zorunludur.
  await expect(content.locator(".plan-goals").first().locator(".plan-goals__row")).toHaveCount(4);

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("planlama-izgara.png", { fullPage: true });
});

test("planlama izgarasi (bos) gorsel", async ({ page }) => {
  // BOŞ DURUM KAYNAĞI: plan satırları ŞANTİYE kapsamlıdır, dolayısıyla "satırsız
  // hafta" ancak satırsız bir şantiyeyle üretilebilir. Mock'a üçüncü bir şantiye
  // EKLENMEZ — proje/şantiye listesi baseline'ları ona metinle bağlı. Bunun
  // yerine tek bir GET yanıtı kadraja özel olarak boşaltılır: paylaşılan mock
  // durumu HİÇ değişmez, dolayısıyla başka spec'lerle yarış da yoktur.
  await page.route(
    (url) => url.pathname === "/api/backend/sites/s-1/plan",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          site_id: "s-1",
          site_name: "A-Blok Şantiyesi",
          project_id: "p-1",
          project_name: "Kule A",
          week_start: FIXTURE_WEEK,
          week_end: "2026-08-09",
          days: [
            { plan_date: "2026-08-03", is_weekend: false },
            { plan_date: "2026-08-04", is_weekend: false },
            { plan_date: "2026-08-05", is_weekend: false },
            { plan_date: "2026-08-06", is_weekend: false },
            { plan_date: "2026-08-07", is_weekend: false },
            { plan_date: "2026-08-08", is_weekend: true },
            { plan_date: "2026-08-09", is_weekend: true },
          ],
          groups: [],
          goals: [],
          active_sprint: null,
        }),
      });
    },
  );

  await login(page);
  await page.goto(PLANNING_URL);
  const content = page.locator("main");
  // Boş-durum metinleri de akış-SSR'da İKİ kopyaya çözülür → `.first()` şart
  // (baseline turu 31312395932'de fiilen patladı, macOS'ta hiç görülmedi).
  await expect(content.getByText("Bu hafta için plan satırı eklenmemiş.").first()).toBeVisible();
  await expect(content.getByText("Bu hafta için hedef girilmemiş.").first()).toBeVisible();
  // Sprint yokken "Aktif Sprint:" etiketi HİÇ basılmaz.
  await expect(content.locator(".plan-week-nav__sprint")).toHaveCount(0);

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("planlama-bos.png", { fullPage: true });
});

test("planlama hucre popover'i gorsel", async ({ page }) => {
  await login(page);
  await page.goto(PLANNING_URL);
  await expectGridLoaded(page);

  // DOLU hücre seçilir: kadraj hem metin girişini hem de SEÇİLİ rengin
  // (mavi) basılı durumunu taşır.
  await page.getByRole("button", { name: "Kalıpçı Ekibi (14) · Pzt 3 Ağu planı" }).click();
  const popover = page.getByRole("dialog", { name: /hücre düzenleme$/ });
  await expect(popover.getByLabel("Plan metni")).toHaveValue("6. kat kalıp kurulumu");
  await expect(popover.locator(".plan-pop__tag")).toHaveCount(6);
  await expect(popover.getByRole("button", { name: "Temizle" })).toBeVisible();

  await expect(popover).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `toHaveScreenshot`tan
  // hemen önceki SON çağrı — WORKFLOW §4 GÖRSEL SPEC KURALI (F-PT2 T1
  // düzeltmesi: `prepareFrame` ile `toHaveScreenshot` arasına iddia/`evaluate`
  // GİRMEZ). Kaydırma sıfırlamasına asıl İHTİYAÇ duyan kadraj budur —
  // dosyadaki tek tıklayan test.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("planlama-hucre-popover.png", { fullPage: true });
});

test("planlama haftalik hedefler karti gorsel", async ({ page }) => {
  await login(page);
  await page.goto(PLANNING_URL);
  const content = page.locator("main");
  await expectGridLoaded(page);

  // Kart kadrajı: dört `PlanGoalStatus` rozetinin HEPSİ tek ekrandadır.
  const goalsCard = content.locator("section[aria-labelledby='plan-goals-title']").first();
  await expect(goalsCard.locator(".plan-goals__row")).toHaveCount(4);
  for (const status of ["completed", "in_progress", "waiting", "service_pending"]) {
    await expect(goalsCard.locator(`.plan-goals__status--${status}`), status).toBeVisible();
  }

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(goalsCard).toHaveScreenshot("planlama-hedefler.png");
});
