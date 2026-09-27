import { test, expect, type Page } from "@playwright/test";

import { pinRoster } from "./personnel-roster";
import { prepareFrame } from "./visual-scroll";

// PLN-F2.5b · Puantaj KİLİTLİ GÜN görsel kadrajları — türetilmiş mockup
// `projedesign/Şantiye - Puantaj (Kilitli Gün).dc.html` (M1 kilitli kolon ·
// M2 kilit bandı · M3 salt okunur popover · (c) tamamen kilitli · (e) 409).
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER (5. kapı başlığa göre süzer).
//
// 🔒 VERİ: kilitler EV gün ikizinden gelir (`e2e/mock-backend.ts` →
// `TIMESHEET_LOCK_SCENARIOS` + `evSeedApprovals`, TEK kaynak `evLockState`).
// Haftalar Ekim/Kasım 2026'dadır; Ağustos/Eylül puantaj kareleri
// (`timesheet-visual.spec.ts`) KİLİTSİZ kalır.
//   (a) 2026-W42 · Pzt 12 – Per 15 Eki ← 15.10 raporu
//   (b) 2026-W43 · Pzt 19 ← 19.10 · Sal 20 AÇIK · Çar 21 + Per 22 ← 22.10
//   (c) 2026-W44 · yedi gün ← 01.11 raporu
//   (e) 2026-W45 · Pzt 2 + Sal 3 Kas ← 03.11 raporu — YALNIZ 409 karesi
//
// SALT-OKUR: (a)(b)(c) ve popover karesi hiçbir PUT tetiklemez. (e) karesi
// "Haftayı Kaydet"e basar ama gövde kilitli günü DEĞİŞTİRDİĞİ için ikiz 409
// döner ve kilit 409'u ATOMİKTİR (hiçbir hücre yazılmaz); yine de kendi
// haftasındadır (W45), başka hiçbir kare o haftaya bakmaz.
//
// 📅 SAAT ÇAKILIDIR (`login` içinde, NAVİGASYONDAN ÖNCE): "Bu Hafta" düğmesinin
// pasifliği `currentIsoWeek(new Date())`ten türer (`TimesheetWeekNav.tsx`).
// Damga bütün senaryo haftalarından SONRAdır (2026-W46) — düğme her karede
// açık; hafta `?iso_year=&iso_week=` ile sabitlenir.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir; macOS'ta commit edilmez.

const FIXED_NOW = "2026-11-10T07:00:00Z";
const SITE_PATH = "/projeler/p-1/santiyeler/s-1/puantaj";
const weekUrl = (isoWeek: number) => `${SITE_PATH}?iso_year=2026&iso_week=${isoWeek}`;

/** Bandın sabit ikinci cümlesi (`timesheet-lock.ts` LOCK_BANNER_HINT_*). */
const BANNER_HINT =
  'Bu günlerin hücreleri salt okunur · değişiklik için günlük kaydında "Kilidi aç (yetkili)".';

/**
 * Popover karesinin penceresi — `fullPage` KULLANILMAZ (tıklama + `fullPage`
 * = kabuk kayması, F-PT dersi); pencere sayfayı ve popover'ı taşıyacak kadar
 * uzundur, kare PENCERE karesidir.
 */
const POPOVER_VIEWPORT = { width: 1440, height: 1600 } as const;

async function login(page: Page, viewport: { width: number; height: number } = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport);
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/**
 * Izgara doldu mu — `.first()` ZORUNLU (akış-SSR kopyası, `timesheet-visual`
 * notu). Kilitli haftada saat kutusu olmayabilir; satır sayısı yeter.
 */
async function expectGridLoaded(page: Page) {
  await expect(
    page.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi — Puantaj" }).first(),
  ).toBeVisible();
  await expect(page.locator("main").locator(".ts-week-table").first().locator("tbody tr")).not.toHaveCount(0);
}

function grid(page: Page) {
  return page.locator("main").locator(".ts-week-table").first();
}

