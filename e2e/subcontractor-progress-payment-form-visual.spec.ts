import { test, expect } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

/**
 * 🔴 ZAMAN BOMBASI ONARIMI (F-AISOL, 2026-09-03). Bu kadraj `create` kipinde
 * dönem seçicisini `new Date()`ten dolduruyordu
 * (`ProgressPaymentForm.tsx:108-109` · `SubcontractorProgressPaymentForm.tsx:125-126`)
 * ve baseline AY ADINI taşıyordu. Saat DONMADIĞI için kare her ay başında,
 * kod değişmeden kırmızıya dönüyordu: depo karesi "Ağustos" basıyordu, 3 Eylül
 * turu "Eylül" bastı (153 piksel, 51×13'lük tek kutu). `main`in son yeşil turu
 * 2026-08-31'di — kapı 1 Eylül'de kimse fark etmeden düştü.
 *
 * 🔴 TARİH ÖLÇÜLEREK SEÇİLDİ, keyfî değil:
 *   · `mock-backend.ts`te `period_year` 11 kaydın 11'inde 2026; `period_month`
 *     dağılımı 7→6, 8→3, 6→2, 5→2, 3/4/9→1 (ölçüm:
 *     `command grep -oE "period_month: [0-9]+" e2e/mock-backend.ts | sort | uniq -c`).
 *     Temmuz 2026 fikstürlerin BASKIN dönemidir.
 *   · Bu kadrajların tam kayıtları da orada: işveren tarafında `pp-5`
 *     (`project_id: "p-1"`, 2026-07) ve taşeron tarafında `scpp-3`
 *     (`contract_id: "sc-1"`, 2026-07, "Temmuz hakedişi") — yani donmuş saat,
 *     formun varsayılan döneminin ekrandaki veriyle AYNI aya düşmesini sağlar.
 *   · `2026-07-20T09:00:00Z` damgası depoda ZATEN kullanılıyor
 *     (`site-diary-visual.spec.ts` · `site-diary-summary-visual.spec.ts`),
 *     yani yeni bir sabit icat edilmedi. Ayın ORTASI bilerek seçildi: ay
 *     sınırına yakın bir damga, koşucunun saat diliminde başka aya kayabilirdi.
 */
const FIXED_TODAY = new Date("2026-07-20T09:00:00Z");

// F-TH T6 · Taşeron Hakediş Oluştur formu + sözleşme seçim adımı görsel
// testleri. `e2e/progress-payment-form-visual.spec.ts` deseninin BİREBİR
// aynısı. Sözleşme kalemleri (`SUBCONTRACTOR_CONTRACT_ITEMS_SC1`,
// `e2e/mock-backend.ts`) kod/ad/birim/fiyat BİREBİR bu kadrajdadır.
//
// Mock oturumda (`ME`) `permissions` alanı YOKTUR → bilinmezlik kuralı
// gereği tüm yazma yüzeyleri (miktar girişleri, "Taslak Kaydet") GÖRÜNÜR
// hâlde baseline'a girer.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch); macOS'ta koşturulup commit edilmez. Bu spec `create`
// kipinde hiçbir kaydetme çağrısı YAPMAZ — yalnız formu render eder, mock
// state'i mutasyona uğratmaz (brief §⛔ tuzak 2 — mutasyona uğrayan kayıt
// kadrajda yok).

async function login(page: import("@playwright/test").Page) {
  // 🔴 Saat gezinmeden ÖNCE dondurulur — bkz. `FIXED_TODAY`. İKİ kadraj da
  // buradan geçer; sözleşme seçim adımı ay basmasa bile aynı zemini paylaşır.
  await page.clock.setFixedTime(FIXED_TODAY);
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("taseron sozlesme secim adimi ekrani gorsel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await page.goto("/hakedisler/taseron/yeni");
  await expect(page.getByRole("heading", { name: "Taşeron Hakediş Oluştur" })).toBeVisible();
  // İçerik yüklendi: sözleşme seçici basılı olmadan ekran görüntüsü alınırsa
  // baseline yükleme durumunu dondurur. TB2 takip: geçiş dönemi kalıcı bilgi
  // notu (Alert) kaldırıldı — U1 liste ucu geldiğinden sınır artık YOK.
  await expect(page.locator("main").getByLabel("Taşeron Sözleşmesi")).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("taseron-sozlesme-secim-adimi.png", { fullPage: true });
});

test("taseron hakedis olustur formu ekrani gorsel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);

  await page.goto("/hakedisler/taseron/yeni?contract=sc-1");
  // Final inceleme F-7 sonrası başlık TEK metin düğümü DEĞİLDİR
  // ("Hakediş" + pending `#—` + "Oluştur") — `getByText("Hakediş Oluştur")`
  // kırılgandı. Başlık erişilebilir adıyla sorgulanır; ayrıca YALNIZ create
  // kipinde basılan sıra-no pending göstergesi create formunun gerçekten
  // yüklendiğini kanıtlar (assert ZAYIFLATILMADI, güçlendirildi).
  await expect(page.getByRole("heading", { name: /Hakediş .* Oluştur/ })).toBeVisible();
  await expect(page.getByTestId("thf-sequence-pending")).toBeVisible();
  // İçerik yüklendi: kalem tablosunun son satırı (Pano Montajı) + tfoot'un
  // NET ÖDENECEK satırı basılı olmadan ekran görüntüsü alınırsa baseline
  // yükleme durumunu dondurur (create kipinde tfoot henüz "—" basar —
  // brief §Kaydetme yolu, ilk kaydetmeye kadar `calculation` yok).
  await expect(page.locator("main").getByText("Pano Montajı")).toBeVisible();
  await expect(page.getByTestId("thf-coefficient-band")).toBeVisible();
  await expect(page.locator("main").getByText("NET ÖDENECEK")).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("taseron-hakedis-olustur-formu.png", { fullPage: true });
});
