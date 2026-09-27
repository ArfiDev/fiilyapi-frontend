import { test, expect, type Page } from "@playwright/test";

import {
  DETAIL_SECTION_NAME,
  DETAIL_TABLET_WIDTH,
  PLACE,
  SECTION_DIARY_TAB_HREF,
  SITE_DIARY_HREF,
  crumbItems,
  currentRows,
  expectCoreCards,
  expectNoPlanning,
  kpiLabels,
  linesCard,
  openDiaryDetail,
  openLinks,
  openMissingDiaryDetail,
  otherRows,
} from "./site-diary-detail-helpers";
import { prepareFrame } from "./visual-scroll";

// DET-1.4 · `Şantiye - Günlük Kayıt Detay (Salt Okunur)` görsel kadrajları.
// Kanonik mockup: `projedesign/Şantiye - Günlük Kayıt Detay (Salt Okunur).dc.html`
// (kullanıcı onaylı). Ekran = çekirdek detay (`components/site-diary-detail/**`)
// + planlama adaptörü (`components/earned-value/diary-detail/**`). Rota bölüm
// altındadır: `/projeler/p-1/santiyeler/s-1/bolumler/sec-1/gunluk-kayit/{id}`.
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER (5. kapı başlığa göre süzer).
//
// 🔒 SALT-OKUR: sayfa yalnız GET atar; hiçbir kadraj tıklamaz, açılır/modal
// yoktur → bütün kareler `fullPage`dir. Listeden detaya TIKLAMA akışı
// (davranış) `section-detail-tabs.spec.ts`tedir.
//
// 📅 SAAT ÇAKILIDIR (`openDiaryDetail` → `loginFrozen`, NAVİGASYONDAN ÖNCE).
//
// 🧭 SENARYO ↔ KAYIT (`DETAIL_SCENARIOS`, gerekçeler yardımcıda):
//   (a) gönderildi   → d-1  · 15.07 · başlık sec-1 · planlamasız
//   (b) kilitli      → d-4  · 05.10 · EV'li · 05.10 raporuyla kilitli
//   (c) taslak       → d-6  · 07.10 · EV'li dolu gün
//   (d) satırla bağlı→ d-10 · 12.11 · başlık sec-2, sec-1'e iki satır
//   (e) planlamasız  → d-7  · 08.10 · EV kurulu şantiyede baseline'sız gün
//   (f) bulunamadı   → d-yok
//   (g) tablet 1024  → (c)
// ÖLÇÜLDÜ: GÖNDERİLMİŞ + KİLİTSİZ + EV'li kayıt fikstürde YOK (d-4 · d-9
// gönderilmiş ama ikisi de kilitli; d-9 kilit açma YAZMA hedefidir). Bu yüzden
// (a) Temmuz d-1'dir; d-1 aynı zamanda planlamasız olduğu için (e) AYNI kare
// olmasın diye d-7'ye (EV'nin "kurulu değil" günü) taşındı.
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (F-P6 dersi).
//
// Baseline `.png` YALNIZ Linux CI'da üretilir; macOS'ta commit edilmez.

/** Başlık kartının durum hapları (`GÜNLÜK KAYIT` · durum · kilit · Kural A). */
function pills(page: Page) {
  return page.locator(".diary-detail__pills .diary-detail__pill");
}

function meta(page: Page) {
  return page.getByTestId("diary-detail-meta");
}

function separators(page: Page) {
  return linesCard(page).locator("tr.diary-detail-lines__sep");
}

