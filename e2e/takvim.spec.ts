import { test, expect } from "@playwright/test";

import {
  expectTimelineLoaded,
  login,
  pinEmptyPortfolio,
  pinTimeline,
  TIMELINE_URL,
} from "./takvim-helpers";

/**
 * F-TKV T7 — Proje Takvimi (Gantt) FONKSİYONEL e2e'si. Tümü SALT-OKUNURDUR:
 * hiçbir test paylaşılan mock state'i değiştirmez.
 *
 * 🔴 NEDEN DOM KANITI ŞART: görsel kapıda eşik override'ı yoktur (varsayılan
 * `threshold: 0.2` → pixelmatch YIQ eşiği 1408.6) ve gri→gri metin geçişleri
 * bu eşiğin ALTINDA kalır. Bir yüzeyin ölüden canlıya geçtiğini kare
 * KANITLAMAZ; kanıt DOM'dan gelir (F-IZN dersi).
 *
 * 🔴 SESSİZ 404 TUZAĞI: `mock-backend.ts`teki `/^\/projects\/([^/]+)$/` deseni
 * "timeline"ı proje kimliği sanıp yutabilir. O durumda ekran BOŞ takvim basar
 * ve naif bir test yeşil geçerdi — bu yüzden ilk test ucun 200 + DOLU gövde
 * döndüğünü doğrudan ölçer.
 */

test("timeline ucu 200 ve DOLU gövde döner — sessiz 404 'boş takvim' olarak yutulmaz", async ({
  page,
}) => {
  await login(page);
  const response = await page.request.get("/api/backend/projects/timeline");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    today: string;
    items: { id: string; sections: unknown[] }[];
  };
  expect(body.today).toBe("2026-07-17");
  expect(body.items.length).toBeGreaterThan(0);
  expect(body.items.some((item) => item.sections.length > 0)).toBe(true);
});

test("gantt ekranı: başlık · barlar · milestone · bugün çizgisi", async ({ page }) => {
  await login(page);
  await pinTimeline(page);
  await page.goto(TIMELINE_URL);
  await expectTimelineLoaded(page);

  // Pencere VERİDEN türer (K8): p-4 Oca 2023'te başlar, p-3 Mar 2027'de biter.
  // Mockup'ın sabit "Oca 25 – Ara 26"sı kullanılsaydı ikisi de kırpılırdı.
  await expect(page.getByTestId("tkv-column")).toHaveCount(51);

  // Sol sütun: dört proje + p-1'in üç bölümü.
  const left = page.getByTestId("tkv-left");
  await expect(left.getByText("Kule A", { exact: true })).toBeVisible();
  await expect(left.getByText("Villa B", { exact: true })).toBeVisible();
  await expect(left.getByText("Kat 6–10 Kaba İnşaat", { exact: true })).toBeVisible();

  // Barlar: dört proje barı + iki tarihli bölüm barı (sec-3 tarihsizdir).
  await expect(page.getByTestId("tkv-project-bar")).toHaveCount(4);
  await expect(page.getByTestId("tkv-section-bar")).toHaveCount(2);

  // Milestone elmasları: sec-1'de iki, sec-2'de bir.
  await expect(page.getByTestId("tkv-milestone")).toHaveCount(3);
  await expect(
    page.getByRole("link", { name: "Kat 8 döşeme tamamlandı kilometre taşı" }),
  ).toBeVisible();

  // Bugün çizgisi SUNUCU damgasından çizilir.
  await expect(page.getByTestId("tkv-today-line")).toHaveCount(1);
  await expect(page.getByTestId("tkv-today-stamp")).toContainText("17 Temmuz 2026");

  // K8 — tarihi eksik satır bar çizmez ama SATIRI ekranda kalır ve İŞARETLENİR.
  await expect(page.getByTestId("tkv-no-bar")).toHaveCount(1);
  await expect(left.getByText("Peyzaj Düzenlemesi (Taslak)", { exact: true })).toBeVisible();
});

