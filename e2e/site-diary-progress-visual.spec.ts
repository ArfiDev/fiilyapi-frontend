import { test, expect, type Locator, type Page } from "@playwright/test";

import { TABLET_WIDTH, openDiaryProgress } from "./site-diary-progress-helpers";
import { prepareFrame } from "./visual-scroll";

// PLN-F2.5b · `Şantiye - Günlük Kayıt (İlerleme)` (İ) görsel kadrajları.
// Kanonik mockup: `projedesign/Şantiye - Günlük Kayıt (İlerleme).dc.html`;
// türetilmiş hâller: `… (Ek Formlar).dc.html` ((b) gerekçe/Gönder engelli ·
// (d) kilitli gün · (e) formen). Ekran = çekirdek günlük
// (`components/site-diary/**`) + planlama adaptörü
// (`components/earned-value/diary/**`, tek işaretli dosya `DiaryProgressAdapter`).
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER (5. kapı `--grep-invert`
// ile BAŞLIĞA göre süzer).
//
// 🔒 SALT-OKUR: hiçbir kadraj YAZMAZ. Senaryolar s-1 · EKİM 2026'nın GÖRSEL
// günleridir ((a) 07.10 · (b) 05.10 · (c) 06.10 · (d) 08.10); yazma hedefleri
// (09.10 · 02.10) tipte bile yoktur (`DiaryProgressScenario`). Açılır/modal
// açmak istemci durumudur: iş kodu seçicide yalnız ARAMA yazılır (kutu
// işaretlenmez), kilit açma modalında gerekçe YAZILMAZ ve "Kilidi aç" (pasif)
// BASILMAZ. Paylaşılan ikizin kadraja sızan iki ucu (Son Kayıtlar · taşeron
// listesi) yardımcıda süzülür — gerekçe `pinDiaryFrameSources`.
//
// 📅 SAAT ÇAKILIDIR (`openDiaryProgress` → `loginAtScenarioDay`, NAVİGASYONDAN
// ÖNCE): ekranın günü `isoDate(new Date())`dir; saat senaryo gününe çakılmazsa
// ekran bugünün (kayıtsız) gününü açar.
//
// 📐 PENCERE içeriğe oturtulur (`fitViewportToDiary`): Gönder kontrol çubuğu
// `position: sticky` — 900px pencerede `fullPage` kadrajda Saat Dağıtımı
// kartının üstüne binerdi. Popover ve modal kadrajları `fullPage` DEĞİL, ELEMAN
// kadrajıdır (`adam-saat-butcesi-taslak-sil` emsali): tıklama + `fullPage` =
// bozuk kare.
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (F-P6 dersi).
//
// Baseline `.png` YALNIZ Linux CI'da üretilir; macOS'ta commit edilmez.
//
// 🧭 PLN-F2.5e · CEO KARARLARI (iddialar bu METİNLERE göre yazıldı; UI paralel
// yazıldığı için YENİ yüzeyler rol/metinle seçilir, sınıf adı UYDURULMAZ):
//   · Başlık "… · 07.10.2026 Çarşamba · Gün n · Hn" (gün adı takvimden; gün/
//     hafta no ikizin `days/{day}.day_no/week_no`'su — ölçüldü 2026-09-25).
//   · "YENİ" çipi YOK.
//   · Miktar kartı alt başlığı EV'li günde "İş tipi × bölüm · kazanılmış = …
//     (Rev 1)", EV'siz günde çekirdek metni.
//   · Kilitli gün: TAM GENİŞLİK üst bant + "Kilidi aç (yetkili)"; "Yeniden Aç" YOK.
//   · Kontrol çubuğunda "Gönder" (dolu günde PASİF: dağıtılmamış gerekçesiz).
//   · Tablet (1024): Saat Dağıtımı üst şeridi + alt eylem çubuğu; masaüstünde
//     ikisi de GÖRÜNMEZ.
//   · Kendi/Taşeron etiketi + G9 dolaylı hâl: ikizde bütçe kalemleri günlük
//     BOQ kalemlerine köprülüdür (`EV_S1_BOQ_ITEM_BRIDGE`). Ekran BOQ'un BÜTÜN
//     kalemlerini başlık olarak basar (`buildDiaryLineTree`), yani etiket
//     satırsız kalemde de görünür: 01.002 Geri Dolgu (DOLAYLI) · 02.001 C25/30
//     Beton · 02.002 Demir Donatı "Kendi", 03.001 Tuğla Duvar "Taşeron";
//     01.001 Kazı ve 03.002 İç Sıva köprüsüz (etiket YOK). Dolaylı kalemin
//     Bölümsüz satırı "Tüm şantiye" ve "+ Bölüm" YOK — satırı yalnız (a) 07.10'da.
//     İç Sıva (CEO kararı c) ORANSIZ ve "Bölümsüz", dolaylı DEĞİL.

/** Senaryo gününün başlık kuyruğu (İ:113) — tarih + takvim gün adı + gün/hafta no. */
const HEADER_TAIL = {
  full: "07.10.2026 Çarşamba · Gün 129 · H23",
  locked: "05.10.2026 Pazartesi · Gün 127 · H23",
  blocked: "06.10.2026 Salı · Gün 128 · H23",
} as const;

/** Başlık satırı bu kuyrukla BİTER (`.diary__subtitle`; başı şantiye · proje). */
function endsWithTail(tail: string): RegExp {
  const escaped = tail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`· ${escaped}$`);
}

