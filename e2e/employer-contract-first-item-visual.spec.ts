import { test, expect, type Page } from "@playwright/test";

import { login, prepareFrame } from "./contracts-visual-helpers";

// F-POZGRUP T4 · "Yeni bir işveren sözleşmesine İLK poz eklenemiyor"
// kusurunun düzeltmesinin GÖRSEL kadrajları.
//
// İki kare, ikisi de BOŞ (grupsuz) sözleşme fikstürü `p-4` (Güneşkent
// B-Blok) üzerinden:
//   1) `isveren-sozlesme-bos-kalemler` — İş Kalemleri sekmesi: `+ Poz Ekle`
//      AÇIK (eskiden `disabled` idi) + yeni EYLEM anlatan boş-durum metni
//      (`EMPLOYER_NO_GROUPS_HINT`) basılı.
//   2) `poz-ekle-isveren-yeni-grup` — aynı ekranda diyalog açık ve doğrudan
//      "+ Yeni Grup" kipinde: grup açılırı sentinel'de, "Grup Adı" alanı
//      görünür. `poz-ekle-isveren` baseline'ı (form-dialogs-visual, `p-1`)
//      GRUPLU hâli basar; bu kare onun grupsuz KARDEŞİdir, kopyası değil.
//
// ---------------------------------------------------------------------------
// 🔒 DETERMİNİZM — `p-4` PAYLAŞILAN VE MUTASYONA UĞRAYAN BİR KAYITTIR
// ---------------------------------------------------------------------------
// `employer-contract-first-item.spec.ts` (T3) ikinci testinde `p-4`e KALICI
// olarak grup + kalem yazar. Mock durumu koşu boyunca TEKtir ve Playwright
// `fullyParallel` çalışır → dosya sırası garanti DEĞİLDİR. Kadrajı olduğu
// gibi bıraksaydık kare kâh "hiç grup yok" (T3'ten önce) kâh "A — Kaba Yapı
// grubu + 03.099 pozu" (T3'ten sonra) hâlini basardı; hangisi baseline'a
// girerse öbürü görsel CI'da KIRMIZIdır. `test.describe.configure({ mode:
// "serial" })` bu yarışı ÇÖZMEZ — serial yalnız DOSYA İÇİ sırayı bağlar.
//
// Çözüm, depodaki `pinEmployerContractItems` deseniyle aynı: paylaşılan mock
// durumuna DOKUNULMAZ, yalnız bu sayfanın GET yanıtı tohum hâline ("hiç grup
// yok") geri yazılır. Böylece kare T3'ten ÖNCE de SONRA da aynıdır.
//
// Kadrajın beslendiği ÖBÜR iki uç ölçüldü, sabitlemeye gerek YOK:
//   • `GET /projects/p-4/contract` → `items_total`/`items_total_diff`/`amount`
//     mock'ta SABİT yazılıdır (state'ten türemez), `contract_no` ise `p-4`
//     proje kaydından gelir ve hiçbir spec o kaydı değiştirmez.
//   • `GET /projects/p-4` (proje adı) → aynı dokunulmayan kayıt.
//
// 🔒 SALT-OKUR: bu dosya "Pozu Ekle"ye BASMAZ; diyalog yalnız açılır. Yazsaydı
// `p-4`ü T3'ün ön koşulundan (grupsuz sözleşme) çıkarır, kendi kardeşini
// bozardı.
//
// ---------------------------------------------------------------------------
// 🔴 "YÜKLENDİ" İDDİASI HER BAĞIMSIZ VERİ KAYNAĞINI KAPSAR (WORKFLOW §4, 5.)
// ---------------------------------------------------------------------------
// Sorgu sayısı tahmin EDİLMEDİ, `EmployerContractDetailView` hook katmanından
// OKUNDU — `?tab=items` açıkken DÖRT sorgu uçar:
//   (a) `useEmployerContract(p-4)`   → başlık kartı + metrik şeridi
//   (b) `useProject(p-4)`            → h1'deki PROJE ADI (yüklenmezse "—")
//   (c) `useEmployerContractItems`   → tablo/boş-durum + yönlendirme metni
//   (d) `useProgressPayments({project_id})` → bu sekmede HİÇBİR ŞEY BASMAZ
//       (yalnız "payments" sekmesinde çizilir), yani kadrajda görünür bir
//       iddiası olamaz ve tek bir pikseli bile oynatmaz. Kasıtlı boşluktur.
// (a)-(c) için AYRI iddia vardır; ayrıca hiçbir yerde "Yükleniyor…" kalmadığı
// ölçülür (üç dalın da yükleme metni aynı sabittir).
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (Next route-announcer tuzağı).
// ⚠️ Sabit `waitForTimeout` YOKTUR; her bekleme durum tabanlıdır.
// ⚠️ Yerel `mouse.move`/`scrollTo` YOKTUR: kanonik `prepareFrame` çağrılır.
//    2. kare TIKLAMA içerir ve `fullPage`dir — "tıklama + fullPage" birleşimi
//    tam da korkuluğun var olma sebebidir. Ayrıca `.modal`ın kendisi
//    `overflow-y: auto` + `max-height: 85vh`tir; formun boyu pencereyi aşarsa
//    odak taşıması diyaloğu İÇİNDEN kaydırabilir — `prepareFrame` pencereyi
//    DE her kaydırılabilir kabı DA iki eksende sıfırlar.
// ⚠️ 4. parça (kesirli ölçü): bu diyalog JS ile ÖLÇÜLEREK konumlanmaz —
//    `.modal-overlay` sabit bir örtüdür ve `.modal`ı CSS flex ile ortalar
//    (`AnchoredPopover` gibi `getBoundingClientRect` tabanlı bir yüzey
//    DEĞİLDİR). Yuvarlanacak ölçüm yoktur; `poz-ekle-isveren` baseline'ı da
//    aynı bileşeni yuvarlamasız basar.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.