test("🔴 K2: barlarda ilerleme yüzdesi BASILMAZ ve bar TEK PARÇADIR", async ({ page }) => {
  await login(page);
  await pinTimeline(page);
  await page.goto(TIMELINE_URL);
  const content = page.locator("main");
  await expectTimelineLoaded(page);

  for (const testId of ["tkv-project-bar", "tkv-section-bar"]) {
    for (const text of await page.getByTestId(testId).allInnerTexts()) {
      expect(text).not.toMatch(/%/);
    }
  }
  // İki parçalı bar (koyu tamamlanan + açık kalan) HİÇ üretilmez: satır başına
  // en fazla BİR bar vardır.
  const bars = await page.getByTestId("tkv-section-bar").count();
  const rows = await content.locator(".tkv__row--section").count();
  expect(rows).toBe(3);
  expect(bars).toBe(2);
  // Gerekçe EKRANDA (title'da değil).
  await expect(page.getByTestId("tkv-notes")).toContainText("İlerleme yüzdesi ölçülmüyor");
});

test("🔴 K5: bar tıklaması PROJEYE gider", async ({ page }) => {
  await login(page);
  await pinTimeline(page);
  await page.goto(TIMELINE_URL);
  await expectTimelineLoaded(page);

  await expect(page.getByTestId("tkv-section-bar").first()).toHaveAttribute(
    "href",
    "/projeler/p-1",
  );
  await expect(page.getByTestId("tkv-project-bar").first()).toHaveAttribute(
    "href",
    "/projeler/p-1",
  );
  // Tıklama PROJE barından yapılır: bölüm barının ortasına milestone elması
  // biniyor (mockup 167-169'da da öyle) ve fare olayını o yakalıyor.
  await page.getByTestId("tkv-project-bar").first().click();
  await expect(page).toHaveURL(/\/projeler\/p-1$/);
});

test("🔴 zoom anahtarı ızgarayı GERÇEKTEN değiştirir (51 ay → 5 yıl)", async ({ page }) => {
  await login(page);
  await pinTimeline(page);
  await page.goto(TIMELINE_URL);
  await expectTimelineLoaded(page);
  await expect(page.getByTestId("tkv-column")).toHaveCount(51);

  await page.getByTestId("tkv-zoom-yearly").click();
  await expect(page).toHaveURL(/gorunum=yillik/);
  await expect(page.getByTestId("tkv-column")).toHaveCount(5);
  await expect(page.getByTestId("tkv-column").first()).toHaveText("2023");
  await expect(page.getByTestId("tkv-column").last()).toHaveText("2027");
  // Eksen aynı kalır: barlar ve bugün çizgisi hâlâ oradadır.
  await expect(page.getByTestId("tkv-today-line")).toHaveCount(1);
  await expect(page.getByTestId("tkv-project-bar")).toHaveCount(4);

  await page.getByTestId("tkv-zoom-monthly").click();
  await expect(page.getByTestId("tkv-column")).toHaveCount(51);
});

test("🔴 K4: Haftalık devre dışıdır ve gerekçesi EKRANA basılır", async ({ page }) => {
  await login(page);
  await pinTimeline(page);
  await page.goto(TIMELINE_URL);
  await expectTimelineLoaded(page);

  await expect(page.getByTestId("tkv-zoom-weekly")).toBeDisabled();
  await expect(page.getByTestId("tkv-notes")).toContainText("Haftalık ızgara çizilmedi");
});

