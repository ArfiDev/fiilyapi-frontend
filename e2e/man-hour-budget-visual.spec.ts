import { test, expect } from "@playwright/test";

import {
  BUDGET_REV_1_ACTIVE,
  COMPLETED_SITE_ID,
  MAN_HOUR_BUDGET_VIEWPORT,
  login,
  openManHourBudget,
  withEarnedValueLevel,
} from "./earned-value-helpers";
import { prepareFrame } from "./visual-scroll";
import { withSystemAdmin } from "./with-system-admin";

// PLN-F1.7b · `Planlama - Adam-Saat Bütçesi` (BÜT) görsel kadrajları.
// Kanonik mockup: `projedesign/Planlama - Adam-Saat Bütçesi.dc.html`;
// türetilmiş hâller: `… (Ek Formlar).dc.html` (M1 grup→disiplin · M2
// Kendi/Taşeron · M4 Bölümsüz/penceresiz yaprak · M5 taslak sil · M6 engeller).
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER (5. kapı `--grep-invert`
// ile BAŞLIĞA göre süzer).
//
// 🔒 SALT-OKUR: hiçbir kadraj YAZMAZ. Açılır/popover/modal açmak istemci
// durumudur; "Uygula", "Dondur", "Taslağı sil" ONAYI, oran girişi YAPILMAZ.
// Öneri popover'ı oran kutusuna ODAKLA açılır; odak kutudan çıkmadığı için
// `onBlur` kaydı hiç tetiklenmez (değişmemiş oran zaten `none` döner). Paylaşılan
// s-1 durumu `fullyParallel` altında başka kadrajları oynatamaz.
//
// 📅 SAAT ÇAKILIDIR (`login` içinde, NAVİGASYONDAN ÖNCE): Gantt'ın ve S-eğrisinin
// "bugün" çizgisi `localTodayIso()` = `new Date()`ten türer (24.09.2026).
//
// ⚠️ CEO kararı (n) "DURAĞAN ipucu" — ÖLÇÜLDÜ, ÜRÜNDE YOK: S-eğrisi ve
// histogram ipuçları (`ChartTooltip`) YALNIZ fare hareketinde basılır
// (`onMouseMove`/`onMouseLeave`, `PreviewCharts.tsx`). Durağan olan tek iz
// S-eğrisindeki bugün çizgisi + noktasıdır; tepe hafta için durağan işaret YOK.
// `prepareFrame` imleci pencerenin köşesine PARK ettiği için (kanon, bekçili)
// fareyle açılan ipucu kareye GİREMEZ — kadraj bu yüzden ipuçsuz alınır.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir; macOS'ta commit edilmez.

test.beforeEach(async ({ page }) => {
  // Açılır yüzeyler `fixed` — gerekçe `MAN_HOUR_BUDGET_VIEWPORT` yorumunda.
  await page.setViewportSize({ ...MAN_HOUR_BUDGET_VIEWPORT });
  await login(page);
});

// ---------------------------------------------------------------------------
// 1) BÜT:600-760 + Ek M1/M4 · Adım 1 taslak — Disiplinsiz grup, Bölümsüz
//    yaprak, boş oranlı yaprak ve "Penceresi çıkmıyor" alt satırı
// ---------------------------------------------------------------------------
test("adam saat butcesi adim 1 taslak gorsel", async ({ page }) => {
  await openManHourBudget(page);
  await expect(page.getByText("Penceresi çıkmıyor")).toBeVisible();
  await expect(page.getByText("Dondurma engeli · 1 grup")).toBeVisible();
  await expect(page.getByText("Oran girilmedi").first()).toBeVisible();
  // Ek M4 — Bölümsüz kalan yaprağın pencere ezmesi alt metni.
  await expect(page.getByText("kalan · pencere 10.08–15.12")).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("adam-saat-butcesi-oranlar.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 2) Ek M1 · grup → disiplin seçici açık (iki kolon: ad · varsayılan yapan)
// ---------------------------------------------------------------------------
test("adam saat butcesi grup disiplin secici gorsel", async ({ page }) => {
  await openManHourBudget(page);
  await page.getByRole("button", { name: "Su yalıtımı disiplini: Seçilmedi" }).click();
  const menu = page.getByRole("dialog", { name: "Su yalıtımı için disiplin seç" });
  await expect(menu.getByRole("button", { name: /Mekanik Tesisat/ })).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("adam-saat-butcesi-disiplin-secici.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 3) BÜT:640-660 · öneri popover'ı — oran hücresi ODAKTA (katalog + geçmiş)
// ---------------------------------------------------------------------------
test("adam saat butcesi oneri popoveri gorsel", async ({ page }) => {
  await openManHourBudget(page);
  await page.getByLabel("Beton döküm · Temel birim oran").focus();
  const popover = page.getByRole("dialog", { name: "Beton döküm · Temel öneri" });
  // `GET …/items/{id}/suggestions` indi: bağlı katalog kalemi 1,80.
  await expect(popover).toContainText("1,80");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("adam-saat-butcesi-oneri.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 4) Ek M2 · L3 iş tipi Kendi/Taşeron seçici açık
// ---------------------------------------------------------------------------
test("adam saat butcesi kendi taseron secici gorsel", async ({ page }) => {
  await openManHourBudget(page);
  await page.getByRole("button", { name: "Beton döküm Kendi/Taşeron: Kendi" }).click();
  const menu = page.getByRole("dialog", { name: "Beton döküm Kendi/Taşeron" });
  await expect(menu.getByRole("button", { name: /Taşeron/ })).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("adam-saat-butcesi-kendi-taseron.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 5) BÜT:560-590 · revizyon açılır listesi (taslak · aktif · arşiv)
// ---------------------------------------------------------------------------
test("adam saat butcesi revizyon listesi gorsel", async ({ page }) => {
  await openManHourBudget(page);
  await page.locator(".ev-budget-rev__button").click();
  const menu = page.getByRole("dialog", { name: "Revizyon seç" });
  await expect(menu.getByRole("button")).toHaveCount(3);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("adam-saat-butcesi-revizyon-listesi.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 6) K22 · revizyon farkı paneli açık (sarı zeminli satırlar, +/− renkleri)
// ---------------------------------------------------------------------------
test("adam saat butcesi revizyon farki gorsel", async ({ page }) => {
  await openManHourBudget(page);
  // `Toggle` yerel kutuyu görsel olarak gizler; etiketin metnine tıklanır.
  await page.getByText("Revizyon farkını göster").click();
  await expect(page.getByRole("switch", { name: "Revizyon farkını göster" })).toBeChecked();
  const panel = page.locator(".ev-budget-diff");
  await expect(panel).toBeVisible();
  // `GET …/revisions/{id}/diff` — beş satır (Rev 1 → Rev 2).
  await expect(panel.locator("tbody tr")).toHaveCount(5);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("adam-saat-butcesi-revizyon-farki.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 7) BÜT Adım 2 · Gantt (bugün çizgisi, ezilmiş pencere, bölüm dışına taşan
//    MEK × Temel) + pencere popover'ı açık (F0-4 uyarı satırı)
// ---------------------------------------------------------------------------
test("adam saat butcesi adim 2 gantt pencere popoveri gorsel", async ({ page }) => {
  await openManHourBudget(page, { step: 2 });
  await page.getByRole("button", { name: "Mekanik Tesisat penceresi 15.06.26–20.07.26 — düzenle" }).click();
  const popover = page.getByRole("dialog", { name: "Mekanik Tesisat · Temel penceresi" });
  await expect(popover.getByRole("note")).toContainText("Pencere bölüm tarihinin dışına taşıyor");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("adam-saat-butcesi-gantt.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 8) BÜT Adım 3 · önizleme — S-eğrisi + haftalık işçi histogramı (ipuçsuz;
//    bkz. dosya başı "DURAĞAN ipucu" notu)
// ---------------------------------------------------------------------------
test("adam saat butcesi adim 3 onizleme gorsel", async ({ page }) => {
  await openManHourBudget(page, { step: 3 });
  await expect(page.getByRole("region", { name: "Disiplin toplamları" })).toContainText("Toplam doğrudan");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("adam-saat-butcesi-onizleme.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 9) Ek M6 · Adım 4 engel listesi — "Baseline'ı Dondur" PASİF
// ---------------------------------------------------------------------------
test("adam saat butcesi adim 4 engeller gorsel", async ({ page }) => {
  await openManHourBudget(page, { step: 4 });
  await expect(page.getByRole("region", { name: "Dondurma engelleri" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Baseline'ı Dondur" })).toBeDisabled();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("adam-saat-butcesi-engeller.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 10) Ek M5 · taslak sil onay modalı (dondur onayı engel yüzünden AÇILMAZ).
//     Modal açılır, ONAYLANMAZ.
// ---------------------------------------------------------------------------
test("adam saat butcesi taslak sil modali gorsel", async ({ page }) => {
  await withSystemAdmin(page); // IZN-F6d: "Taslağı sil" `need: "sa"` — mock patron SA değil.
  await openManHourBudget(page, { step: 4 });
  await page.getByRole("button", { name: "Taslağı sil" }).click();
  const dialog = page.getByRole("dialog", { name: "Rev 2 taslağı silinsin mi?" });
  await expect(dialog.getByRole("button", { name: "Vazgeç" })).toBeVisible();

  await prepareFrame(page);
  await expect(dialog).toHaveScreenshot("adam-saat-butcesi-taslak-sil.png");
});

// ---------------------------------------------------------------------------
// 11) Rev 1 aktif görüntüleme — salt okunur şerit + "Taslak Rev 2'ye dön"
// ---------------------------------------------------------------------------
test("adam saat butcesi rev 1 aktif salt okunur gorsel", async ({ page }) => {
  await openManHourBudget(page, { revisionId: BUDGET_REV_1_ACTIVE });
  await expect(page.getByRole("note")).toContainText("Rev 1 dondurulmuş.");
  await expect(page.getByRole("button", { name: /Taslak Rev 2.* dön/ })).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("adam-saat-butcesi-rev1-aktif.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 12) Görüntüleyici (`earned_value = view`) — taslak salt okunur
// ---------------------------------------------------------------------------
test("adam saat butcesi goruntuleyici gorsel", async ({ page }) => {
  await withEarnedValueLevel(page, "view");
  await openManHourBudget(page);
  await expect(page.getByRole("note")).toContainText("Görüntüleyici · yalnız okuma");
  await expect(page.getByLabel("Beton döküm · Temel birim oran")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("adam-saat-butcesi-goruntuleyici.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 13) Tamamlanmış B-Blok (s-2) — salt okunur (PLN-F1.6.2: şantiye durumundan;
//     backend `editable` taslakta true dönse bile yazma 409'dur)
// ---------------------------------------------------------------------------
test("adam saat butcesi tamamlanmis santiye gorsel", async ({ page }) => {
  await openManHourBudget(page, { siteId: COMPLETED_SITE_ID });
  await expect(page.getByRole("note")).toContainText("Tamamlanmış şantiye · bütçe salt okunur.");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("adam-saat-butcesi-tamamlanmis.png", { fullPage: true });
});
