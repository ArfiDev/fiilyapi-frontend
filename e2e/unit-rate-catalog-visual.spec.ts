import { test, expect } from "@playwright/test";

import { VISUAL_VIEWPORT, login, openUnitRateCatalog, withEarnedValueLevel } from "./earned-value-helpers";
import { prepareFrame } from "./visual-scroll";

// PLN-F1.7a · `Planlama - Birim Oran Kataloğu` (KAT) + `… (Disiplin
// Yönetimi)` (M6) görsel kadrajları.
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER (5. kapı `--grep-invert`
// ile BAŞLIĞA göre süzer).
//
// 🔒 SALT-OKUR: hiçbir kadraj "Kaydet"e basıp YAZMAZ. Doğrulama hatası
// istemci tarafıdır (boş form → istek gitmez); modallar açılıp kadraja alınır.
// Paylaşılan mock kataloğu/disiplinleri `fullyParallel` altında oynamaz.
//
// 🔴 B1 GERÇEĞİ: `actual` BOŞ — "Geçmiş gerçekleşen" sütunu "– · veri yok",
// açık satır "Henüz gerçekleşen yok" ve boş dağılım grafiği basar. Mockup'ın
// dolu hâli PLN-B3 (gerçekleşen) gelince ayrı kadrajla ölçülür.
//
// 📅 Saat `login` içinde çakılır (tarih yeri basılmasa da — muafiyet kaydı
// gerekmesin diye kadrajlar SAVUNMALIDIR).
//
// Baseline `.png` YALNIZ Linux CI'da üretilir; macOS'ta commit edilmez.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await login(page);
});

// ---------------------------------------------------------------------------
// 1) KAT:78-231 · ana liste — özet çipleri, araç çubuğu, 16 iş tipi
// ---------------------------------------------------------------------------
test("birim oran katalogu ana liste gorsel", async ({ page }) => {
  await openUnitRateCatalog(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("birim-oran-katalogu-liste.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 2) KAT:178-218 · açık satır — şantiye tablosu + nokta grafiği ("veri yok")
// ---------------------------------------------------------------------------
test("birim oran katalogu acik satir gorsel", async ({ page }) => {
  await openUnitRateCatalog(page);
  await page.getByRole("button", { name: "Beton döküm ayrıntıları" }).click();
  const detail = page.getByRole("region", { name: "Beton döküm gerçekleşen şantiyeler" });
  await expect(detail).toContainText("Henüz gerçekleşen yok");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("birim-oran-katalogu-acik-satir.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 3) KAT:234-296 · "İş Tipi Ekle" modalı — boş form
// ---------------------------------------------------------------------------
test("birim oran katalogu is tipi ekle modali gorsel", async ({ page }) => {
  await openUnitRateCatalog(page);
  await page.getByRole("button", { name: "+ Yeni iş tipi" }).click();
  const dialog = page.getByRole("dialog", { name: "İş Tipi Ekle" });
  await expect(dialog.getByRole("button", { name: "Kaba İnşaat" })).toHaveAttribute("aria-pressed", "true");

  await prepareFrame(page);
  await expect(dialog).toHaveScreenshot("birim-oran-katalogu-is-tipi-ekle.png");
});

// ---------------------------------------------------------------------------
// 4) KAT:241-246 · "İş Tipi Ekle" — doğrulama hatası (ad + oran boş, istek GİTMEZ)
// ---------------------------------------------------------------------------
test("birim oran katalogu is tipi ekle dogrulama hatasi gorsel", async ({ page }) => {
  await openUnitRateCatalog(page);
  await page.getByRole("button", { name: "+ Yeni iş tipi" }).click();
  const dialog = page.getByRole("dialog", { name: "İş Tipi Ekle" });
  await dialog.getByRole("button", { name: "Kaydet" }).click();
  await expect(dialog).toContainText("alan eksik ya da hatalı.");

  await prepareFrame(page);
  await expect(dialog).toHaveScreenshot("birim-oran-katalogu-is-tipi-ekle-hata.png");
});

// ---------------------------------------------------------------------------
// 5) M6:147-221 · "Disiplinler" liste modalı (dört disiplin, Kullanan sütunu)
// ---------------------------------------------------------------------------
test("birim oran katalogu disiplin yonetimi listesi gorsel", async ({ page }) => {
  await openUnitRateCatalog(page);
  await page.getByRole("button", { name: "Disiplinleri yönet" }).click();
  const dialog = page.getByRole("dialog", { name: "Disiplinler" });
  await expect(dialog.getByRole("row")).toHaveCount(5);
  await expect(dialog).toContainText("Mekanik Tesisat");

  await prepareFrame(page);
  await expect(dialog).toHaveScreenshot("birim-oran-katalogu-disiplinler.png");
});

// ---------------------------------------------------------------------------
// 6) M6:224-300 · "Disiplin Ekle" formu (listeden "+ Yeni disiplin")
// ---------------------------------------------------------------------------
test("birim oran katalogu disiplin formu gorsel", async ({ page }) => {
  await openUnitRateCatalog(page);
  await page.getByRole("button", { name: "Disiplinleri yönet" }).click();
  await page.getByRole("dialog", { name: "Disiplinler" }).getByRole("button", { name: "+ Yeni disiplin" }).click();
  const dialog = page.getByRole("dialog", { name: "Disiplin Ekle" });
  await expect(dialog.getByRole("group", { name: "Grafik rengi" })).toBeVisible();

  await prepareFrame(page);
  await expect(dialog).toHaveScreenshot("birim-oran-katalogu-disiplin-formu.png");
});

// ---------------------------------------------------------------------------
// 7) KAT:398 · görüntüleyici (earned_value = view) — salt okunur şerit, ekle YOK
// ---------------------------------------------------------------------------
test("birim oran katalogu salt okunur gorsel", async ({ page }) => {
  await withEarnedValueLevel(page, "view");
  await openUnitRateCatalog(page);
  await expect(page.getByRole("note")).toContainText("Görüntüleyici · yalnız okuma");
  await expect(page.getByRole("button", { name: "+ Yeni iş tipi" })).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("birim-oran-katalogu-salt-okunur.png", { fullPage: true });
});