/** Kilit bandının metni (ilk cümle kalın + sabit ipucu) — BİREBİR. */
async function expectBanner(page: Page, headline: string) {
  const banner = page.getByRole("status", { name: "Kilitli günler" }).first();
  await expect(banner.locator(".ts-lock-banner__text")).toHaveText(`${headline} ${BANNER_HINT}`);
  await expect(banner.getByRole("link", { name: "Günlük kaydına git" })).toBeVisible();
}

test("puantaj kismen kilitli hafta tek rapor gorsel", async ({ page }) => {
  await login(page);
  await pinRoster(page);
  await page.goto(weekUrl(42));
  const content = page.locator("main");
  await expectGridLoaded(page);

  await expect(content.locator(".ts-week-nav__index").first()).toHaveText("42. Hafta");
  await expectBanner(page, "Pzt 12 – Per 15 Eki 15.10.2026 raporuyla kilitli.");
  // M1 — dört kilitli kolon başlığı + legend'in son öğesi.
  await expect(grid(page).locator(".ts-week-table__day-head--locked")).toHaveCount(4);
  await expect(content.getByText("Kilitli gün (salt okunur)").first()).toBeVisible();
  // Kilitli gün salt okunur tetikleyici, kilitsiz gün saat kutusu.
  await expect(grid(page).getByRole("button", { name: "Mehmet Kılıç · 14 Eki puantajı (kilitli)" })).toBeVisible();
  await expect(grid(page).getByLabel("Mehmet Kılıç · 16 Eki saati")).toBeEditable();
  // Kısmen kilitli hafta kopyalanabilir (kilitli günler ATLANIR, §3.14 P2).
  await expect(page.getByRole("button", { name: "Önceki Haftayı Kopyala" }).first()).toBeEnabled();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("puantaj-kilitli-kismen.png", { fullPage: true });
});

test("puantaj ardisik olmayan iki rapor kilidi gorsel", async ({ page }) => {
  await login(page);
  await pinRoster(page);
  await page.goto(weekUrl(43));
  await expectGridLoaded(page);

  // İki farklı rapor → "rapor onaylarıyla"; ardışık olmayan günler LİSTE.
  await expectBanner(page, "Pzt 19, Çar 21, Per 22 Eki rapor onaylarıyla kilitli.");
  await expect(grid(page).locator(".ts-week-table__day-head--locked")).toHaveCount(3);
  // Sal 20 istisnayla AÇIK: saat kutusu yazılabilir; komşuları kilitli.
  await expect(grid(page).getByLabel("Mehmet Kılıç · 20 Eki saati")).toBeEditable();
  await expect(grid(page).getByRole("button", { name: "Mehmet Kılıç · 19 Eki puantajı (kilitli)" })).toBeVisible();
  await expect(grid(page).getByRole("button", { name: "Mehmet Kılıç · 21 Eki puantajı (kilitli)" })).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("puantaj-kilitli-iki-rapor.png", { fullPage: true });
});

test("puantaj tamamen kilitli hafta gorsel", async ({ page }) => {
  await login(page);
  await pinRoster(page);
  await page.goto(weekUrl(44));
  await expectGridLoaded(page);

  // Ay değişen ardışık aralık: ay adı her iki uçta.
  await expectBanner(page, "Pzt 26 Eki – Paz 1 Kas 01.11.2026 raporuyla kilitli.");
  await expect(grid(page).locator(".ts-week-table__day-head--locked")).toHaveCount(7);
  // Mockup (c): hiçbir saat kutusu yok; kopyalama ve kaydetme PASİF.
  await expect(grid(page).locator("input")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Önceki Haftayı Kopyala" }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Haftayı Kaydet" }).first()).toBeDisabled();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("puantaj-kilitli-tamamen.png", { fullPage: true });
});

