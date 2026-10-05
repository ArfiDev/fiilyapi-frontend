import { test, expect, type Page } from "@playwright/test";

import {
  ACCOUNTING_EMPTY_TIME,
  BALANCE_SHEET_DEFAULT_AS_OF,
  BALANCE_SHEET_IMBALANCED_AS_OF,
  openBalanceSheet,
  openCashFlowStatement,
  openFinancialStatementsHome,
} from "./accounting-helpers";
import { prepareFrame } from "./visual-scroll";

// F-MT T6 · Bilanço + Nakit Akış Tablosu + Mali Tablolar kökünün görsel
// kadrajları. Kanonik mockup'lar: `Mali Tablo - Bilanço.dc.html` (BL) ·
// `Mali Tablo - Nakit Akışı.dc.html` (NA) · `Ekran 11 - Mali Tablo.dc.html`
// (E11).
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER. Beşinci kapı
// `--grep-invert "gorsel"` ile BAŞLIĞA göre süzer; içermeyen bir görsel test
// fonksiyonel turda baseline'sız koşar ve KIRMIZI olur.
//
// 🔴 BEŞ KARE, İKİSİ MOCKUP BOŞLUĞU: `mali-tablolar-bilanco-dengesiz` (BL K3'ün
// dengesiz dalı) ve `mali-tablolar-gelir-tablosu-ayrisik` (F-MT2 K1'in ayrışık
// dalı) hiçbir mockup'ta ÇİZİLMEMİŞTİR — o dalların var olduğunu YALNIZ bu
// kareler kanıtlar (`accounting-reports-visual`in K1/K2 emsali).
//
// 🔒 SALT-OKUR: bu dosya hiçbir POST/PATCH/DELETE tetiklemez. Üç ekranın da
// uçları YALNIZ `GET` tanımlar; ayrıca `balanceSheetFixture` /
// `cashFlowStatementFixture` mock backend'de DONMUŞ haritalardır
// (`accountingState`ten TÜRETİLMEZ) ⇒ Haziran'ın mutasyon adasında koşan
// yazma akışları bu kadrajlara `fullyParallel` altında bile SIZAMAZ.
//
// 📅 SAAT DONDURULUR (`page.clock`, NAVİGASYONDAN ÖNCE — `open*` helper'ları
// yapar): bilanço günü ve nakit akışı dönemi `new Date()`ten türer.
// Dondurulmasaydı gerçek ay geldiğinde tablolar SIFIR gövdeyle inerdi (uçlar
// tanınmayan dönemde 404 DEĞİL, yapısal olarak geçerli sıfır döndürür) ve
// kadraj sessizce ANLAMSIZLAŞIRDI — sıfır bir bilanço da geçerli bir karedir,
// kimse fark etmezdi.
//
// ⚠️ Sabit `waitForTimeout` YOKTUR; her bekleme durum tabanlıdır.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

const VISUAL_VIEWPORT = { width: 1440, height: 900 } as const;

/**
 * Hiçbir kadrajda yükleme metni KALMAZ (WORKFLOW §4, 1. parça).
 *
 * 🔴 SORGU SAYISI HOOK KATMANINA BAKILARAK ÖLÇÜLDÜ, TAHMİN EDİLMEDİ:
 * `BalanceSheetView` TEK sorgu (`useBalanceSheet`), `CashFlowStatementView`
 * TEK sorgu (`useCashFlowStatement` — KPI şeridi, A/B/C tablosu, aylık grafik
 * ve kapanış satırlarının HEPSİ o TEK yanıttan beslenir),
 * `FinancialStatementsHomeView` de TEK sorgu (`useIncomeStatement` — tablo,
 * oran sütunu ve mutabakat şeridi O TEK yanıttan beslenir; sağ sütunun iki
 * kartı KAYNAKSIZdır ve ağa hiç çıkmaz). Üçünde de `useModulePermission`
 * AĞA ÇIKMAZ —
 * `SessionProvider`ın zaten çektiği `/auth/me` yükünü okur.
 *
 * Yine de kabuk da metin basabileceği için ortak kalıp + yüzeylerin KENDİ
 * işaretleri birlikte ölçülür.
 */