/** s-1'in adı — ikiz `sites` fikstürü (`id: "s-1"` · `name`). Tablet şeridi "dd.mm · {ad}". */
const SITE_NAME = "A-Blok Şantiyesi";
/** İ:213 — EV'li günde miktar kartı alt başlığının TAMAMI (karar 3). */
const EV_LINES_CAPTION = "İş tipi × bölüm · kazanılmış = bugün miktar × birim oran (Rev 1)";
/** Çekirdek günlüğün miktar kartı alt başlığı (EV'siz gün). */
const CORE_LINES_CAPTION = "Kalem × bölüm · girişler otomatik olarak aylık hakedişe işlenir";

function linesCard(page: Page): Locator {
  // `main`e kapsamlanır: akış-SSR'da `</main>`den SONRA kalan S:0 SSR kopyası
  // aynı `section[aria-labelledby=…]` köküyle strict-mode ihlaline yol açar.
  return page.locator("main").locator("section[aria-labelledby='diary-lines-title']");
}

/** Kalem başlığının kod satırı (`kod · etiket · ₺birim fiyat`) — etiketi taşıyan satırlar. */
function itemMetaWithTag(page: Page, tag: "Kendi" | "Taşeron"): Locator {
  return linesCard(page)
    .locator(".diary-lines__item-meta")
    .filter({ hasText: new RegExp(`(^|· )${tag}( ·|$)`) });
}

/** Görünür "Gönder" düğmesi(leri) — kontrol çubuğundaki ile tablet çubuğundaki aynı ada sahiptir. */
function visibleSendButtons(scope: Page | Locator): Locator {
  return scope.getByRole("button", { name: "Gönder", exact: true }).filter({ visible: true });
}

/**
 * Masaüstü karesinde tablet üst şeridi (`AllocationTabletHead`: "dd.mm · şantiye"
 * + "Dağıtılmamış N a-s" hapı) ve alt eylem çubuğu (`AllocationTabletActions`:
 * "+ İş kodu" · "Kalanı orantılı dağıt" · "Gönder") GÖRÜNMEZ (F2.6 · CEO kararı).
 */
