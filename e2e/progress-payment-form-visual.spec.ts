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

// P7 T7 · İşveren Hakediş Oluştur formu görsel testi. `e2e/boq-visual.spec.ts`
// deseninin BİREBİR aynısı. `create` kipi — `?project=p-1` sorgu parametresi
// ile `ProjectPickerStep` ara adımı atlanır. Poz dağılımı (pivot tablo
// satırları) `e2e/mock-backend.ts` · `CONTRACT_ITEMS_P1`den gelir; kod/ad/
// birim `İşveren Hakediş Oluştur.dc.html` satır 106-172'den BİREBİR
// (03.001-03.003 Betonarme İşleri, 03.010 Kalıp İşleri).
//
// Mock oturumda (`ME`) `permissions` alanı YOKTUR → bilinmezlik kuralı
// gereği tüm yazma yüzeyleri (miktar girişleri, "Taslak Kaydet") GÖRÜNÜR
// hâlde baseline'a girer.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch); macOS'ta koşturulup commit edilmez. Bu spec `create`
// kipinde hiçbir kaydetme çağrısı YAPMAZ — yalnız formu render eder, mock
// state'i mutasyona uğratmaz.
test("isveren hakedis olustur formu ekrani gorsel", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // 🔴 Saat gezinmeden ÖNCE dondurulur — bkz. `FIXED_TODAY`.
  await page.clock.setFixedTime(FIXED_TODAY);
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();

  await page.goto("/hakedisler/yeni?project=p-1");
  await expect(page.getByRole("heading", { name: "İşveren Hakediş Oluştur" })).toBeVisible();
  // İçerik yüklendi: pivot tablonun son satırı (Kalıp İşleri grubu) ve
  // Fiyat Farkı bandı basılı olmadan ekran görüntüsü alınırsa baseline
  // yükleme durumunu dondurur.
  await expect(page.locator("main").getByText("Döşeme Kalıbı")).toBeVisible();
  await expect(page.getByTestId("pp-form-ff-band")).toBeVisible();

  // Kadraj hazırlığı (kaydırma sıfırlama + imleç parkı): `visual-scroll.ts`.
  await prepareFrame(page);
  await expect(page).toHaveScreenshot("hakedis-olustur-formu.png", { fullPage: true });
});
