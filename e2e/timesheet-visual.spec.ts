import { test, expect, type Page } from "@playwright/test";

import { pinRoster } from "./personnel-roster";
import { prepareFrame } from "./visual-scroll";

// PUAN-SAAT T5 · Puantaj görsel testleri — kanon mockup
// `Ekran 5 - Puantaj.dc.html` (E5, `5f3a944`). ŞP sekmesi AYNI haftalık
// çekirdeği kullanır (ONAYLI SAPMA, bkz. `SiteTimesheetView.tsx`), farkı
// kabuktur: bölüm süzgeci + özet şeridi + Excel + drill kenar çubuğu.
//
// SALT-OKUR: bu dosya hiçbir PUT tetiklemez. Kod popover'ı kadrajı bile YALNIZ
// açar (rozete basmaz), yani paylaşılan fikstür DEĞİŞMEZ ve `fullyParallel`
// altında `timesheet.spec.ts` ile yarışmaz — o dosyanın mutasyonları AYRI
// HAFTADA (2026-W36) yürür, buradaki kadrajlar 2026-W32'ye bakar.
//
// ⚠️ AMA KENDİ SALT-OKURLUĞUMUZ YETMEZ (ilk baseline turunda fiilen yakalandı):
// ızgara satırları `GET /personnel`ten gelir ve o kartoteks GLOBALDİR —
// `personnel-form.spec.ts`in POST ettiği "Zeki Karaca" kadraja SIZDI. Hafta
// ayırmak burada KORUMAZ, çünkü kartoteks döneme bağlı değildir. Çözüm
// `pinRoster`: kadrajlar kartoteksi SABİTLER.
//
// 📅 HAFTA SABİTLEME: ekranların varsayılan haftası İÇİNDE BULUNULAN haftadır.
// Kadrajlar bu yüzden AÇIK `?iso_year=&iso_week=` ile kurulur — aksi hâlde her
// hafta gün sütunları/başlık değişir ve baseline KENDİLİĞİNDEN kırmızıya döner.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

/** Kadraj haftası — mock fikstürlerinin zengin haftası: 3–9 Ağustos 2026. */
const WEEK = "iso_year=2026&iso_week=32";
const SITE_URL = `/projeler/p-1/santiyeler/s-1/puantaj?${WEEK}`;
const GENERAL_URL = `/puantaj?site=s-1&${WEEK}`;

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
 * ⚠️ `.first()` ZORUNLU: akış-SSR sırasında sunucudan gelen ve hidrasyonla
 * eklenen KOPYA kısa bir an yan yana durur; kapsam daraltmadan yapılan
 * `getByText` strict-mode ihlali verir (F-PL T5'te YALNIZ Linux CI'da patladı).
 */
async function expectGridLoaded(page: Page) {
  const content = page.locator("main");
  await expect(content.locator(".ts-week-table").first().locator("tbody tr")).not.toHaveCount(0);
  // Saat kutuları basıldı: hücre şekli gerçekten SAAT (kod rozeti değil).
  await expect(content.locator(".ts-week-table .ts-hin").first()).toBeVisible();
}

test("genel puantaj (E5) haftalik izgara gorsel", async ({ page }) => {
  await login(page);
  await pinRoster(page);
  await page.goto(GENERAL_URL);
  const content = page.locator("main");
  await expect(page.getByRole("heading", { level: 1, name: "Puantaj" }).first()).toBeVisible();
  await expectGridLoaded(page);

  // E5'in KENDİ parçaları kadrajdadır: hafta şeridi, KPI kartları, ay şeridi,
  // meslek/tür/taşeron süzgeçleri ve "Gösterilen N / M" sayacı.
  await expect(content.locator(".ts-week-nav__index").first()).toHaveText("32. Hafta");
  await expect(content.locator(".ts-kpi")).toHaveCount(6);
  await expect(content.locator(".ts-month-week").first()).toBeVisible();
  await expect(content.getByLabel("Meslek").first()).toBeEnabled();
  await expect(content.locator(".ts-shown").first()).toBeVisible();
  // Şantiye seçici çözüldü — "Yükleniyor…" durumu baseline'a girmesin.
  await expect(content.getByLabel("Şantiye").first()).toBeEnabled();
  // 🔴 E5'te Excel YOKTUR (ŞP'de vardır) — kadraj bu ayrımı da kilitler.
  await expect(page.getByRole("button", { name: "Excel" })).toHaveCount(0);

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("puantaj-genel.png", { fullPage: true });
});

