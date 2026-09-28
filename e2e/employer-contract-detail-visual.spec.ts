import { test, expect } from "@playwright/test";

import { login, pinEmployerContractItems, prepareFrame } from "./contracts-visual-helpers";
import { pinTimeline } from "./takvim-helpers";

// F-P5 T8 · E14 (`/sozlesmeler/isveren/p-1`) görsel testleri. Kanon:
// projedesign `Ekran 14 - Sözleşme Detay.dc.html`.
//
// Üç sekme AYRI kare olarak basılır ve sekme durumu URL'den kurulur
// (`?tab=`) — sekmeye TIKLANMAZ, yani kadraj gezinme zamanlamasından
// bağımsızdır ve "tıklama + `fullPage`" birleşimi hiç oluşmaz. (Hakedişler
// sekmesi kadraja alınmaz: aynı `ProgressPaymentsListBody` bileşeni
// `progress-payments-visual.spec.ts`te zaten baseline'lıdır.)
//
// ⚠️ `.ecd` kökünde `animation: var(--anim-fade-up)` vardır ve bu ekranda
// FİİLEN yaşandı: durum-tabanlı iddia olmadan kare fade'in ortasında düşüyor.
// Her karede kadrajdan ÖNCE sekmenin KENDİ içeriğine bakan bir iddia vardır.
//
// 🔒 FİKSTÜR İZOLASYONU: bu dosya HİÇBİR kayda dokunmaz. Belgeler sekmesi sabit
// `EMPLOYER_CONTRACT_P1`ten beslenir. İş Kalemleri sekmesi ise
// `state.contractItems`ten türer — `contract-distribution.spec.ts`in geçici
// 1.800 → 1.900 penceresiyle YARIŞIR, bu yüzden GET yanıtı `pinEmployerContract
// Items` ile tohum kotalarına sabitlenir (paylaşılan mock durumu DEĞİŞMEZ).
//
// 🔴 F-MILESTONE — Genel sekmesi ARTIK ÜÇÜNCÜ bir kaynaktan da beslenir:
// `GET /projects/timeline`. O yanıt PAYLAŞILAN state'ten türer ve
// `section-form.spec.ts` p-1'in s-2 şantiyesine YENİ bölüm ekliyor. Süzgeçsiz
// bırakılırsa kare, o spec'in koşup koşmadığına göre oynardı (bugün eklenen
// bölümler milestone'suz olduğu için kart onları basmaz — ama bu bir GARANTİ
// DEĞİL, RASTLANTI). `pinTimeline` yanıtı seed kümesine daraltır; `today`
// damgası sunucudan gelmeye devam eder, UYDURULMAZ.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir; macOS'ta commit edilmez.


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

const URL = "/sozlesmeler/isveren/p-1";

/** Kadrajın sabit "bugünü" — E14 "Bitiş Tarihi" tonunun TEK girdisi. */
const FIXED_NOW = "2026-08-27T09:00:00Z";


test("isveren sozlesme detayi genel sekmesi gorsel", async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await pinTimeline(page);
  await page.goto(URL);

  await expect(page.getByRole("heading", { level: 1, name: "Kule A" })).toBeVisible();
  // Yerleşim oturdu: başlık kartının metrikleri + Hakediş Özeti'nin türev
  // yüzdesi basıldı ("Yükleniyor…" dalı geçildi).
  await expect(page.getByTestId("ecd-metrics")).toBeVisible();
  await expect(page.getByTestId("ecd-pps-caption")).toHaveText("%75 hakkedildi");
  // §7 S3 "Sözleşme Koşulları" bloğu kadrajda ZORUNLU (dilimin onaylı eki).
  await expect(page.getByTestId("ecd-term-index")).toHaveText("TÜFE");
  // 🔴 Milestone Takvimi CANLI: kadraj YÜKLEME iskeletinde donmasın diye
  // kartın GERÇEKTEN dolduğu durum-tabanlı olarak beklenir (iki grup + üç
  // satır). `today` sunucu damgasıdır → `setFixedTime` bu türevi OYNATMAZ.
  await expect(page.getByTestId("ecd-ms-group")).toHaveCount(2);
  await expect(page.getByTestId("ecd-ms-row")).toHaveCount(3);
  await expect(page.getByTestId("ecd-milestones-loading")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("isveren-sozlesme-genel.png", { fullPage: true });
});

test("isveren sozlesme detayi is kalemleri sekmesi gorsel", async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await pinEmployerContractItems(page);
  await page.goto(`${URL}?tab=items`);

  await expect(page.getByRole("heading", { level: 1, name: "Kule A" })).toBeVisible();
  // Yerleşim oturdu: tablo GERÇEKTEN doldu — "Dağıtılan"/"Kalan" türev
  // hücreleri ve toplam satırı basıldı (yükleme durumu dondurulmasın).
  await expect(page.getByTestId("ecd-item-distributed").first()).toBeVisible();
  await expect(page.getByTestId("ecd-item-remaining").first()).toBeVisible();
  await expect(page.getByTestId("ecd-items-total")).toBeVisible();
  await expect(page.getByTestId("ecd-distribution-link")).toBeVisible();
  // 🔴 F-ISVPOZ · kadrajın YENİ konusu: "Sözl. Birim F." ve "Toplam Miktar"
  // hücreleri artık salt metin DEĞİL, satır-içi kontroldür; grup sonunda da
  // satır-içi ekleme düğmesi vardır. Bu kare BU YÜZDEN oynar — beklenen.
  // (Değer iddiası YAZILMAZ: `pinEmployerContractItems` yalnız türev
  // kolonları sabitler, `quantity`/`unit_price` sabitli değildir.)
  await expect(page.locator("main").getByLabel("03.001 miktar")).toBeEditable();
  await expect(page.locator("main").getByLabel("03.001 birim fiyatı")).toBeEditable();
  await expect(page.getByTestId("ecd-add-row-cg-1")).toBeEnabled();
  // Taslak satır KAPALI hâliyle basılır (kadraj bir düzenleme oturumu değil).
  await expect(page.getByTestId("ecd-new-row")).toHaveCount(0);
  await expect(page.getByTestId("ecd-items-error")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("isveren-sozlesme-kalemler.png", { fullPage: true });
});

test("isveren sozlesme detayi belgeler sekmesi gorsel", async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await page.goto(`${URL}?tab=documents`);

  await expect(page.getByRole("heading", { level: 1, name: "Kule A" })).toBeVisible();
  // Yerleşim oturdu: PENDING kartı basıldı (bölüm SİLİNMEZ kuralının kanıtı
  // baseline'a girer); arşiv yüzeyi bu dilimde YOKTUR.
  await expect(page.getByTestId("ecd-documents-pending")).toContainText(
    "Belge verisi bu yüzeye henüz bağlanmadı",
  );

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("isveren-sozlesme-belgeler.png", { fullPage: true });
});