async function expectNoTabletBars(page: Page) {
  const content = page.locator("main");
  await expect(content.locator(".ev-diary-tablet-head__pill")).toBeHidden();
  await expect(content.getByText(new RegExp(`^\\d{2}\\.\\d{2} · ${SITE_NAME}$`)).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "+ İş kodu", exact: true }).filter({ visible: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Saat Dağıtımı eylemleri" })).toBeHidden();
}

// ---------------------------------------------------------------------------
// 1) (a) DOLU gün — İ:109-510 tam ekran: Saat Dağıtımı + şerit (Dağıtılmamış
//    34) + "Puantaj değişti" + miktar tablosu ek kolonları + oransız satır alt
//    uyarısı + İşçi Dağılımı (kendi ekip + iki firma) + Gönder kontrol çubuğu
//    + Kendi/Taşeron etiketi + G9 dolaylı kalem (01.002 "Tüm şantiye", "+ Bölüm" yok)
// ---------------------------------------------------------------------------
test("gunluk ilerleme dolu gun gorsel", async ({ page }) => {
  await openDiaryProgress(page, "full");
  const content = page.locator("main");

  // Başlık (İ:113 · CEO): "… · 07.10.2026 Çarşamba · Gün 129 · H23". "YENİ" çipi YOK.
  await expect(content.locator(".diary__subtitle")).toHaveText(endsWithTail(HEADER_TAIL.full));
  await expect(content.getByText("YENİ", { exact: true })).toHaveCount(0);
  // Kendi/Taşeron etiketi (İ:225) — bütçe köprüsüyle: 01.002 + 02.001 + 02.002 Kendi, 03.001 Taşeron.
  await expect(itemMetaWithTag(page, "Kendi")).toHaveCount(3);
  await expect(itemMetaWithTag(page, "Taşeron")).toHaveCount(1);
  await expect(itemMetaWithTag(page, "Taşeron")).toContainText("03.001");
  // G9 — dolaylı 01.002: Bölümsüz satırı "Tüm şantiye", "+ Bölüm" YOK (doğrudan kalemde VAR).
  await expect(linesCard(page).getByText("Tüm şantiye", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "01.002 için bölüm ekle" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "02.001 için bölüm ekle" })).toBeVisible();
  // CEO (c) — İç Sıva dolaylı DEĞİL: "+ Bölüm" var; Bölümsüz satırları 03.001 + 03.002.
  await expect(page.getByRole("button", { name: "03.002 için bölüm ekle" })).toHaveCount(1);
  await expect(linesCard(page).locator(".diary-lines__leaf-name").filter({ hasText: /^Bölümsüz/ })).toHaveCount(2);

  // Şerit (İ:392-397): 164 a-s kaynak − 130 dağıtılan = 34 dağıtılmamış; taşeron 7×8 + 3×8.
  await expect(content.locator(".ev-diary-strip__item--warn dd")).toHaveText("34");
  await expect(content.locator(".ev-diary-strip__item--sub dd")).toHaveText("80");
  // İ:465 — Mehmet Demir kayıtta 9 sa, puantaj şimdi 11.
  await expect(content.locator(".ev-diary-grid__row--changed")).toHaveCount(1);
  await expect(content.locator(".ev-diary-grid__row--changed")).toContainText("Mehmet Demir");
  await expect(content.locator(".ev-diary-grid__changed")).toContainText("dağılımı gözden geçir");
  // Izgara: 9 kişi + 2 firma; beş iş kodu kolonu.
  await expect(content.locator(".ev-diary-grid__row")).toHaveCount(11);
  await expect(content.locator(".ev-diary-grid__code")).toHaveCount(5);
  // Miktar tablosu ek kolonları (İ:220) + Rev 1 alt başlığı (İ:213) + alt toplam (İ:248).
  await expect(content.getByText("Bugün kaz. a-s")).toBeVisible();
  await expect(linesCard(page).getByText(EV_LINES_CAPTION, { exact: true })).toBeVisible();
  await expect(content.getByText(CORE_LINES_CAPTION)).toHaveCount(0);
  await expect(content.locator(".ev-diary-line-foot__total")).toContainText("Bugün toplam kazanılmış");
  // İ:241-246 — oransız İç Sıva (Bölümsüz) satırının alt uyarısı, TEK satırda.
  await expect(content.locator(".ev-diary-norate")).toHaveCount(1);
  await expect(content.locator(".ev-diary-norate")).toContainText("Bu kaleme oran atanmamış");
  // İşçi Dağılımı (İ:344-372): kendi ekip puantajdan 4 meslek (salt okunur) + iki firma.
  const workers = content.locator("section[aria-labelledby='diary-workers-title']");
  await expect(workers.locator(".diary-workers__count-ro")).toHaveCount(4);
  await expect(workers).toContainText("Kalıpçı");
  await expect(workers).toContainText("Aydın Elektrik Taah.");
  await expect(workers).toContainText("Çelik İnşaat Taah.");
  // Gönder kontrol çubuğu (İ:493-510): saat çipi uyarıda + "gerekçe yaz"; "Gönder"
  // (K15 metni) PASİF — dağıtılmamış saat gerekçesiz.
  const submitBar = page.getByRole("region", { name: "Gönder kontrolü" });
  await expect(submitBar).toContainText("34 a-s dağıtılmamış · gönderim engelli");
  await expect(submitBar.getByRole("button", { name: "gerekçe yaz" })).toBeEnabled();
  await expect(submitBar).toContainText("Dağıtılmamış saat gönderimi engelliyor");
  await expect(visibleSendButtons(submitBar)).toBeDisabled();
  await expect(visibleSendButtons(page), "masaüstünde TEK görünür Gönder (kontrol çubuğu)").toHaveCount(1);
  await expect(page.getByRole("button", { name: "Kaydet & Gönder" })).toBeDisabled();
  // Masaüstü: tablet üst şeridi + alt eylem çubuğu GÖRÜNMEZ.
  await expectNoTabletBars(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-ilerleme-dolu.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 2) (a) İ:404-423 · "+ İş kodu ekle" seçicisi açık — oransız yaprak PASİF
//    "· oran yok" (K12). Liste 280px'te kayar ve `prepareFrame` her kabın
//    kaydırmasını SIFIRLAR; oransız yaprak ağacın SONUNDA olduğu için seçici
//    ARAMAYLA daraltılır ("Sıva" → Duvar & Sıva › İç Sıva › Bölümsüz).
// ---------------------------------------------------------------------------
test("gunluk ilerleme is kodu secici gorsel", async ({ page }) => {
  await openDiaryProgress(page, "full");
  const content = page.locator("main");
  await page.getByRole("button", { name: "+ İş kodu ekle" }).click();
  const picker = page.getByRole("dialog", { name: "İş kodu ekle" });
  await picker.getByLabel("Kalem, bölüm veya kod ara").fill("Sıva");
  await expect(picker.getByRole("checkbox", { name: "Bölümsüz · oran yok" })).toBeDisabled();
  await expect(picker.getByRole("checkbox")).toHaveCount(2);
  await expect(picker).toContainText("5 iş kodu seçili");

  // ✅ ALT PİKSEL KARARSIZLIĞI KAPANDI (F-SUBPX, 2026-09-25). DET-1'de aynı commit'te
  // iki Linux turu bu karede farklıydı (yapışkan kişi sütununda satır sınırı 1 px
  // kayması; pixelmatch eşik üstü 1799 px). Kök neden: ızgara satırları 45,5 px
  // (1.5 satır aralığı mirası + kip düğmesinin UA-font strut'u). Çözüm: bütün ızgara
  // satırları scroller'a göre TAM piksel (`--leading-ev-diary-*`). Kanıt: aynı commit
  // (4d58323) iki tur → bu kare birebir. Tablet karesinde kalan fark yalnız giriş
  // kutusu köşelerinde kenar yumuşatması (114 px, en büyük YIQ delta 0,6 ≪ eşik
  // 1408,6 → Playwright'ta 0 eşik üstü piksel); kaynağı ızgara dışındaki sayfa geneli
  // kesirler (F-SUBPX-2, kuyrukta).
  await prepareFrame(page);
  await expect(content.locator(".ev-diary-alloc")).toHaveScreenshot("gunluk-ilerleme-is-kodu-popover.png");
});

// ---------------------------------------------------------------------------
// 3) (b) KİLİTLİ gün — İ:143-149 kilit bandı (TAM GENİŞLİK üst bant, karar 5)
//    + Ek Formlar (d): bütün alanlar salt okunur, miktarlar düz metin (K20),
//    "Yeniden Aç" YOK
// ---------------------------------------------------------------------------
test("gunluk ilerleme kilitli gun gorsel", async ({ page }) => {
  await openDiaryProgress(page, "locked");
  const content = page.locator("main");

  await expect(content.locator(".diary__subtitle")).toHaveText(endsWithTail(HEADER_TAIL.locked));
  // CEO (karar 5): kilit bandı TAM GENİŞLİK üst bant — başlığın altında, kartlardan
  // önce; çekirdeğin durum satırındaki bandı basılmaz. Metin İ:146 birebir.
  const banner = content.locator(".diary__top-banner .ev-diary-lock");
  await expect(banner).toHaveCount(1);
  await expect(banner).toHaveAttribute("role", "status");
  await expect(banner).toContainText("Bu gün 05.10.2026 raporuyla kilitlendi. Bütün alanlar salt okunur.");
  await expect(banner.getByRole("button", { name: "Kilidi aç (yetkili)" })).toBeVisible();
  await expect(content.locator(".diary__lock-banner")).toHaveCount(0);
  const [bannerBox, headBox, linesBox] = await Promise.all([
    banner.boundingBox(),
    content.locator(".diary__head").boundingBox(),
    linesCard(page).boundingBox(),
  ]);
  expect(bannerBox && headBox && linesBox, "bant · başlık · miktar kartı yerleşimi").toBeTruthy();
  if (bannerBox && headBox && linesBox) {
    expect(bannerBox.width, "kilit bandı TAM genişlik (başlık satırı kadar)").toBeGreaterThanOrEqual(headBox.width - 2);
    expect(bannerBox.y, "bant başlığın ALTINDA").toBeGreaterThanOrEqual(headBox.y + headBox.height);
    expect(bannerBox.y + bannerBox.height, "bant kartlardan ÖNCE").toBeLessThanOrEqual(linesBox.y);
  }
  // Kilitli gün yeniden açılamaz (İ:143-149) — "Yeniden Aç" düğmesi YOK.
  await expect(page.getByRole("button", { name: "Yeniden Aç" })).toHaveCount(0);
  // Kendi/Taşeron etiketi kilitli günde de — BOQ başlıkları satırsız da basılır
  // (01.002 · 02.001 · 02.002 Kendi · 03.001 Taşeron); dolaylı kalemin bu gün
  // satırı YOK → "Tüm şantiye" basılmaz.
  await expect(itemMetaWithTag(page, "Kendi")).toHaveCount(3);
  await expect(itemMetaWithTag(page, "Taşeron")).toHaveCount(1);
  await expect(linesCard(page).getByText("Tüm şantiye", { exact: true })).toHaveCount(0);
  await expect(content.getByText("YENİ", { exact: true })).toHaveCount(0);
  await expectNoTabletBars(page);
  await expect(content.locator(".ev-diary-alloc__ro")).toHaveText("Salt okunur · gün kilitli");
  await expect(page.getByRole("button", { name: "+ İş kodu ekle" })).toBeDisabled();
  // K20 — kilitli günde miktar hücresi kutu değil düz metin.
  await expect(content.locator(".diary-lines__qty")).toHaveCount(0);
  await expect(content.locator(".diary-lines__today-text").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Gönder kontrolü" })).toContainText("Gün kilitli");

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-ilerleme-kilitli.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 4) (b) "Kilidi aç (yetkili)" → gerekçe modalı AÇIK (Patron = `earned_value`
//    admin ≥ approve, K17). Gerekçe YAZILMAZ; "Kilidi aç" pasif kalır.
// ---------------------------------------------------------------------------
test("gunluk ilerleme kilit acma modali gorsel", async ({ page }) => {
  await openDiaryProgress(page, "locked");
  await page.getByRole("button", { name: "Kilidi aç (yetkili)" }).click();
  const dialog = page.getByRole("dialog", { name: "Günün kilidini aç" });
  await expect(dialog).toContainText("05.10.2026 günlüğü ve puantajı yalnız bu gün için açılır.");
  await expect(dialog.getByRole("button", { name: "Kilidi aç", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Vazgeç" })).toBeVisible();

  await prepareFrame(page);
  await expect(dialog).toHaveScreenshot("gunluk-ilerleme-kilit-ac-modal.png");
});

// ---------------------------------------------------------------------------
// 5) (c) GÖNDER ENGELLİ — Ek Formlar (b) deseni: hava eksik + miktar yok
//    (`reason_items` weather_incomplete · no_quantity), saatler dağıtılmış
// ---------------------------------------------------------------------------
test("gunluk ilerleme gonder engelli gorsel", async ({ page }) => {
  await openDiaryProgress(page, "blocked");
  const content = page.locator("main");

  await expect(content.locator(".diary__subtitle")).toHaveText(endsWithTail(HEADER_TAIL.blocked));
  const submitBar = page.getByRole("region", { name: "Gönder kontrolü" });
  await expect(visibleSendButtons(submitBar)).toBeDisabled();
  await expectNoTabletBars(page);
  await expect(submitBar.locator(".ev-diary-check--warn")).toHaveText(["Miktar girilmedi", "Hava eksik"]);
  await expect(submitBar.locator(".ev-diary-check--ok")).toHaveText(["Bütün saatler dağıtıldı"]);
  await expect(submitBar).toContainText("Gönderim engelli");
  await expect(page.getByRole("button", { name: "Kaydet & Gönder" })).toBeDisabled();
  // S4: gerekçeler YALNIZ kontrol çubuğunda — çekirdeğin kutusu basılmaz.
  await expect(content.locator(".diary__gate")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-ilerleme-gonder-engelli.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 6) (a) FORMEN görünümü (`earned_value = view`) — İ:150-155 + Ek Formlar (e)
//    bandı üstte; Saat Dağıtımı soluk (İ:386 `distOp`) ve salt okunur
// ---------------------------------------------------------------------------
test("gunluk ilerleme formen gorunumu gorsel", async ({ page }) => {
  await openDiaryProgress(page, "full", { evLevel: "view" });
  const content = page.locator("main");

  await expect(content.locator(".diary__top-banner")).toContainText("Formen görünümü.");
  await expect(content.locator(".diary__top-banner")).toContainText("Gönderim mühendiste.");
  await expect(content.locator(".ev-diary-alloc--faded")).toBeVisible();
  await expect(content.locator(".ev-diary-alloc__ro")).toHaveText(
    "Salt okunur · Saat Dağıtımı mühendis tarafından yapılır",
  );
  await expect(page.getByRole("button", { name: "+ İş kodu ekle" })).toBeDisabled();
  // Hücre etiketi `${kişi} · ${kolon} saati` (AllocationCell) — ilk kolon üst grup "BETONARME İŞLERİ".
  await expect(content.getByLabel("Mehmet Demir · BETONARME İŞLERİ saati")).toBeDisabled();
  await expect(page.getByRole("region", { name: "Gönder kontrolü" })).toContainText("Gönderim mühendiste");
  await expectNoTabletBars(page);

  // ✅ ALT PİKSEL KARARSIZLIĞI KAPANDI (F-SUBPX, 2026-09-25). DET-1'de aynı commit'te
  // iki Linux turu bu karede farklıydı (yapışkan kişi sütununda satır sınırı 1 px
  // kayması; pixelmatch eşik üstü 1799 px). Kök neden: ızgara satırları 45,5 px
  // (1.5 satır aralığı mirası + kip düğmesinin UA-font strut'u). Çözüm: bütün ızgara
  // satırları scroller'a göre TAM piksel (`--leading-ev-diary-*`). Kanıt: aynı commit
  // (4d58323) iki tur → bu kare birebir. Tablet karesinde kalan fark yalnız giriş
  // kutusu köşelerinde kenar yumuşatması (114 px, en büyük YIQ delta 0,6 ≪ eşik
  // 1408,6 → Playwright'ta 0 eşik üstü piksel); kaynağı ızgara dışındaki sayfa geneli
  // kesirler (F-SUBPX-2, kuyrukta).
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-ilerleme-formen.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 7) (d) EV KURULU DEĞİL + puantajsız gün — çekirdek günlük (uzantı YOK);
//    İşçi Dağılımı kendi ekip boş hâli (G12a): "Bu gün için puantaj
//    girilmemiş · Puantaja git"
// ---------------------------------------------------------------------------
test("gunluk ilerleme puantajsiz gun gorsel", async ({ page }) => {
  await openDiaryProgress(page, "noEv");
  const content = page.locator("main");

  const empty = content.locator(".diary-workers__empty");
  await expect(empty).toContainText("Bu gün için puantaj girilmemiş");
  await expect(empty.getByRole("link", { name: "Puantaja git" })).toHaveAttribute("href", /\/puantaj/);
  // Uzantısız çekirdek: Saat Dağıtımı, kontrol çubuğu, ek kolonlar ve başlık eki YOK.
  await expect(page.getByRole("region", { name: "Gönder kontrolü" })).toHaveCount(0);
  await expect(content.getByText("Bugün kaz. a-s")).toHaveCount(0);
  await expect(content.locator(".diary__subtitle-suffix")).toHaveCount(0);
  // Başlık: tarih + takvim gün adı, gün/hafta no YOK (takvim dışı: `day_no`/`week_no` null).
  await expect(content.locator(".diary__subtitle")).toHaveText(/· 08\.10\.2026 Perşembe$/);
  // Miktar kartı alt başlığı ÇEKİRDEK metni (uzantı `caption` vermez).
  await expect(linesCard(page).getByText(CORE_LINES_CAPTION, { exact: true })).toBeVisible();
  await expect(content.getByText(EV_LINES_CAPTION)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kaydet & Gönder" })).toBeEnabled();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-ilerleme-puantajsiz.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 8) (a) TABLET · 1024 — İ:527-558: kart ızgarası tek sütun, Saat Dağıtımı
//    ızgarasında ilk kolon yapışkan, dokunmatik seçim kutusu ≥ 36 px; kart
//    KENDİ üst şeridini (İ:528-531 "Saat Dağıtımı" · "07.10 · A-Blok
//    Şantiyesi" · "Dağıtılmamış 34 a-s" hapı) ve alt eylem çubuğunu (İ:549-553
//    "+ İş kodu" · "Kalanı orantılı dağıt" · "Gönder") basar (F2.6 · CEO).
// ---------------------------------------------------------------------------
test("gunluk ilerleme tablet 1024 gorsel", async ({ page }) => {
  await openDiaryProgress(page, "full", { width: TABLET_WIDTH });
  const content = page.locator("main");

  // Üst şerit — masaüstü başlığı + 4'lü şerit tablette gizli; yerini şerit alır.
  const pill = content.locator(".ev-diary-tablet-head__pill");
  await expect(pill).toBeVisible();
  await expect(pill).toHaveText("Dağıtılmamış 34 a-s");
  const meta = content.getByText(`07.10 · ${SITE_NAME}`, { exact: true });
  await expect(meta).toBeVisible();
  const title = content.getByText("Saat Dağıtımı", { exact: true }).filter({ visible: true });
  await expect(title).toHaveCount(1);
  await expect(content.locator(".ev-diary-strip__item--warn dd")).toBeHidden();
  // Şerit TEK satır: başlık · tarih/şantiye · hap aynı yatay bantta, soldan sağa.
  const [titleBox, metaBox, pillBox] = await Promise.all([title.boundingBox(), meta.boundingBox(), pill.boundingBox()]);
  expect(titleBox && metaBox && pillBox, "tablet şeridi yerleşimi").toBeTruthy();
  if (titleBox && metaBox && pillBox) {
    const mid = (box: { y: number; height: number }) => box.y + box.height / 2;
    expect(Math.abs(mid(titleBox) - mid(pillBox)), "hap başlıkla aynı satırda").toBeLessThanOrEqual(12);
    expect(Math.abs(mid(titleBox) - mid(metaBox)), "tarih/şantiye başlıkla aynı satırda").toBeLessThanOrEqual(12);
    expect(titleBox.x).toBeLessThan(metaBox.x);
    expect(metaBox.x).toBeLessThan(pillBox.x);
  }

  // Alt eylem çubuğu — "+ İş kodu" · "Kalanı orantılı dağıt" · (sağda) "Gönder";
  // masaüstü eşleri ("+ İş kodu ekle", kontrol çubuğu Gönder'i) GİZLİ.
  const addCode = page.getByRole("button", { name: "+ İş kodu", exact: true }).filter({ visible: true });
  const distribute = page.getByRole("button", { name: "Kalanı orantılı dağıt" }).filter({ visible: true });
  const send = visibleSendButtons(page);
  await expect(addCode).toHaveCount(1);
  await expect(distribute).toHaveCount(1);
  await expect(send, "tablette TEK görünür Gönder (alt eylem çubuğu)").toHaveCount(1);
  await expect(send).toBeDisabled();
  await expect(page.getByRole("button", { name: "+ İş kodu ekle" }).filter({ visible: true })).toHaveCount(0);
  await expect(visibleSendButtons(page.getByRole("region", { name: "Gönder kontrolü" }))).toHaveCount(0);
  const [addBox, distBox, sendBox, lastRowBox] = await Promise.all([
    addCode.boundingBox(),
    distribute.boundingBox(),
    send.boundingBox(),
    content.locator(".ev-diary-grid__row").last().boundingBox(),
  ]);
  expect(addBox && distBox && sendBox && lastRowBox, "tablet eylem çubuğu yerleşimi").toBeTruthy();
  if (addBox && distBox && sendBox && lastRowBox) {
    const mid = (box: { y: number; height: number }) => box.y + box.height / 2;
    expect(Math.abs(mid(addBox) - mid(sendBox)), "eylemler TEK satırda").toBeLessThanOrEqual(8);
    expect(Math.abs(mid(addBox) - mid(distBox)), "eylemler TEK satırda").toBeLessThanOrEqual(8);
    expect(addBox.x).toBeLessThan(distBox.x);
    expect(distBox.x).toBeLessThan(sendBox.x);
    expect(addBox.y, "eylem çubuğu ızgaranın ALTINDA").toBeGreaterThanOrEqual(lastRowBox.y + lastRowBox.height);
  }
  await expect(content.getByText("YENİ", { exact: true })).toHaveCount(0);
  await expect(itemMetaWithTag(page, "Taşeron")).toHaveCount(1);

  const layout = await page.evaluate(() => {
    const lead = document.querySelector(".ev-diary-grid__lead");
    const select = document.querySelector(".ev-diary-grid__row .ev-diary-grid__select");
    const grid = document.querySelector(".diary__grid");
    return {
      leadPosition: lead ? getComputedStyle(lead).position : null,
      selectWidth: select ? Math.round(select.getBoundingClientRect().width) : 0,
      gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : 0,
    };
  });
  expect(layout.leadPosition).toBe("sticky");
  expect(layout.selectWidth).toBeGreaterThanOrEqual(36);
  expect(layout.gridColumns).toBe(1);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("gunluk-ilerleme-tablet.png", { fullPage: true });
});
