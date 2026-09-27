import { test, expect, type Page, type Route } from "@playwright/test";

import { prepareFrame } from "./visual-scroll";

// F-FAT2 T3 · Fatura ekranlarının GÖRSEL spec'i. Kanonik mockup'lar:
// `Fatura Yönetimi.dc.html` (FY) · `Fatura - Kes.dc.html` (FK) ·
// `Fatura - Giden Detay.dc.html` (FGI) · `Fatura - Gelen Detay.dc.html` (FGE).
// Desen `hr-documents-visual.spec.ts` + `purchasing-visual-helpers.ts`.
//
// 🔴 BAŞLIK KURALI: her testin adında "gorsel" GEÇER. Beşinci kapı
// `--grep-invert "gorsel"` ile BAŞLIĞA göre süzer; içermeyen bir görsel test
// fonksiyonel turda baseline'sız koşar ve KIRMIZI olur.
//
// SALT-OKUR: bu dosya hiçbir POST/PATCH/DELETE tetiklemez. `/faturalar/kes`
// kadrajında form DOLDURULUR ama KAYDEDİLMEZ — kesme formunun tutar önizlemesi
// (FK:246-250) tamamen istemci tarafındadır, ağa çıkmaz.
//
// 📅 SAAT DONDURULUR (`page.clock`): üç ayrı yüzey YEREL takvimden türer —
//   1. `/faturalar` giden tablosu ay penceresine süzülür (`monthRangeOf`,
//      `invoice-labels.ts`) ve başlık ayı yazar ("Temmuz 2026");
//   2. giden detayın vade satırı kalan günü sayar (FGI:68);
//   3. kesme formunun fatura tarihi ile tahsilat formunun tarih alanı
//      `isoDate(new Date())` ile dolar.
// Asıl tehlike turun GECE YARISINI geçmesidir: aynı koşuda bir kare 24, öbürü
// 23 gün yazardı. Saat `page.goto`dan ÖNCE kurulur.
const FIXED_TIME = new Date("2026-07-25T09:00:00");

// ---------------------------------------------------------------------------
// 🔒 FİKSTÜR SABİTLEME — gelen fatura listesi
// ---------------------------------------------------------------------------
// Mock durumu tüm koşu boyunca TEKtir ve spec'ler PARALEL koşar
// (`fullyParallel: true`). Bu dilimin yazma e2e'si (`invoices.spec.ts`) iki
// KALICI kayıt doğurur/oynatır:
//   · `inv-in-mut` — onay akışı testinin mutasyon alanı (pending → approved).
//     Gelen tablosunda görünür; onaylandığında satır kaybolur ⇒ kadraj kâh üç
//     kâh iki satır basardı.
//   · `inv-new-*`  — taslak kaydetme testinin ürettiği giden faturalar. Bunlar
//     zaten Temmuz penceresinin DIŞINDA (2026-05-05) doğar, yani giden
//     tablosuna girmezler; ön ek yine de ayıklanır ki kadraj o tarihe
//     BAĞIMLI kalmasın.
// `playwright.config.ts`te eşik ayarı yoktur: iki varyanttan hangisi
// baseline'a girerse öbürü CI'da KIRMIZI olur (F-PT `pinRoster` / F-SA
// `pinPurchasingFixtures` dersleriyle AYNI sınıf).
//
// Sabitleme KİMLİK tabanlıdır — `dropCreatedSuppliers` deseninin aynısı:
// yanıt SUNUCUDAN alınır, yalnız koşu sırasında doğan/oynatılan kimlikler
// ayıklanır ve `total` süzülmüş sayıya çekilir (yoksa kırpılma bandı sahte
// biçimde açılırdı). Kadrajın gördüğü HER DEĞER yine sunucudan gelir; hiçbir
// alan uydurulmaz.
const INVOICES_LIST_PATH = "/api/backend/invoices";

/** Koşu sırasında doğan/oynatılan fatura kimliklerinin ön ekleri. */
const RUN_OWNED_ID_PREFIXES = ["inv-in-mut", "inv-new-"] as const;