test("🔴 K6: üç sayı gövdeden hesaplanır, Toplam Hakediş PENDING'dir", async ({ page }) => {
  await login(page);
  await pinTimeline(page);
  await page.goto(TIMELINE_URL);
  await expectTimelineLoaded(page);

  const summary = page.getByTestId("tkv-summary");
  // 11.200.000 (p-1) + 9.400.000 (p-4); p-2/p-3 tutarsız → toplamı düşürmez.
  await expect(page.getByTestId("tkv-total-contract")).toHaveText("₺ 20,6M");
  await expect(page.getByTestId("tkv-active-count")).toHaveText("3");
  // Bugünden (17 Tem 2026) sonraki en erken bitiş p-1'in Ara 2026'sıdır.
  await expect(page.getByTestId("tkv-next-delivery")).toHaveText("Ara 2026");
  await expect(page.getByTestId("tkv-total-payment")).toHaveText("—");
  await expect(summary).toContainText("Portföy hakediş toplamı tek uçtan gelmiyor");
});

test("proje satırı katlanır — bölümler gizlenir, ızgara penceresi OYNAMAZ", async ({ page }) => {
  await login(page);
  await pinTimeline(page);
  await page.goto(TIMELINE_URL);
  await expectTimelineLoaded(page);

  await page.getByRole("button", { name: /Kule A/ }).click();
  await expect(page.getByTestId("tkv-section-bar")).toHaveCount(0);
  await expect(page.getByTestId("tkv-project-bar")).toHaveCount(4);
  await expect(page.getByTestId("tkv-range")).toHaveText("Oca 2023 – Mar 2027");
  await expect(page.getByTestId("tkv-column")).toHaveCount(51);
});

test("BOŞ portföyde ızgara kurulmaz, özet şeridi kalır", async ({ page }) => {
  await login(page);
  await pinEmptyPortfolio(page);
  await page.goto(TIMELINE_URL);

  await expect(page.getByTestId("tkv-empty")).toContainText("Portföyde proje yok");
  await expect(page.getByTestId("tkv-column")).toHaveCount(0);
  await expect(page.getByTestId("tkv-active-count")).toHaveText("0");
  await expect(page.getByTestId("tkv-total-contract")).toHaveText("—");
});

test("🔴 K1: /projeler ekranındaki giriş noktası GERÇEK bir bağlantıdır", async ({ page }) => {
  await login(page);
  await pinTimeline(page);
  await page.goto("/projeler");
  const link = page.getByRole("link", { name: "Proje Takvimi" });
  // DOM kanıtı: devre-dışı bir `span` değil, `href` taşıyan bir bağlantı.
  await expect(link).toHaveAttribute("href", "/projeler/takvim");
  await link.click();
  await expect(page).toHaveURL(/\/projeler\/takvim$/);
  await expectTimelineLoaded(page);
});

test("🔴 T5 uçtan uca: bölüm formundaki GANTT KİLİDİ gerçek yığında AÇIK", async ({ page }) => {
  await login(page);
  await page.goto("/projeler/p-1/santiyeler/s-1/bolumler/sec-1/duzenle");
  await expect(page.getByRole("heading", { level: 1, name: "Bölümü Düzenle" })).toBeVisible();
  await expect(page.getByLabel("Bölüm Adı")).toHaveValue("Kat 6–10 Kaba İnşaat");

  // Bağımlılık: ETKİN, değeri kayıttan gelir, seçenekleri aynı şantiyeden.
  const dependency = page.getByLabel("Bağımlılık (Önce Bitmesi Gereken Bölüm)");
  await expect(dependency).toBeEnabled();
  await expect(dependency).toHaveValue("sec-2");
  await expect(dependency.locator("option")).toHaveCount(3); // bağımsız + sec-2 + sec-3

  // Milestone satırı: ETKİN, kayıtlı satır sayısı GÖRÜNÜR (öğeden türer).
  await expect(page.getByLabel("Milestone Ekle")).toBeEnabled();
  await expect(page.getByLabel("Milestone tarihi")).toBeEnabled();
  await expect(page.getByText(/kayıtlı 2 milestone korunur/)).toBeVisible();

  // Gantt onay kutusunun gerekçesi "modül yok" DEMEZ (modül var).
  await expect(
    page.getByText("Bölümler proje takvimine her zaman girer; ayrı bir seçim yoktur"),
  ).toBeVisible();
});