test("santiye puantaji (SP) haftalik izgara gorsel", async ({ page }) => {
  await login(page);
  await pinRoster(page);
  await page.goto(SITE_URL);
  const content = page.locator("main");
  await expect(
    page.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi — Puantaj" }).first(),
  ).toBeVisible();
  await expectGridLoaded(page);

  // ŞP'nin KORUNAN farkları kadrajda: bölüm süzgeci, özet şeridi, Tür rozeti,
  // Excel. (Onaylı sapmanın görsel kanıtı: yetenek KALDIRILMADI.)
  await expect(content.getByLabel("Bölüm").first()).toBeEnabled();
  await expect(content.locator(".ts-summary__title").first()).toHaveText("Tüm Bölümler");
  await expect(content.locator(".ts-source").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Excel" }).first()).toBeEnabled();
  // ŞP mockup'ında OLMAYAN satır süzgeçleri UYDURULMAZ.
  await expect(content.getByLabel("Meslek")).toHaveCount(0);

  // Hücre paletinin ÜÇ tonu + iki kod rozeti kadrajda — baseline paleti tam alsın.
  for (const modifier of ["full", "short", "overtime", "off"]) {
    await expect(
      content.locator(`.ts-week-table .ts-hin--${modifier}`).first(),
      modifier,
    ).toBeVisible();
  }
  for (const modifier of ["leave", "temporary-duty"]) {
    await expect(
      content.locator(`.ts-week-table .ts-tag--${modifier}`).first(),
      modifier,
    ).toBeVisible();
  }

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("puantaj-santiye.png", { fullPage: true });
});

test("puantaj hucre kod popover'i gorsel", async ({ page }) => {
  await login(page);
  await pinRoster(page);
  await page.goto(SITE_URL);
  await expectGridLoaded(page);

  // Mockup rozeti ÇİZER ama seçme yolunu çizmez; kod çapası o onaylı
  // türetimdir. DOLU bir kod hücresi seçilir: kadraj hem SEÇİLİ rozetin basılı
  // durumunu hem de üç seçeneği taşır.
  await page
    .locator(".ts-week-table")
    .first()
    .getByRole("button", { name: "Ramazan Yıldız · 4 Ağu puantajı" })
    .click();
  const popover = page
    .getByRole("dialog", { name: "Ramazan Yıldız · 4 Ağu — puantaj hücresi" })
    .first();
  await expect(popover.locator(".ts-pop__code")).toHaveCount(3);
  await expect(popover.locator(".ts-pop__code--active")).toHaveCount(1);
  await expect(popover.getByRole("button", { name: "Saate dön" })).toBeVisible();

  // ⚠️ KIRPILMA DENETİMİ (F-PT T5'te GERÇEK KUSUR çıktı): `.ts-week-scroll`un
  // `overflow-x: auto`su dikey ekseni de `auto`ya çevirdiği için popover kabın
  // İÇİNDE kesiliyordu. `escapeOverflow` ile yüzey `position: fixed`tir;
  // aşağıdaki iddia kırpılmanın geri gelmesini yakalar.
  //
  // ⚠️ WORKFLOW §4 GÖRSEL SPEC KURALI: tüm iddia/`evaluate` çağrıları
  // `prepareFrame`den ÖNCE koşar — arada hiçbir şey olmadan kadraj alınır.
  const geometry = await popover.evaluate((node) => {
    const scroll = node.closest(".ts-week-scroll");
    const box = node.getBoundingClientRect();
    return {
      position: getComputedStyle(node).position,
      isWithinViewport: box.top >= 0 && box.bottom <= window.innerHeight,
      hiddenHeight: scroll === null ? -1 : scroll.scrollHeight - scroll.clientHeight,
    };
  });
  expect(geometry).toEqual({ position: "fixed", isWithinViewport: true, hiddenHeight: 0 });

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("puantaj-hucre-popover.png", { fullPage: true });
});