// ---------------------------------------------------------------------------
// ⏱️ SAAT SABİTLEME (F-SZLEKR T1'de EKLENDİ — ZORUNLU)
// ---------------------------------------------------------------------------
// Başlık kartının "Bitiş Tarihi" metriğinin RENGİ artık bir TÜREVDİR
// (`contract-end-tone.ts`): geçmiş = kırmızı · 0..30 gün = kehribar · ötesi
// nötr. Fikstürün `end_date`i `2026-12-01`dir (`mock-backend.ts` ·
// `EMPLOYER_CONTRACT_P1`; `p-4` de aynı değeri yayılımla devralır).
// Saat DONDURULMAZSA kare 2026-11-01'de KENDİLİĞİNDEN kehribara döner ve
// baseline hiçbir kod değişmeden kırılır (`purchasing-orders-visual.spec.ts`
// ile aynı gerekçe ve yöntem).
//
// Sabit an 09:00 UTC seçilir: hem UTC hem TR (+03) yerel takviminde AYNI güne
// düşer (`remainingDays` yerel takvimden türetir, TZ kayması olmaz).
// 27.08.2026 → 01.12.2026'ya 96 gün → NÖTR ton.
//
// ⚠️ Saat GİRİŞTEN ÖNCE sabitlenir (`purchasing-orders-visual.spec.ts`
// sırasının birebir taklidi).

/** Kadrajın sabit "bugünü" — E14 "Bitiş Tarihi" tonunun TEK girdisi. */
const FIXED_NOW = "2026-08-27T09:00:00Z";

/** Boş (grupsuz) sözleşme fikstürü — bkz. `EMPTY_CONTRACT_PROJECT_ID`. */
const EMPTY_CONTRACT_URL = "/sozlesmeler/isveren/p-4?tab=items";
const EMPTY_ITEMS_PATH = "/api/backend/projects/p-4/contract/items";

/** `EmployerItemFormModal` · `NEW_GROUP_OPTION` sentinel'i. */
const NEW_GROUP_SENTINEL = "__new__";
const LOADING_TEXT = "Yükleniyor…";

interface ContractItemsResponse {
  groups: unknown[];
}

/**
 * `p-4`in kalem GET'ini TOHUM hâline ("hiç grup yok") sabitler. Yalnız GET'e
 * dokunur — olası bir POST aynı yola gider ve el değmeden geçmelidir.
 */