test("puantaj kilitli hucre salt okunur popover gorsel", async ({ page }) => {
  await login(page, POPOVER_VIEWPORT);
  await pinRoster(page);
  await page.goto(weekUrl(42));
  await expectGridLoaded(page);

  // M3 — FM tonlu kilitli hücre (Mehmet Kılıç · Çar 14 Eki · 11 sa).
  await grid(page).getByRole("button", { name: "Mehmet Kılıç · 14 Eki puantajı (kilitli)" }).click();
  const popover = page
    .getByRole("dialog", { name: "Mehmet Kılıç · 14 Eki — kilitli puantaj hücresi" })
    .first();
  await expect(popover.locator(".ts-pop__title")).toHaveText("Mehmet Kılıç · Çar 14 Eki");
  await expect(popover.locator(".ts-pop__lock-note")).toHaveText("Bu gün kilitli · 15.10.2026 raporu");
  await expect(popover.getByRole("link", { name: "Günlük kaydına git" })).toBeVisible();
  // Salt okunur: kod rozetleri ve "Saate dön" YOK.
  await expect(popover.locator(".ts-pop__code")).toHaveCount(0);
  await expect(popover.getByRole("button", { name: "Saate dön" })).toHaveCount(0);
  // Pencere karesi popover'ı TAMAMEN taşımalı (kırpılma denetimi).
  const box = await popover.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      position: getComputedStyle(node).position,
      isWithinViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
    };
  });
  expect(box).toEqual({ position: "fixed", isWithinViewport: true });

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("puantaj-kilitli-hucre-popover.png");
});

/**
 * (e) Sayfa BAYATKEN kilit geldi: hafta yanıtının kilidi ilk yüklemede
 * GİZLENİR (yalnız bu sayfanın yanıtı süzülür, ikizin durumu DEĞİŞMEZ), kullanıcı
 * kilitli günü düzenler, "Haftayı Kaydet" → ikiz 409 `{detail, locked_days,
 * day_locks}` döner. PUT'tan sonraki yeniden çekim süzülmez: gerçek kilit gelir.
 */
async function hideLocksUntilSave(page: Page) {
  let hasSaved = false;
  await page.route("**/api/backend/sites/s-1/timesheet/week?*", async (route) => {
    if (route.request().method() !== "GET") {
      hasSaved = true;
      await route.continue();
      return;
    }
    if (hasSaved) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      response,
      json: { ...body, locked_days: [], day_locks: [] },
    });
  });
}

test("puantaj kilit 409 hata bandi gorsel", async ({ page }) => {
  await login(page);
  await pinRoster(page);
  await hideLocksUntilSave(page);
  await page.goto(weekUrl(45));
  const content = page.locator("main");
  await expectGridLoaded(page);
  await expect(page.getByRole("status", { name: "Kilitli günler" })).toHaveCount(0);

  // Sal 3 Kas (sunucuda KİLİTLİ) 9 → 10 · Per 5 Kas (kilitsiz) 9 → 11.
  for (const [day, value] of [["3 Kas", "10"], ["5 Kas", "11"]] as const) {
    const box = grid(page).getByLabel(`Mehmet Kılıç · ${day} saati`);
    await box.fill(value);
    await box.blur();
  }
  await page.getByRole("button", { name: "Haftayı Kaydet" }).first().click();

  const conflict = content.locator(".ts-lock-conflict").first();
  await expect(conflict.locator(".ts-lock-conflict__title")).toHaveText(
    "Bu gün kilitlendi; değişiklik kaydedilmedi.",
  );
  await expect(conflict.locator(".ts-lock-conflict__body")).toHaveText(
    "Sal 3 Kas, siz düzenlerken 03.11.2026 raporuyla kilitlendi (409) · kilitli güne yapılan değişiklik geri alındı; diğer günler kaydedilmeye hazır.",
  );
  // P4: kilitli gün yeniden yüklemeden salt okunur; kilitsiz günün taslağı DURUR.
  await expectBanner(page, "Pzt 2 – Sal 3 Kas 03.11.2026 raporuyla kilitli.");
  await expect(grid(page).getByRole("button", { name: "Mehmet Kılıç · 3 Kas puantajı (kilitli)" })).toBeVisible();
  await expect(grid(page).getByLabel("Mehmet Kılıç · 5 Kas saati")).toHaveValue("11");
  await expect(page.getByRole("button", { name: "Haftayı Kaydet" }).first()).toBeEnabled();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("puantaj-kilitli-409.png", { fullPage: true });
});