interface InvoiceListBody {
  items: { id: string }[];
  total: number;
}

async function dropRunOwnedInvoices(route: Route) {
  const response = await route.fetch();
  const body = (await response.json()) as InvoiceListBody;
  const items = body.items.filter(
    (item) => !RUN_OWNED_ID_PREFIXES.some((prefix) => item.id.startsWith(prefix)),
  );

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ...body, items, total: items.length }),
  });
}

/** Fatura listelerini tohum fikstürlere sabitler. NAVİGASYONDAN ÖNCE çağrılır. */
async function pinInvoiceFixtures(page: Page) {
  await page.route((url) => url.pathname === INVOICES_LIST_PATH, dropRunOwnedInvoices);
}

async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(FIXED_TIME);
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/** Hiçbir kadrajda yükleme metni KALMAZ (WORKFLOW §4, 1. parça). */
async function expectNoLoadingText(page: Page) {
  await expect(page.getByText("Yükleniyor…")).toHaveCount(0);
  await expect(page.getByText("Şirket künyesi yükleniyor…")).toHaveCount(0);
}

test("fatura listesi giden sekmesi gorsel", async ({ page }) => {
  await login(page);
  await pinInvoiceFixtures(page);
  await page.goto("/faturalar");

  // YERLEŞİM OTURDU — ÜÇ BAĞIMSIZ KAYNAK, ÜÇ AYRI İDDİA (WORKFLOW §4, 5.
  // parça). `InvoicesView.tsx:334-336` bayrakları `hidden` span'lerdir:
  // `toBeVisible` YANLIŞ olurdu, bağlılık (`toBeAttached`) ölçülür.
  await expect(page.getByTestId("fat-loaded-summary")).toBeAttached();
  await expect(page.getByTestId("fat-loaded-outgoing")).toBeAttached();
  await expect(page.getByTestId("fat-loaded-incoming")).toBeAttached();

  // Bayrak "veri geldi" der, "ekrana bastı" demez — üç yüzeyin de GERÇEK
  // rakamı kadrajda olmalı.
  await expect(page.getByRole("heading", { level: 1, name: "Fatura Yönetimi" })).toBeVisible();
  await expect(page.getByTestId("fat-kpi-issued")).toContainText("₺4,92M");
  // 📅 `page.clock` KANITI: başlık ve tablo Temmuz 2026'ya süzülü, tablo BOŞ
  // değil. Saat dondurulmasaydı gerçek ay süzülür, bu satırlar düşerdi.
  await expect(page.locator("main").getByText("Giden Faturalar — Temmuz 2026")).toBeVisible();
  await expect(page.locator('main [data-invoice-id="inv-out-1"]')).toBeVisible();
  await expect(page.locator('main [data-invoice-id="inv-out-2"]')).toBeVisible();
  // Gelen (onay bekleyen) tablosu: sabitleme sonrası İKİ tohum satır.
  await expect(page.getByTestId("fat-incoming-row")).toHaveCount(2);
  await expect(page.locator('main [data-invoice-id="inv-in-1"]')).toBeVisible();
  await expect(page.locator('main [data-invoice-id="inv-in-2"]')).toBeVisible();
  await expect(page.locator('main [data-invoice-id="inv-in-mut"]')).toHaveCount(0);
  await expectNoLoadingText(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("faturalar-liste-giden.png", { fullPage: true });
});

test("fatura listesi gelen sekmesi gorsel", async ({ page }) => {
  await login(page);
  await pinInvoiceFixtures(page);
  await page.goto("/faturalar?tab=gelen");

  // İKİ BAĞIMSIZ KAYNAK: giden sorgusu bu sekmede KAPALIdır
  // (`InvoicesView.tsx:76` → `enabled: tab === "giden"`), bu yüzden
  // `fat-loaded-outgoing` beklenmez — beklemek testi süresiz askıya alırdı.
  await expect(page.getByTestId("fat-loaded-summary")).toBeAttached();
  await expect(page.getByTestId("fat-loaded-incoming")).toBeAttached();
  await expect(page.getByTestId("fat-loaded-outgoing")).toHaveCount(0);

  await expect(page.getByRole("heading", { level: 1, name: "Fatura Yönetimi" })).toBeVisible();
  await expect(page.getByTestId("fat-kpi-issued")).toContainText("₺4,92M");
  // Durum süzgeci kalkar: iki tohum satır (biri kira kaynaklı, biri sipariş).
  await expect(page.getByTestId("fat-incoming-row")).toHaveCount(2);
  await expect(page.locator('main [data-invoice-id="inv-in-1"]')).toBeVisible();
  await expect(page.locator('main [data-invoice-id="inv-in-2"]')).toContainText("Onay Bekliyor");
  await expect(page.locator('main [data-invoice-id="inv-in-mut"]')).toHaveCount(0);
  // Giden paneli bu sekmede HİÇ basılmaz.
  await expect(page.getByTestId("fat-outgoing-table")).toHaveCount(0);
  await expectNoLoadingText(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("faturalar-liste-gelen.png", { fullPage: true });
});

test("fatura kesme formu gorsel", async ({ page }) => {
  await login(page);
  await page.goto("/faturalar/kes");

  // İKİ BAĞIMSIZ KAYNAK (`InvoiceCreateView.tsx:707-709`).
  await expect(page.getByTestId("fat-loaded-employers")).toBeAttached();
  await expect(page.getByTestId("fat-loaded-progress-payments")).toBeAttached();

  // 🔴 KALEMLER DOLU KADRAJI: boş formda FK:225-250'nin HEPSİ "—" basar ve
  // T2b'nin porta ettiği yedi adım kadrajda hiç görünmezdi. Satırlar
  // `inv-out-1`in kendi kalemleridir (mockup rakamları).
  const firstRow = page.getByTestId("fat-line-row").first();
  await firstRow.getByLabel("1. kalem açıklaması").fill("Kat Döşemesi Betonu C25/30 (Poz 03.001)");
  await firstRow.getByLabel("1. kalem birimi").fill("m³");
  await firstRow.getByLabel("1. kalem miktarı").fill("1320");
  await firstRow.getByLabel("1. kalem birim fiyatı").fill("2113");

  await page.getByTestId("fat-line-add").click();
  const secondRow = page.getByTestId("fat-line-row").nth(1);
  await secondRow.getByLabel("2. kalem açıklaması").fill("Kolon Betonu C30/37 (Poz 03.002)");
  await secondRow.getByLabel("2. kalem birimi").fill("m³");
  await secondRow.getByLabel("2. kalem miktarı").fill("300");
  await secondRow.getByLabel("2. kalem birim fiyatı").fill("2398");

  // FK:222-233 — mockup'ın kendi kesinti kurgusu: avans %20 + teminat %5
  // işaretli, tevkifat (FK:237) işaretsiz.
  await page.getByTestId("fat-advance-toggle").check();
  await page.getByTestId("fat-retention-toggle").check();

  // Önizleme GERÇEK rakam basıyor (T2b): her hücre tek tek ölçülür.
  await expect(page.getByTestId("fat-subtotal-preview")).toHaveText("3.508.560");
  await expect(page.getByTestId("fat-advance-amount")).toHaveText("– 701.712");
  await expect(page.getByTestId("fat-retention-amount")).toHaveText("– 175.428");
  await expect(page.getByTestId("fat-deduction-total")).toHaveText("– 877.140");
  await expect(page.getByTestId("fat-tax-base")).toHaveText("2.631.420");
  await expect(page.getByTestId("fat-vat-amount")).toHaveText("+ 526.284");
  await expect(page.getByTestId("fat-total")).toHaveText("₺3.157.704");
  // 🔴 Kadrajdaki TEK "—" burasıdır ve mockup'ın kendi hücresidir (FK:237,
  // kutu işaretli değil) — eksik veri değil, KAPALI kesinti.
  await expect(page.getByTestId("fat-withholding-amount")).toHaveText("—");
  // 📅 `page.clock` KANITI: fatura tarihi dondurulmuş günden dolar.
  await expect(page.getByTestId("fat-issue-date")).toHaveValue("25.07.2026");
  await expectNoLoadingText(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("faturalar-kes.png", { fullPage: true });
});

test("giden fatura detayi gorsel", async ({ page }) => {
  await login(page);
  await page.goto("/faturalar/inv-out-1");

  // DÖRT BAĞIMSIZ KAYNAK: detay + şirket künyesi (`InvoiceDetailView.tsx:
  // 375-376`) + tahsilat satırları + banka hesapları (`InvoicePaymentsPanel.
  // tsx:257-258`). Şirket künyesi ayrı ölçülür: yüklenmeden "Satıcı (Biz)"
  // bloğu "Şirket künyesi yükleniyor…" basar ve kare o hâli dondururdu.
  await expect(page.getByTestId("fat-loaded-detail")).toBeAttached();
  await expect(page.getByTestId("fat-loaded-company")).toBeAttached();
  await expect(page.getByTestId("fat-loaded-payments")).toBeAttached();
  await expect(page.getByTestId("fat-loaded-accounts")).toBeAttached();
  // 🔴 OLUMSUZ İDDİA: makine kira bağı OLMAYAN faturada beşinci kaynak HİÇ
  // açılmaz (`useInvoiceRentalMatch(null)` → `enabled: false`). Bayrak
  // basılıyor olsaydı "yüklendi" iddiası yanlış kaynağı ölçerdi.
  await expect(page.getByTestId("fat-loaded-rental")).toHaveCount(0);
  await expect(page.getByTestId("fat-match-table")).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "FIL2026000184" })).toBeVisible();
  await expect(page.getByTestId("fat-hero-total")).toHaveText("₺3.157.704");
  // 📅 `page.clock` KANITI: kalan gün 25.07 → 18.08 farkından türer.
  await expect(page.getByTestId("fat-hero-due")).toHaveText("Vade: 18.08.2026 (24 gün)");
  await expect(page.getByTestId("fat-party-buyer")).toContainText("Güneşkent Gayrimenkul A.Ş.");
  await expect(page.getByTestId("fat-detail-total-row")).toContainText("3.157.704");
  // K5 türev toplamları: "—" değil, sunucunun rakamı.
  await expect(page.getByTestId("fat-paid-total")).toHaveText("0");
  await expect(page.getByTestId("fat-remaining")).toHaveText("3.157.704");
  await expectNoLoadingText(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("faturalar-detay-giden.png", { fullPage: true });
});

test("gelen fatura detayi gorsel", async ({ page }) => {
  await login(page);
  await page.goto("/faturalar/inv-in-1");

  // BEŞ BAĞIMSIZ KAYNAK: dördü giden detayla aynı + makine kira eşleştirmesi
  // (`InvoiceDetailView.tsx:377`). Eşleştirme kartı KENDİ yükleme yolunu
  // işletir; bayrağı beklemeden alınan kare kartı iskelet hâlinde dondururdu.
  await expect(page.getByTestId("fat-loaded-detail")).toBeAttached();
  await expect(page.getByTestId("fat-loaded-company")).toBeAttached();
  await expect(page.getByTestId("fat-loaded-payments")).toBeAttached();
  await expect(page.getByTestId("fat-loaded-accounts")).toBeAttached();
  await expect(page.getByTestId("fat-loaded-rental")).toBeAttached();

  await expect(page.getByRole("heading", { name: "LT2026070184" })).toBeVisible();
  await expect(page.getByTestId("fat-direction-badge")).toHaveText("GELEN FATURA");
  await expect(page.getByTestId("fat-party-buyer")).toContainText("Alıcı (Biz)");
  // FGE:116-129 — iki eşleştirme satırı ve fark bandı kadrajda.
  await expect(page.getByTestId("fat-match-row")).toHaveCount(2);
  await expect(page.getByTestId("fat-match-warning")).toContainText("1 ekipmanda");
  await expect(page.getByTestId("fat-hero-total")).toHaveText("₺146.995");
  await expectNoLoadingText(page);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("faturalar-detay-gelen.png", { fullPage: true });
});