async function pinEmptyContractItems(page: Page) {
  await page.route(
    (url) => url.pathname === EMPTY_ITEMS_PATH,
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      const body = (await response.json()) as ContractItemsResponse;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...body, groups: [] }),
      });
    },
  );
}

/** İki karenin de ORTAK ön koşulu: ekran grupsuz hâliyle TAM yüklendi. */
async function gotoLoadedEmptyContract(page: Page) {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await pinEmptyContractItems(page);
  await page.goto(EMPTY_CONTRACT_URL);

  // YÜKLENDİ (b) proje adı — sorgu bitmeden h1 "—" basar.
  await expect(page.getByRole("heading", { level: 1, name: "Güneşkent B-Blok" })).toBeVisible();
  // YÜKLENDİ (a) sözleşme detayı — metrik şeridi yalnız `detail` gelince çizilir.
  await expect(page.getByTestId("ecd-metrics")).toBeVisible();
  // YÜKLENDİ (c) kalem listesi — boş-durum metni `groups` TANIMLIYKEN ve
  // uzunluğu 0'ken basılır; yönlendirme metni ayrıca `isLoading`/`isError`
  // dallarının ikisini de eler.
  await expect(page.locator("main").getByText("Bu sözleşmede henüz iş kalemi yok")).toBeVisible();
  await expect(page.getByTestId("ecd-add-item-reason")).toContainText(
    "ilk pozu eklerken grubu da oluşturabilirsiniz",
  );
  // Hiçbir dal yükleme hâlinde donmadı.
  await expect(page.locator("main").getByText(LOADING_TEXT)).toHaveCount(0);
}

// ---------------------------------------------------------------------------
// 1) Grupsuz sözleşme · İş Kalemleri sekmesi
// ---------------------------------------------------------------------------
test("grupsuz isveren sozlesmesi is kalemleri sekmesi gorsel", async ({ page }) => {
  await gotoLoadedEmptyContract(page);

  // 🔴 Kadrajın ASIL konusu: düğme AÇIK basılıyor (eski kare `disabled`
  // gri hâli basardı ve kusur baseline'a çakılırdı).
  await expect(page.getByTestId("ecd-add-item")).toBeEnabled();

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("isveren-sozlesme-bos-kalemler.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 2) Grupsuz sözleşme · "+ Poz Ekle" diyaloğu, "+ Yeni Grup" kipinde
// ---------------------------------------------------------------------------
test("poz ekle isveren diyalogu yeni grup kipi gorsel", async ({ page }) => {
  await gotoLoadedEmptyContract(page);

  await page.getByTestId("ecd-add-item").click();

  const dialog = page.getByRole("dialog", { name: "İşveren Sözleşmesine Poz Ekle" });
  await expect(dialog).toBeVisible();
  // 🔴 Kadrajın ASIL konusu: grup açılırı boş yer tutucuda DEĞİL, doğrudan
  // "+ Yeni Grup" sentinel'inde; grup adı alanı da bu yüzden görünür.
  await expect(dialog.getByLabel("Poz Grubu", { exact: true })).toHaveValue(NEW_GROUP_SENTINEL);
  await expect(dialog.getByLabel("Grup Adı", { exact: true })).toBeVisible();
  // Diyalog OTURDU: sözleşmeden okunan salt-okunur fiyat farkı alanları doldu
  // (sözleşme sorgusu diyaloğun İÇİNDE de bir kaynaktır — boş basılırsa kare
  // bozulur) ve türev bedel/toplam yüzeyleri çizildi, hata satırı yok.
  await expect(dialog.getByTestId("eci-escalation")).not.toHaveValue("");
  await expect(dialog.getByTestId("eci-index-type")).not.toHaveValue("");
  await expect(dialog.getByTestId("eci-line-total")).toBeVisible();
  await expect(dialog.getByTestId("eci-contract-total")).toBeVisible();
  await expect(dialog.getByTestId("eci-error")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("poz-ekle-isveren-yeni-grup.png", { fullPage: true });
});