// ---------------------------------------------------------------------------
// (a) GÖNDERİLDİ — d-1 · başlığı bu bölüm; yeşil hap, "Gönderen", kilitsiz →
//     "Günlük kayıtta aç" VAR; bölümün İLK kaydı → "Önceki" pasif.
// ---------------------------------------------------------------------------
test("gunluk detay gonderildi gorsel", async ({ page }) => {
  await openDiaryDetail(page, "submitted");

  await expect(pills(page)).toHaveText(["GÜNLÜK KAYIT", "Gönderildi"]);
  await expect(page.locator(".diary-detail__pill--submitted")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("15.07.2026 Çarşamba");
  await expect(meta(page)).toHaveText(`${DETAIL_SECTION_NAME} · ${PLACE}`);
  await expect(page.getByTestId("diary-detail-author")).toContainText("Gönderen: Sercan Öztürk");
  await expect(page.getByTestId("diary-detail-lock-band")).toHaveCount(0);
  await expect(openLinks(page)).toHaveCount(1);
  await expect(openLinks(page)).toHaveAttribute("href", SITE_DIARY_HREF);
  // Gezinme bölüm bağlamında: öncesi YOK (pasif sözcük), sonrası sec-1'in 02.10'u (d-9).
  const nav = page.getByRole("navigation", { name: "Günler arası gezinme" });
  await expect(nav.locator(".diary-detail__nav-edge")).toHaveText("Önceki");
  await expect(nav.getByRole("link", { name: "Sonraki kayıt: 02.10.2026" })).toBeVisible();
  await expectCoreCards(page);
  await expectNoPlanning(page);
  // ÖLÇÜLDÜ: Temmuz kayıtlarının satırları BOQ İSKELETİDİR (6 kalem, bölüm
  // taşımaz = Bölümsüz) → başlığı bu bölüm olsa da "Bu bölüm" grubu boştur.
  await expect(separators(page)).toHaveText([
    `Bu bölüm · ${DETAIL_SECTION_NAME} · 0 satır`,
    "Diğer bölümler · aynı gün · 6 satır",
  ]);
  // Kırıntının son parçası kaydın tarihi; "Günlük Kayıt" bölüm SEKMESİNE bağlı.
  await expect(crumbItems(page).last()).toHaveText(/15\.07\.2026$/);
  await expect(
    page.getByTestId("topbar-crumbs").getByRole("link", { name: "Günlük Kayıt", exact: true }),
  ).toHaveAttribute("href", SECTION_DIARY_TAB_HREF);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-detay-gonderildi.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// (b) KİLİTLİ — d-4 · "Kilitli · 05.10.2026 raporu" hapı + TAM GENİŞLİK kilit
//     bandı (başlık kartının hemen altında); "Günlük kayıtta aç" HİÇBİR yerde YOK.
// ---------------------------------------------------------------------------
test("gunluk detay kilitli gorsel", async ({ page }) => {
  await openDiaryDetail(page, "locked");

  await expect(pills(page)).toHaveText(["GÜNLÜK KAYIT", "Gönderildi", "Kilitli · 05.10.2026 raporu"]);
  const band = page.getByTestId("diary-detail-lock-band");
  await expect(band).toHaveText("Bu gün 05.10.2026 raporuyla kilitlendi. Kayıt değiştirilemez.");
  const [bandBox, headBox, linesBox] = await Promise.all([
    band.boundingBox(),
    page.locator(".diary-detail__head").boundingBox(),
    linesCard(page).boundingBox(),
  ]);
  expect(bandBox && headBox && linesBox, "bant · başlık · miktar kartı yerleşimi").toBeTruthy();
  if (bandBox && headBox && linesBox) {
    expect(bandBox.width, "kilit bandı TAM genişlik (başlık kartı kadar)").toBeGreaterThanOrEqual(headBox.width - 2);
    expect(bandBox.y, "bant başlık kartının ALTINDA").toBeGreaterThanOrEqual(headBox.y + headBox.height);
    expect(bandBox.y + bandBox.height, "bant miktar kartından ÖNCE").toBeLessThanOrEqual(linesBox.y);
  }
  // S8 — kilitli günde yazma kapısı YOK (başlık + Saat Dağıtımı ayağı).
  await expect(openLinks(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("05.10.2026 Pazartesi");
  await expect(meta(page)).toHaveText(`${DETAIL_SECTION_NAME} · ${PLACE} · Gün 127 · H23`);
  const nav = page.getByRole("navigation", { name: "Günler arası gezinme" });
  await expect(nav.getByRole("link", { name: "Önceki kayıt: 02.10.2026" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Sonraki kayıt: 06.10.2026" })).toBeVisible();
  // Planlama parçaları kilitli günde de basılır (salt okunur sayfa).
  await expect(kpiLabels(page)).toHaveText(["Miktar satırı", "Bugün kazanılmış", "Bugün PF", "Hakediş katkısı", "İşçi"]);
  await expect(page.getByRole("heading", { level: 2, name: "Saat Dağıtımı · özet" })).toBeVisible();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-detay-kilitli.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// (c) TASLAK — d-6 · amber hap, "Henüz gönderilmedi"; Kural A "Bu bölüm" (2)
//     + "Diğer bölümler" (3, soluk); EV kolonları + KPI + Saat Dağıtımı özeti.
// ---------------------------------------------------------------------------
test("gunluk detay taslak gorsel", async ({ page }) => {
  await openDiaryDetail(page, "draft");
  await expectDraftDay(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-detay-taslak.png", { fullPage: true });
});

/** (c) ve (g)'nin ORTAK iddiaları — tablet aynı günün başka genişliğidir. */
async function expectDraftDay(page: Page) {
  await expect(pills(page)).toHaveText(["GÜNLÜK KAYIT", "Taslak"]);
  await expect(page.locator(".diary-detail__pill--draft")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("07.10.2026 Çarşamba");
  await expect(meta(page)).toHaveText(`${DETAIL_SECTION_NAME} · ${PLACE} · Gün 129 · H23`);
  await expect(page.getByTestId("diary-detail-author")).toContainText("Henüz gönderilmedi");
  await expect(page.getByTestId("diary-detail-lock-band")).toHaveCount(0);
  // Kural A — önce bu bölüm (bi-3 · bi-4 × sec-1), sonra günün diğer bölümleri (bi-2 · bi-5 · bi-6 Bölümsüz).
  await expect(separators(page)).toHaveText([
    `Bu bölüm · ${DETAIL_SECTION_NAME} · 2 satır`,
    "Diğer bölümler · aynı gün · 3 satır",
  ]);
  await expect(currentRows(page)).toHaveCount(2);
  await expect(otherRows(page)).toHaveCount(3);
  await expect(linesCard(page).locator(".diary-detail-lines__subtotal")).toContainText("Ara toplam");
  // Planlama kolonları (Hakediş ₺'den önce) + oransız İç Sıva alt satırı + günün toplamı.
  await expect(linesCard(page).locator("thead th")).toHaveText([
    "Kalem / bölüm",
    "Birim",
    "Bugün",
    "Kümülatif",
    "Planlı",
    "Kalan",
    "Bugün kaz. a-s",
    "PF",
    "Hakediş ₺",
  ]);
  await expect(linesCard(page).locator(".ev-detail-norate")).toHaveCount(1);
  await expect(linesCard(page).locator(".diary-detail-lines__day-total")).toContainText("Günün toplamı (tüm bölümler)");
  // KPI: "Miktar satırı" bu bölüm / günün tümü; planlama kutuları hemen ardında.
  await expect(kpiLabels(page)).toHaveText(["Miktar satırı", "Bugün kazanılmış", "Bugün PF", "Hakediş katkısı", "İşçi"]);
  await expect(page.locator(".diary-detail__kpi-value").first()).toHaveText("2 / 5");
  // Saat Dağıtımı özeti + taslak/kilitsiz → yazma kapıları (başlık + özet ayağı).
  await expect(page.getByRole("heading", { level: 2, name: "Saat Dağıtımı · özet" })).toBeVisible();
  await expect(openLinks(page)).toHaveCount(2);
  await expectCoreCards(page);
}

// ---------------------------------------------------------------------------
// (d) SATIRLA BAĞLI — d-10 · başlığı Zemin Kat (sec-2), bu bölüme (sec-1) iki
//     miktar satırı: "Satırla bağlı" hapı + meta "Başlık bölümü: …"; "Bu bölüm"
//     iki satır, "Diğer bölümler" bir SOLUK satır (sec-2).
// ---------------------------------------------------------------------------
test("gunluk detay satirla bagli gorsel", async ({ page }) => {
  await openDiaryDetail(page, "lineArm");

  await expect(pills(page)).toHaveText(["GÜNLÜK KAYIT", "Gönderildi", "Satırla bağlı"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("12.11.2026 Perşembe");
  await expect(meta(page)).toHaveText(
    `Başlık bölümü: Zemin Kat Kaba İnşaat · bu bölüme (${DETAIL_SECTION_NAME}) 2 miktar satırı · ${PLACE}`,
  );
  await expect(page.locator(".diary-detail__meta-strong")).toHaveText("Zemin Kat Kaba İnşaat");
  await expect(separators(page)).toHaveText([
    `Bu bölüm · ${DETAIL_SECTION_NAME} · 2 satır`,
    "Diğer bölümler · aynı gün · 1 satır",
  ]);
  await expect(currentRows(page)).toHaveCount(2);
  await expect(currentRows(page).locator(".diary-detail-lines__code")).toContainText([
    "Kat 6–10 Kaba İnşaat",
    "Kat 6–10 Kaba İnşaat",
  ]);
  await expect(otherRows(page)).toHaveCount(1);
  await expect(otherRows(page)).toContainText("Zemin Kat Kaba İnşaat");
  await expect(kpiLabels(page)).toHaveText(["Miktar satırı", "Hakediş katkısı", "İşçi"]);
  await expect(page.locator(".diary-detail__kpi-value").first()).toHaveText("2 / 3");
  // Temel Bilgiler "Başlık bölümü" = kaydın başlığı (sec-2), bu bölüm DEĞİL.
  await expect(page.locator("section[aria-labelledby='diary-detail-basic']")).toContainText("Zemin Kat Kaba İnşaat");
  // Gezinme sec-1'in Kural A kümesinde: öncesi d-8 (09.10), sonrası YOK.
  const nav = page.getByRole("navigation", { name: "Günler arası gezinme" });
  await expect(nav.getByRole("link", { name: "Önceki kayıt: 09.10.2026" })).toBeVisible();
  await expect(nav.locator(".diary-detail__nav-edge")).toHaveText("Sonraki");
  await expectNoPlanning(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-detay-satirla-bagli.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// (e) PLANLAMASIZ — d-7 · EV kurulu şantiyede baseline'sız gün
//     (`has_baseline: false`): planlama kolonları/KPI/Saat Dağıtımı YOK,
//     çekirdek kartlar TAM. Başlığı bu bölüm ama satırı yalnız Bölümsüz →
//     "Bu bölüm · 0 satır" boş gövdesi + "Diğer bölümler" bir satır.
// ---------------------------------------------------------------------------
test("gunluk detay planlamasiz gorsel", async ({ page }) => {
  await openDiaryDetail(page, "unplanned");

  await expect(pills(page)).toHaveText(["GÜNLÜK KAYIT", "Taslak"]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("08.10.2026 Perşembe");
  await expect(meta(page)).toHaveText(`${DETAIL_SECTION_NAME} · ${PLACE}`);
  await expectNoPlanning(page);
  await expectCoreCards(page);
  await expect(separators(page)).toHaveText([
    `Bu bölüm · ${DETAIL_SECTION_NAME} · 0 satır`,
    "Diğer bölümler · aynı gün · 1 satır",
  ]);
  await expect(linesCard(page).getByText("Bu gün miktar satırı girilmemiş")).toBeVisible();
  await expect(otherRows(page)).toHaveCount(1);
  await expect(otherRows(page)).toContainText("Bölümsüz");
  await expect(page.locator(".diary-detail__kpi-value").first()).toHaveText("0 / 1");
  // Taslak + kilitsiz → yalnız başlıktaki yazma kapısı (özet ayağı yok: Saat Dağıtımı yok).
  await expect(openLinks(page)).toHaveCount(1);
  await expect(page.locator("section[aria-labelledby='diary-detail-workers']")).toContainText("Bu gün işçi kaydı yok.");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-detay-planlamasiz.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// (f) BULUNAMADI — var olmayan kimlik: hâl kartı + bölüm sekmesine dönüş;
//     kırıntıda kaydın parçası YOK (son parça "Günlük Kayıt", bağlantı değil).
// ---------------------------------------------------------------------------
test("gunluk detay bulunamadi gorsel", async ({ page }) => {
  await openMissingDiaryDetail(page);

  await expect(page.getByText("Kayıt silinmiş ya da bu şantiyeye ait değil.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Bölümün günlük kayıtlarına dön" })).toHaveAttribute(
    "href",
    SECTION_DIARY_TAB_HREF,
  );
  await expect(page.locator(".diary-detail__head")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  await expect(crumbItems(page).last()).toHaveText(/Günlük Kayıt$/);
  await expect(crumbItems(page).last().locator("a")).toHaveCount(0);
  await expect(crumbItems(page).filter({ hasText: "Kayıt Detayı" })).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-detay-bulunamadi.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// (g) TABLET · 1024 — (c)'nin aynısı; iki sütun TEK sütuna iner, belge yatay
//     TAŞMAZ (geniş miktar tablosu kendi kabında kayar).
// ---------------------------------------------------------------------------
test("gunluk detay tablet 1024 gorsel", async ({ page }) => {
  await openDiaryDetail(page, "draft", { width: DETAIL_TABLET_WIDTH });
  await expectDraftDay(page);

  const layout = await page.evaluate(() => {
    const columns = document.querySelector(".diary-detail__columns");
    const main = columns?.querySelector(".diary-detail__col--main")?.getBoundingClientRect();
    const side = columns?.querySelector(".diary-detail__col--side")?.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      mainBottom: main?.bottom ?? null,
      sideTop: side?.top ?? null,
      mainLeft: main?.left ?? null,
      sideLeft: side?.left ?? null,
    };
  });
  expect(layout.scrollWidth, "belge yatay taşmaz").toBeLessThanOrEqual(DETAIL_TABLET_WIDTH);
  expect(layout.mainBottom !== null && layout.sideTop !== null, "iki sütun ölçüldü").toBe(true);
  expect(layout.sideTop ?? 0, "yan sütun ana sütunun ALTINA iner").toBeGreaterThanOrEqual(layout.mainBottom ?? Infinity);
  expect(layout.sideLeft, "tek sütun: aynı sol kenar").toBe(layout.mainLeft);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-detay-tablet.png", { fullPage: true });
});