async function expectNoLoadingText(page: Page) {
  await expect(page.getByText(/yükleniyor/i)).toHaveCount(0);
  await expect(page.getByTestId("bl-loading")).toHaveCount(0);
  await expect(page.getByTestId("na-loading")).toHaveCount(0);
  await expect(page.getByTestId("mt-loading")).toHaveCount(0);
}

// ---------------------------------------------------------------------------
// 1) BL · Bilanço — DENGELİ (31 Temmuz 2026)
// ---------------------------------------------------------------------------
test("mali tablolar bilanco gorsel", async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await openBalanceSheet(page);

  await expect(page.getByRole("heading", { level: 1, name: "Bilanço" })).toBeVisible();

  // 🔴 Damga ("bl-loaded") "veri geldi" der, "ekrana bastı" DEMEZ — tek
  // kaynağın GERÇEK rakamları ayrıca ölçülür (WORKFLOW §4, 5. parça).
  //
  // 📅 `page.clock` KANITI: nokta-zaman seçici içinde bulunulan AYIN SON günü.
  await expect(page.getByTestId("bl-as-of")).toHaveValue(BALANCE_SHEET_DEFAULT_AS_OF);

  // İki taraf da TAM olarak indi (satır sayıları fikstürden türer: bant +
  // kalemler + ara toplam, en sonda genel toplam).
  const assets = page.getByRole("region", { name: "AKTİF (Varlıklar)" });
  const liabilities = page.getByRole("region", { name: "PASİF (Kaynaklar)" });
  await expect(assets.locator("tbody tr")).toHaveCount(11);
  await expect(liabilities.locator("tbody tr")).toHaveCount(14);

  // 🔴 K3 — banner YEŞİL dalda.
  const banner = page.getByTestId("bl-banner");
  await expect(banner).toHaveClass(/fs-banner--ok/);
  await expect(banner).toContainText("Bilanço Dengede");

  // İki taraf AYNI genel toplamı basar (dengenin asıl kanıtı).
  await expect(page.getByTestId("bl-assets-total")).toContainText("22.642.220");
  await expect(page.getByTestId("bl-liabilities-total")).toContainText("22.642.220");
  // Ara toplamlar ve bölüm bantları da kadrajda.
  await expect(page.getByTestId("bl-assets-current-subtotal")).toContainText("18.782.220");
  await expect(page.getByTestId("bl-assets-fixed-subtotal")).toContainText("3.860.000");
  await expect(page.getByTestId("bl-liabilities-equity-band")).toContainText("ÖZKAYNAKLAR");
  // 🔴 TEK KAYNAK — nakit akışının `DÖNEM SONU NAKİT`iyle AYNI sabitten gelir.
  await expect(page.getByTestId("bl-assets-current-cash")).toContainText("6.249.500");
  // 🔴 K4 — kontra hesap (257) SUNUCUDA netlenir: tek ve POZİTİF satır.
  await expect(page.getByTestId("bl-assets-fixed-tangible")).toContainText("3.620.000");

  // Devre-dışı yüzey + GÖRÜNÜR gerekçe bandı da kadrajın parçasıdır.
  await expect(page.getByTestId("bl-export-pdf")).toBeDisabled();
  await expect(page.getByTestId("bl-export-reason")).toBeVisible();
  await expect(page.getByTestId("bl-error")).toHaveCount(0);

  // 🔴 KULLANICI KARARI 2026-08-27 — kadrajın SOL sütunu artık uygulamanın ANA
  // MENÜSÜdür (drill sidebar onu örtüyordu, kaldırıldı). `aria-current`i o
  // taşır; bu ekranın "buradasın" sinyali SEGMENT denetimindedir.
  await expect(page.getByRole("complementary", { name: "Mali tablolar menüsü" })).toHaveCount(0);
  await expect(page.locator("[aria-current='page']")).toHaveText("Mali Tablolar");
  await expect(page.getByTestId("mt-seg-current")).toHaveText("Bilanço");
  await expectNoLoadingText(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("mali-tablolar-bilanco.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 2) BL · Bilanço — DENGESİZ (31 Ocak 2026) · 🔴 K3'ün çizilmemiş dalı
// ---------------------------------------------------------------------------
// Mizan'ın dengesiz karesiyle ÇAKIŞMAZ: o kare `/muhasebe/mizan`dadır ve
// `/trial-balance` ucuna bakar, `/balance-sheet`e DEĞİL.
test("mali tablolar bilanco dengesiz gorsel", async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await openBalanceSheet(page, ACCOUNTING_EMPTY_TIME);

  // 📅 Ocak saatinde varsayılan gün ayın son günüdür.
  await expect(page.getByTestId("bl-as-of")).toHaveValue(BALANCE_SHEET_IMBALANCED_AS_OF);

  const assets = page.getByRole("region", { name: "AKTİF (Varlıklar)" });
  const liabilities = page.getByRole("region", { name: "PASİF (Kaynaklar)" });
  await expect(assets.locator("tbody tr")).toHaveCount(5);
  await expect(liabilities.locator("tbody tr")).toHaveCount(8);

  // 🔴 K3 — banner KIRMIZI dala döndü; başlık, gerekçe ve FARK birlikte
  // basıldı. `≠` glifi YAZILMAZ (F-SEM glif kuralı), "eşit değil" yazılır.
  const banner = page.getByTestId("bl-banner");
  await expect(banner).toHaveClass(/fs-banner--off/);
  await expect(banner).toContainText("Bilanço Dengede Değil");
  await expect(banner).toContainText("eşit değil");
  await expect(banner).toContainText("fark: ₺ 140.000");

  // Kadrajın asıl konusu: iki genel toplam gerçekten FARKLI.
  await expect(page.getByTestId("bl-assets-total")).toContainText("1.500.000");
  await expect(page.getByTestId("bl-liabilities-total")).toContainText("1.360.000");
  // 🔴 Bilanço dengesizken bile NAKİT tek kaynaktan gelir (Ocak nakit akışı).
  await expect(page.getByTestId("bl-assets-current-cash")).toContainText("1.200.000");
  await expect(page.getByTestId("bl-error")).toHaveCount(0);
  await expectNoLoadingText(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("mali-tablolar-bilanco-dengesiz.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 3) NA · Nakit Akış Tablosu (Ocak–Temmuz 2026)
// ---------------------------------------------------------------------------
test("mali tablolar nakit akisi gorsel", async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await openCashFlowStatement(page);

  // 🔴 Sayfa başlığı sidebar etiketinden (`Nakit Akışı`) BİLEREK FARKLIdır.
  await expect(page.getByRole("heading", { level: 1, name: "Nakit Akış Tablosu" })).toBeVisible();
  // 📅 `page.clock` KANITI: birikimli aralık seçicisi içinde bulunulan ayda.
  await expect(page.getByTestId("na-period")).toHaveValue("2026-07");

  // (a) KPI şeridi — DÖRT kartın da GERÇEK rakamı, üç ton birden.
  await expect(page.getByTestId("na-kpis").locator(".fs-cf-kpi")).toHaveCount(4);
  await expect(page.getByTestId("na-kpi-operating")).toContainText("+ 5.842.000");
  await expect(page.getByTestId("na-kpi-investing")).toContainText("- 1.240.000");
  await expect(page.getByTestId("na-kpi-financing")).toContainText("- 800.000");
  // 🔴 K2 — net kart sunucunun `net_change`ini basar (mockup'ın 4.802.000'i
  // DEĞİL); tablonun orta kapanış satırıyla AYNI sayıdır.
  await expect(page.getByTestId("na-kpi-net")).toContainText("+ 3.802.000");

  // (b) A/B/C tablosu — üç bölüm bandı, kalemler ve ara toplamlar.
  await expect(page.getByTestId("na-table").locator("tbody tr")).toHaveCount(16);
  await expect(page.getByTestId("na-section-operating-band")).toContainText(
    "A. İŞLETME FAALİYETLERİNDEN NAKITLER",
  );
  await expect(page.getByTestId("na-section-operating-collections")).toContainText("+ 24.994.700");
  await expect(page.getByTestId("na-section-operating-subtotal")).toContainText("+ 5.842.000");
  await expect(page.getByTestId("na-section-investing-subtotal")).toContainText("- 1.240.000");
  await expect(page.getByTestId("na-section-financing-subtotal")).toContainText("- 800.000");

  // (c) ÜÇ SATIRLI kapanış — bakiyeler işaretsiz, akış işaretli.
  await expect(page.getByTestId("na-opening")).toContainText("2.447.500");
  await expect(page.getByTestId("na-net-change")).toContainText("+ 3.802.000");
  // 🔴 TEK KAYNAK — bilançonun `Kasa ve Bankalar`ıyla AYNI rakam.
  await expect(page.getByTestId("na-closing")).toContainText("6.249.500");

  // (d) Aylık nakit grafiği — bir AY SONU BAKİYE serisidir; boş dal BASILMADI
  // ve yedi ay etiketi çizildi (kadrajın SVG'si gerçekten doldu).
  await expect(page.getByTestId("na-chart-empty")).toHaveCount(0);
  await expect(page.getByTestId("na-chart").getByRole("img")).toHaveAttribute(
    "aria-label",
    "Aylık nakit pozisyonu — 7 ay, dönem sonu 6.249.500",
  );
  await expect(page.getByTestId("na-chart").locator("text")).toHaveCount(7);

  // (e) 🔴 K8 — projeksiyon kartı DEVRE DIŞI ve gerekçesi GÖRÜNÜR.
  await expect(page.getByTestId("na-projection")).toBeVisible();
  await expect(page.getByTestId("na-projection-reason")).toBeVisible();

  await expect(page.getByTestId("na-export-pdf")).toBeDisabled();
  await expect(page.getByTestId("na-export-reason")).toBeVisible();
  await expect(page.getByTestId("na-error")).toHaveCount(0);

  // 🔴 KULLANICI KARARI 2026-08-27 — bkz. bilanço karesi.
  await expect(page.getByRole("complementary", { name: "Mali tablolar menüsü" })).toHaveCount(0);
  await expect(page.locator("[aria-current='page']")).toHaveText("Mali Tablolar");
  await expect(page.getByTestId("mt-seg-current")).toHaveText("Nakit Akışı");
  await expectNoLoadingText(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("mali-tablolar-nakit-akisi.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 4) E11 · Mali Tablolar kökü = GELİR TABLOSU (Ocak–Temmuz 2026) · MUTABIK dal
// ---------------------------------------------------------------------------
// 🔴 KARE YENİLENDİ VE ADI DEĞİŞTİ: `…-devre-disi` adı bugün YALAN olurdu —
// `GET /income-statement` açıldı ve tablo GERÇEK. Devre dışı kalanlar yalnız
// KAYNAKSIZ yüzeylerdir (sağ sütunun iki kartı + trend sütunu + PDF + proje
// süzgeci) ve kare o kararın nasıl göründüğünü kilitler.
test("mali tablolar gelir tablosu gorsel", async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await openFinancialStatementsHome(page);

  await expect(page.getByRole("heading", { level: 1, name: "Mali Tablolar" })).toBeVisible();

  // 🔴 DRILL SIDEBAR HİÇBİR MALİ TABLO EKRANINDA YOKTUR (kullanıcı kararı
  // 2026-08-27) — üç karenin de sol sütunu artık AYNI ana menüdür.
  await expect(page.getByRole("complementary", { name: "Mali tablolar menüsü" })).toHaveCount(0);

  // Segment denetimi: bulunulan sekme + iki yaprak bağlantısı.
  await expect(page.getByTestId("mt-seg-current")).toHaveText("Gelir Tablosu");
  await expect(page.getByTestId("mt-seg-bilanco")).toHaveText("Bilanço");
  await expect(page.getByTestId("mt-seg-nakit-akisi")).toHaveText("Nakit Akışı");

  // 📅 `page.clock` KANITI: BİRİKİMLİ aralık içinde bulunulan aya kadar.
  await expect(page.getByTestId("mt-period-label")).toHaveText("Ocak–Temmuz 2026");
  await expect(page.getByTestId("mt-is-period-label")).toHaveText("Ocak–Temmuz 2026");
  // İleri ok içinde bulunulan ayda KAPALIdır (geleceğin gelir tablosu yok).
  await expect(page.getByTestId("mt-period-next")).toBeDisabled();

  // 🔴 Damga ("mt-loaded") "veri geldi" der, "ekrana bastı" DEMEZ — tek
  // kaynağın GERÇEK rakamları ayrıca ölçülür (WORKFLOW §4, 5. parça).
  await expect(page.getByTestId("mt-is-table").locator("tbody tr")).toHaveCount(11);
  await expect(page.getByTestId("mt-is-section-revenue-band")).toContainText("GELİRLER");
  await expect(page.getByTestId("mt-is-section-revenue-subtotal")).toContainText("24.994.700");
  await expect(page.getByTestId("mt-is-section-expenses-band")).toContainText("GİDERLER");
  await expect(page.getByTestId("mt-is-section-expenses-subtotal")).toContainText("21.482.000");
  await expect(page.getByTestId("mt-is-profit")).toContainText("3.512.700");
  // 🔴 K2 — gider payı HESAPLANIR, trend HESAPLANMAZ (`—`).
  await expect(page.getByTestId("mt-is-section-expenses-material_costs")).toContainText("%49,9");
  await expect(page.getByTestId("mt-is-profit")).toContainText("%14,1");
  await expect(
    page.getByTestId("mt-is-section-revenue-other_revenue").locator(".fs-is-ratio"),
  ).toHaveText("—");
  await expect(page.getByTestId("mt-is-ratio-note")).toBeVisible();

  // 🔴 K1 — mutabakat şeridi YEŞİL dalda.
  const banner = page.getByTestId("mt-is-banner");
  await expect(banner).toHaveClass(/fs-banner--ok/);
  await expect(banner).toContainText("Mutabık");

  // 🔴 K2 — sağ sütunun İKİ kartı devre dışı, gerekçeleri GÖRÜNÜR; tablo
  // kartı ARTIK DEĞİL (kare bu ayrımı kilitler).
  for (const testId of ["mt-performance", "mt-profitability"]) {
    await expect(page.getByTestId(testId)).toContainText(/./);
    await expect(page.getByTestId(`${testId}-reason`)).toBeVisible();
  }
  await expect(page.getByTestId("mt-income-statement")).not.toHaveClass(/fs-mt-card--disabled/);

  await expect(page.getByTestId("mt-export-pdf")).toBeDisabled();
  await expect(page.getByTestId("mt-export-reason")).toBeVisible();
  await expect(page.getByTestId("mt-project-filter")).toBeDisabled();
  await expect(page.getByTestId("mt-project-filter-reason")).toBeVisible();
  await expect(page.getByTestId("mt-error")).toHaveCount(0);
  await expectNoLoadingText(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("mali-tablolar-gelir-tablosu.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 5) E11 · Gelir Tablosu — 🔴 K1'in AYRIŞIK dalı (Ocak 2026)
// ---------------------------------------------------------------------------
// 🔴 Bu dal HİÇBİR MOCKUP'TA ÇİZİLMEMİŞTİR (E11 `DÖNEM KARI = Toplam Gelir −
// Toplam Gider` özdeşliğini varsayıyor). Ayrışmanın var olduğunu ve nasıl
// göründüğünü YALNIZ bu kare kanıtlar — `mali-tablolar-bilanco-dengesiz`in
// kardeşidir. `DÖNEM KARI` satırı burada da `period_profit` basar.
test("mali tablolar gelir tablosu ayrisik gorsel", async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await openFinancialStatementsHome(page, ACCOUNTING_EMPTY_TIME);

  // 📅 Ocak saatinde aralığın iki ucu AYNIdır ⇒ kısa yazım.
  await expect(page.getByTestId("mt-period-label")).toHaveText("Ocak 2026");
  await expect(page.getByTestId("mt-is-period-label")).toHaveText("Ocak 2026");

  // 🔴 K1 — şerit KIRMIZI dala döndü; farkı ve GEREKÇESİNİ birlikte basar.
  // `≠` glifi YAZILMAZ (F-SEM glif kuralı), "eşit değil" yazılır.
  const banner = page.getByTestId("mt-is-banner");
  await expect(banner).toHaveClass(/fs-banner--off/);
  await expect(banner).toContainText("eşit değil");
  await expect(banner).toContainText("fark: ₺ 51.270");
  await expect(banner).toContainText("maliyet aktarım");

  // 🔴 Kadrajın asıl konusu: kalemlerden çıkan fark (2.499.470 − 2.148.200 =
  // 351.270) ile basılan `DÖNEM KARI` (300.000) FARKLIdır ve sunucununki basılır.
  await expect(page.getByTestId("mt-is-section-revenue-subtotal")).toContainText("2.499.470");
  await expect(page.getByTestId("mt-is-section-expenses-subtotal")).toContainText("2.148.200");
  await expect(page.getByTestId("mt-is-profit")).toContainText("300.000");
  await expect(page.getByTestId("mt-is-table").locator("tbody tr")).toHaveCount(11);
  await expect(page.getByTestId("mt-error")).toHaveCount(0);
  await expectNoLoadingText(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("mali-tablolar-gelir-tablosu-ayrisik.png", {
    fullPage: true,
  });
});

// ---------------------------------------------------------------------------
// 6) IZN-F4b.2 · Gelir Tablosu — rol için GİZLİ tutarlar (maliyet_kar)
// ---------------------------------------------------------------------------
// `/auth/me.hidden_fields = ["maliyet_kar"]` ve `GET /income-statement` yanıtındaki TÜM tutarlar `null`
// YALNIZ bu testte (`page.route`; paylaşılan mock backend'e YAZILMAZ). Beklenen: hücreler `—`, tabloda TEK
// kilit notu, mutabakat şeridi "doğrulanamıyor" (kırmızı "eşit değil" YOK, sahte "Mutabık" YOK).
function maskIncomeStatement(body: Record<string, unknown>): Record<string, unknown> {
  const sections = (body.sections as Array<Record<string, unknown>>).map((section) => ({
    ...section,
    subtotal: null,
    lines: (section.lines as Array<Record<string, unknown>>).map((line) => ({ ...line, amount: null })),
  }));
  return { ...body, sections, total_revenue: null, total_expense: null, period_profit: null };
}

test("muhasebe gelir tablosu gizli gorsel", async ({ page }) => {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await page.route("**/api/auth/me", async (route) => {
    const response = await route.fetch();
    const me = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...me, hidden_fields: ["maliyet_kar"] }),
    });
  });
  await page.route("**/api/backend/income-statement**", async (route) => {
    const response = await route.fetch();
    const body = (await response.json()) as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(maskIncomeStatement(body)),
    });
  });
  await openFinancialStatementsHome(page);

  await expect(page.getByRole("heading", { level: 1, name: "Mali Tablolar" })).toBeVisible();
  await expect(page.getByTestId("mt-is-profit")).toContainText("—");
  await expect(page.getByTestId("mt-is-section-revenue-subtotal")).toContainText("—");
  await expect(page.getByTestId("mt-is-table").locator("tbody tr")).toHaveCount(11);
  await expect(page.getByTestId("fs-masked-note")).toBeVisible();
  await expect(page.getByTestId("mt-is-banner-unverifiable")).toBeVisible();
  await expect(page.getByTestId("mt-is-banner")).toHaveCount(0);
  await expect(page.getByTestId("mt-error")).toHaveCount(0);
  await expectNoLoadingText(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("muhasebe-gelir-tablosu-gizli.png", { fullPage: true });
});
