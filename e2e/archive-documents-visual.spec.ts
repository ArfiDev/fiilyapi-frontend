import { test, expect, type Page } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// F-BC T5 · Ekran 12 · Belge Arşivi (`/belgeler`) görsel testleri — mockup
// `Ekran 12 - Belge Arşivi.dc.html`. `site-planning-visual.spec.ts` /
// `subcontractor-progress-payments-visual.spec.ts` deseninin aynısı.
//
// SALT-OKUR: bu dosya hiçbir POST/PUT/DELETE tetiklemez — yalnız p-1'in PROJE
// DÜZEYİ fikstürlerini render eder. Belge yazan spec'ler (`document-dialogs`,
// `archive-documents`in son testi) bilerek s-2 / p-2'de yürür, bu yüzden
// `fullyParallel` altında baseline yarışı YOKTUR (T3/T4 izolasyon notları).
//
// ⏱️ TARİH SABİTLEME (zorunlu): kart ve "Son Eklenenler" satırları "Bugün" /
// "Dün" etiketi basar; fikstürler TEMMUZ 2026'dadır. `page.clock.setFixedTime`
// NAVİGASYONDAN ÖNCE kurulur (site-documents / site-diary spec'leriyle aynı
// yöntem). Sabitlenmezse baseline her gün kayar.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

const ARCHIVE_URL = "/belgeler";
/** Fikstürlerin "bugünü" (E12 "Bugün" satırı fikstürlerle eşleşir). */
const FIXED_NOW = "2026-07-17T13:00:00Z";
/** Dolu kadrajın kaynağı: Kule A › Hakedişler (proje düzeyi klasör). */
const FILLED_URL = `${ARCHIVE_URL}?proje=p-1&folder=df-p1-2`;

async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/**
 * Ekran GERÇEKTEN doldu mu — yükleme/iskelet hâli baseline'a girmesin
 * (WORKFLOW §4 görsel spec kuralı, 1. parça).
 *
 * ⚠️ `.first()` ZORUNLU: akış-SSR sırasında sunucudan gelen ve hidrasyonla
 * eklenen KOPYA kısa bir an yan yana durur (yalnız Linux CI'da patlar); ayrıca
 * aynı belge hem kart ızgarasında hem "Son Eklenenler" satırında AYNI
 * erişilebilir adı taşır — kapsamsız locator iki elemana çözülür.
 */
async function expectArchiveLoaded(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Hakedişler" })).toBeVisible();
  // Klasör paneli: proje kökü + seçili projenin klasörleri geldi.
  const panel = page.getByRole("navigation", { name: "Belge klasörleri" });
  await expect(panel.getByRole("link", { name: /Sözleşmeler/ }).first()).toBeVisible();
  // Izgara: ilk kart meta satırıyla birlikte basılı (yükleme metni değil).
  await expect(page.getByRole("button", { name: /Hakediş_47_Güneşkent\.pdf/ }).first()).toContainText(
    "1,2 MB · Bugün",
  );
  await expect(page.locator("main").locator(".sdoc-grid").first().locator(".sdoc-card")).not.toHaveCount(0);
  // "Son Eklenenler" listesi de dolu (E12 166-184).
  await expect(
    page.getByRole("list", { name: "Son eklenen belgeler" }).getByRole("listitem"),
  ).not.toHaveCount(0);
}

test("belge arsivi (dolu) gorsel", async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await page.goto(FILLED_URL);
  await expectArchiveLoaded(page);

  // E12 118 — breadcrumb; kadraj başlık şeridini de taşısın.
  // `.first()` — akış-SSR çift kopyası metin locator'larını da ikiye çözer.
  await expect(page.locator("main").getByText("Kule A / Hakedişler").first()).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("belgeler-genel.png", { fullPage: true });
});

test("belge arsivi (bos durum) gorsel", async ({ page }) => {
  // BOŞ DURUM SEÇİMİ: iki aday vardı — (a) proje seçilmemiş kök, (b) belgesiz
  // klasör. (a) SEÇİLDİ çünkü E12'nin KENDİ tasarladığı boş durumudur (ızgara
  // yönlendirme metnini basar, "Son Eklenenler" HİÇ basılmaz, yazma düğmeleri
  // proje yokken çizilmez) ve hiçbir fikstür/route hilesi gerektirmez: sade
  // `/belgeler` navigasyonu. (b) ancak mock'a boş bir klasör EKLEYEREK ya da
  // GET yanıtını kadraja özel boşaltarak kurulabilirdi — ikisi de paylaşılan
  // fikstürlere dokunur ya da gereksiz kurulum taşır.
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await page.goto(ARCHIVE_URL);

  // Yüklendi iddiası: proje kökleri geldi (panel "Projeler yükleniyor…" DEĞİL).
  const panel = page.getByRole("navigation", { name: "Belge klasörleri" });
  await expect(panel.getByRole("link", { name: /Kule A/ }).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Belge Arşivi" })).toBeVisible();
  await expect(
    page.locator("main").getByText("Belgeleri görmek için soldaki panelden bir proje seçin."),
  ).toBeVisible();
  // Proje seçilmeden "Son Eklenenler" bloğu HİÇ basılmaz.
  await expect(page.getByRole("list", { name: "Son eklenen belgeler" })).toHaveCount(0);

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("belgeler-genel-bos.png", { fullPage: true });
});

test("belge yukleme diyalogu gorsel", async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await page.goto(FILLED_URL);
  await expectArchiveLoaded(page);

  // Diyalog dolu ızgaranın ÜSTÜNDE açılır — kadraj örtü (overlay) katmanını da
  // taşısın diye `fullPage` seçildi (eleman kadrajı örtüyü göstermezdi).
  await page.getByRole("button", { name: "↑ Yükle" }).click();
  const dialog = page.getByRole("dialog", { name: "Belge Yükle" });
  await expect(dialog).toBeVisible();
  // Form OTURDU: üç alan da basılı ve hedef klasör AKTİF klasöre önayarlı
  // (spec §6 S1) — dosya seçilmediği için hata satırı yoktur.
  await expect(dialog.getByLabel("Dosya")).toBeVisible();
  await expect(dialog.getByLabel("Klasör")).toHaveValue("df-p1-2");
  await expect(dialog.getByLabel("Açıklama")).toHaveValue("");
  await expect(dialog.locator(".pf-form-error")).toHaveCount(0);

  await expect(dialog).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `toHaveScreenshot`tan
  // hemen önceki SON çağrı — WORKFLOW §4 GÖRSEL SPEC KURALI (F-PT2 T1
  // düzeltmesi: `prepareFrame` ile `toHaveScreenshot` arasına iddia/`evaluate`
  // GİRMEZ). Bu dosyada YALNIZ diyalog kadrajı TIKLAR — kaydırma sıfırlaması
  // asıl burada gerekir; imleç parkı ise üç kadrajda da koşulsuzdur.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("belge-yukle-diyalog.png", { fullPage: true });
});
