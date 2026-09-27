import { test, expect, type Page } from "@playwright/test";

// F-FAT2 T2 · Fatura ekranlarının FONKSİYONEL e2e'si — görsel spec AYRI
// dosyadadır (bu dosyanın adında "gorsel" GEÇMEZ ki beşinci kapıda koşsun).
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (F-P6 dersi): akış-SSR ikinci bir kopya
// bastığında `alert` rolü çift eşleşir ve test YALNIZ Linux CI'da patlar.
//
// 📅 SAAT DONDURULUR: `/faturalar` giden tablosu YEREL takvim ayına süzülür
// (FY:90 başlığı bir ay yazar). Fikstürler Temmuz 2026'dadır; saat
// dondurulmasaydı ekran gerçek aya süzer ve tablo BOŞ inerdi.
const FIXED_TIME = new Date("2026-07-25T09:00:00");

// 🔒 YARIŞ KONTROLÜ: sahte backend'in fatura durumu YAZILABİLİRDİR. Durum
// oynatan testler AYRI faturalar kullanır ve KAYIT SAYISI iddiaları yalnız
// oynatılmayan satırlar üzerinde kurulur.
//
// 🔴 T3 DÜZELTMESİ: onay testi ÖNCE `inv-in-2`yi oynatıyordu; o kayıt hem
// aşağıdaki "kaynak çipi" testinin hem de iki görsel kadrajın gördüğü bir
// TOHUM satırdır. `fullyParallel: true` dosya İÇİNDEKİ sıraya da garanti
// vermediği için bu, ölçülebilir bir yarıştı. Mutasyon artık yalnız o test
// tarafından kullanılan `inv-in-mut` kaydındadır (bkz. `e2e/mock-backend.ts`).
// `inv-out-1`e yazılan tahsilat sunucuda REDDEDİLİR (K6) — durum değişmez.

async function login(page: Page) {
  await page.clock.setFixedTime(FIXED_TIME);
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

async function openInvoices(page: Page) {
  await login(page);
  await page.goto("/faturalar");
  await expect(page.getByTestId("fat-loaded-outgoing")).toBeAttached();
}

test("kabuk sidebar'ındaki 'Fatura Yönetimi' gerçek ekranı açar (ComingSoon DEĞİL)", async ({
  page,
}) => {
  await login(page);

  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Fatura Yönetimi" })
    .first()
    .click();

  await expect(page).toHaveURL(/\/faturalar$/);
  await expect(page.getByRole("heading", { level: 1, name: "Fatura Yönetimi" })).toBeVisible();
  await expect(page.locator("main").getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
  await expect(page.getByTestId("fat-kpis")).toBeVisible();
});

test("KPI şeridi BEŞ kartı sunucudan basar; 'Onay Bekleyen' ADETtir", async ({ page }) => {
  await openInvoices(page);
  await expect(page.getByTestId("fat-loaded-summary")).toBeAttached();

  // FY:70-72 — kompakt para biçimi (₺ bitişik, iki ondalık).
  await expect(page.getByTestId("fat-kpi-issued")).toContainText("₺4,92M");
  await expect(page.getByTestId("fat-kpi-issued")).toContainText("18 fatura");
  await expect(page.getByTestId("fat-kpi-received")).toContainText("₺3,84M");
  await expect(page.getByTestId("fat-kpi-receivable")).toContainText("4 fatura vadeli");

  // 🔴 FY:74 — tek SAYI, para DEĞİL: `₺` basılmaz.
  const pending = page.getByTestId("fat-kpi-pending");
  await expect(pending).toContainText("3");
  await expect(pending).not.toContainText("₺");
});

test("giden tablo AY penceresine süzülür — önceki ayın taslağı listede YOKTUR", async ({
  page,
}) => {
  await openInvoices(page);

  // Başlık ayı yazar (FY:90) ve liste GERÇEKTEN o aya süzülür.
  await expect(page.locator("main").getByText("Giden Faturalar — Temmuz 2026")).toBeVisible();
  await expect(page.locator('main [data-invoice-id="inv-out-1"]')).toBeVisible();
  await expect(page.locator('main [data-invoice-id="inv-out-2"]')).toBeVisible();
  // 🔴 BEKÇİ: 2026-06 tarihli taslak Temmuz penceresine GİRMEZ.
  await expect(page.locator('main [data-invoice-id="inv-out-old"]')).toHaveCount(0);
});

test("🔴 K1: 'Vadeli' AYRI DURUM DEĞİLDİR — vadesi olan `sent` öyle rozetlenir", async ({
  page,
}) => {
  await openInvoices(page);

  // inv-out-1: status=sent + due_date DOLU → "Vadeli"
  await expect(page.locator('main [data-invoice-id="inv-out-1"]')).toContainText("Vadeli");
  // inv-out-2: status=collected → "Tahsil Edildi"
  await expect(page.locator('main [data-invoice-id="inv-out-2"]')).toContainText("Tahsil Edildi");
  await expect(page.locator('main [data-invoice-id="inv-out-2"]')).not.toContainText("Vadeli");

  // Matrah/KDV/Toplam sunucudan, `₺` SEMBOLSÜZ (FY:115-117).
  const row = page.locator('main [data-invoice-id="inv-out-1"]');
  await expect(row).toContainText("2.631.420");
  await expect(row).toContainText("526.284");
  await expect(row).toContainText("3.157.704");
});

test("'Vadeli' süzgeci sunucuya `sent` gönderir ve bunu GÖRÜNÜR biçimde söyler", async ({
  page,
}) => {
  await openInvoices(page);

  const request = page.waitForRequest(
    (req) => req.url().includes("/invoices?") && req.url().includes("status=sent"),
  );
  await page.getByTestId("fat-status-filter").selectOption("due");
  await request;

  await expect(page.getByTestId("fat-due-filter-notice")).toContainText(
    "“Vadeli” ayrı bir durum değildir",
  );
  // Tahsil edilmiş fatura süzgeç dışında kalır.
  await expect(page.locator('main [data-invoice-id="inv-out-2"]')).toHaveCount(0);
});

test("arama kutusu `q`yu SUNUCUYA gönderir (istemcide süzme YOK)", async ({ page }) => {
  await openInvoices(page);

  const request = page.waitForRequest(
    (req) => req.url().includes("/invoices?") && req.url().includes("q=%C3%87elik"),
  );
  await page.getByTestId("fat-search").fill("Çelik");
  await page.getByTestId("fat-search").press("Enter");
  await request;

  await expect(page.locator('main [data-invoice-id="inv-out-2"]')).toBeVisible();
  await expect(page.locator('main [data-invoice-id="inv-out-1"]')).toHaveCount(0);
});

test("GİB yüzeyleri ve iki sekme DEVRE DIŞIdır, gerekçeleri GÖRÜNÜR", async ({ page }) => {
  await openInvoices(page);

  const reason = "e-Fatura/GİB entegrasyonu henüz açılmadı.";
  await expect(page.getByTestId("fat-gib-pull")).toBeDisabled();
  await expect(page.getByTestId("fat-gib-pull")).toHaveAttribute("title", reason);
  await expect(page.getByTestId("fat-gib-reason")).toContainText(reason);
  await expect(page.getByTestId("fat-gib-badge")).toHaveAttribute("title", reason);

  // FY:64-65 — sekmeler SİLİNMEDİ, devre dışı.
  await expect(page.getByTestId("fat-tab-earsiv")).toBeDisabled();
  await expect(page.getByTestId("fat-tab-earsiv")).toHaveAttribute(
    "title",
    "e-Arşiv sekmesi için belge tipi süzgeci liste ucunda yok.",
  );
  await expect(page.getByTestId("fat-tab-itiraz")).toBeDisabled();

  // FY:106 "GİB" sütunu: hücre "—" basar, bant gerekçeyi yazar.
  await expect(page.getByTestId("fat-outgoing-pending-notice")).toContainText(reason);
});

test("kaynak çipi: rotası OLAN hakediş bağlantıdır, olmayan sipariş solgun çiptir", async ({
  page,
}) => {
  await openInvoices(page);

  // inv-out-1 → progress_payment_id = pp-1
  const link = page.locator('main [data-invoice-id="inv-out-1"]').getByRole("link", {
    name: /İşveren Hakedişi/,
  });
  await expect(link).toHaveAttribute("href", "/hakedisler/pp-1");

  // inv-in-2 → purchase_order_id: rota YOK ⇒ bağlantı UYDURULMAZ.
  const chip = page.locator('main [data-invoice-id="inv-in-2"]').getByText("Satınalma Siparişi");
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("title", "Sipariş detay ekranı henüz yazılmadı.");
  await expect(
    page.locator('main [data-invoice-id="inv-in-2"]').getByRole("link", { name: /Satınalma/ }),
  ).toHaveCount(0);
});

test("gelen fatura listeden ONAYLANIR (gerçek uç) ve onay bekleyenlerden düşer", async ({
  page,
}) => {
  await openInvoices(page);

  // 🔒 Yalnız BU test `inv-in-mut`u oynatır (tohum satırlara DOKUNULMAZ).
  const row = page.locator('main [data-invoice-id="inv-in-mut"]');
  await expect(row).toContainText("Onay Bekliyor");
  await row.getByTestId("fat-incoming-approve").click();

  await expect(page.locator('main [data-invoice-id="inv-in-mut"]')).toHaveCount(0);
  await expect(page.getByTestId("fat-approve-error")).toHaveCount(0);
});

test("giden fatura detayı: toplamlar SUNUCUNUN, dışa aktarma ve GİB geçmişi devre dışı", async ({
  page,
}) => {
  await login(page);
  await page.goto("/faturalar/inv-out-1");
  await expect(page.getByTestId("fat-loaded-detail")).toBeAttached();

  await expect(page.getByTestId("fat-direction-badge")).toHaveText("GİDEN FATURA");
  await expect(page.getByRole("heading", { name: "FIL2026000184" })).toBeVisible();
  await expect(page.getByTestId("fat-hero-total")).toHaveText("₺3.157.704");
  // FGI:68 — vade + kalan gün YEREL takvimden (25.07 → 18.08 = 24 gün).
  await expect(page.getByTestId("fat-hero-due")).toHaveText("Vade: 18.08.2026 (24 gün)");
  await expect(page.getByTestId("fat-status-badge")).toHaveText("Vadeli");

  // tfoot: kesinti satırları oranlı, toplam sunucudan.
  const lines = page.getByTestId("fat-detail-lines");
  await expect(lines).toContainText("Avans Kesintisi (%20)");
  await expect(lines).toContainText("– 701.712");
  await expect(lines).toContainText("Teminat Kesintisi (%5)");
  await expect(lines).toContainText("Vergi Matrahı");
  await expect(page.getByTestId("fat-detail-total-row")).toContainText("3.157.704");

  // FGI:24-25 — SİLİNMEDİ, devre dışı.
  await expect(page.getByTestId("fat-action-pdf")).toBeDisabled();
  await expect(page.getByTestId("fat-action-xml")).toBeDisabled();
  await expect(page.getByTestId("fat-action-pdf")).toHaveAttribute(
    "title",
    "Fatura PDF/XML dışa aktarma ucu henüz açılmadı.",
  );
  // FGI:193-217 · FGE:197-241 — paneller yerinde, gerekçeleri görünür.
  await expect(page.getByTestId("fat-gib-timeline")).toContainText(
    "GİB işlem geçmişi kaydı tutulmuyor.",
  );
  await expect(page.getByTestId("fat-accounting-preview")).toContainText(
    "Muhasebe (yevmiye) kaydı bu dilimde üretilmiyor.",
  );

  // FGI:74/83 — satıcı BİZ, alıcı karşı taraf.
  await expect(page.getByTestId("fat-party-seller")).toContainText("Satıcı (Biz)");
  await expect(page.getByTestId("fat-party-buyer")).toContainText(
    "Güneşkent Gayrimenkul A.Ş.",
  );
});

test("gelen fatura detayı: eşleştirme kartı MAKİNE KİRA faturasından gelir", async ({ page }) => {
  await login(page);
  await page.goto("/faturalar/inv-in-1");
  await expect(page.getByTestId("fat-loaded-detail")).toBeAttached();
  await expect(page.getByTestId("fat-loaded-rental")).toBeAttached();

  await expect(page.getByTestId("fat-direction-badge")).toHaveText("GELEN FATURA");
  // FGE:93 — alıcı BİZ, satıcı karşı taraf (giden detayın TERSİ).
  await expect(page.getByTestId("fat-party-seller")).toContainText("Liebherr Türkiye A.Ş.");
  await expect(page.getByTestId("fat-party-buyer")).toContainText("Alıcı (Biz)");

  // FGE:116-129 — iki satır, biri eşleşen biri FAZLA.
  await expect(page.getByTestId("fat-match-row")).toHaveCount(2);
  await expect(page.locator('[data-variance="match"]')).toContainText("Eşleşiyor");
  const over = page.locator('[data-variance="over"]');
  await expect(over).toContainText("Ekskavatör CAT 320");
  await expect(over).toContainText("152 saat"); // bizim kayıt
  await expect(over).toContainText("158 saat"); // fatura
  await expect(over).toContainText("Fark Var");
  await expect(page.getByTestId("fat-match-warning")).toContainText(
    "1 ekipmanda fatura saati bizim kaydımızdan FAZLA.",
  );

  // FGE:140 — "Kısmi Onayla" SİLİNMEZ, devre dışı.
  await expect(page.getByTestId("fat-partial-approve")).toBeDisabled();

  // Giden detaya özgü künye şeridi burada BASILMAZ (FGE onu çizmez).
  await expect(page.getByTestId("fat-hero-meta")).toHaveCount(0);
});

test("🔴 makine kira bağı OLMAYAN gelen faturada eşleştirme kartı HİÇ basılmaz", async ({
  page,
}) => {
  await login(page);
  await page.goto("/faturalar/inv-in-2");
  await expect(page.getByTestId("fat-loaded-detail")).toBeAttached();

  await expect(page.getByTestId("fat-direction-badge")).toHaveText("GELEN FATURA");
  // Devre-dışı bant DA basılmaz: o veri bu fatura için ANLAMSIZDIR.
  await expect(page.getByTestId("fat-match-table")).toHaveCount(0);
  await expect(page.getByTestId("fat-match-error")).toHaveCount(0);
});

test("🔴 K6: fatura tutarını AŞAN tahsilat sunucuda reddedilir ve metni ekrana basılır", async ({
  page,
}) => {
  await login(page);
  await page.goto("/faturalar/inv-out-1");
  await expect(page.getByTestId("fat-loaded-payments")).toBeAttached();

  // K5 türev toplamları sunucudan gelir (istemcide toplanmaz).
  await expect(page.getByTestId("fat-paid-total")).toHaveText("0");
  await expect(page.getByTestId("fat-remaining")).toHaveText("3.157.704");

  await page.getByTestId("fat-payment-account").selectOption({ index: 1 });
  await page.getByTestId("fat-payment-amount").fill("99999999");
  await page.getByTestId("fat-payment-submit").click();

  await expect(page.getByTestId("fat-payment-error")).toHaveText(
    "Tahsilat toplamı fatura tutarını aşamaz.",
  );
});

test("fatura kesme formu: FK:246-250 özeti uçtan uca hesaplanır", async ({
  page,
}) => {
  await login(page);
  await page.goto("/faturalar/kes");

  // FK:67-74 — "Siparişten" kartı SİLİNMEDİ, devre dışı.
  await expect(page.getByTestId("fat-source-siparis")).toBeDisabled();
  await expect(page.getByTestId("fat-source-siparis")).toHaveAttribute(
    "title",
    "Siparişten fatura doldurma ucu henüz açılmadı.",
  );

  const row = page.getByTestId("fat-line-row").first();
  await row.getByLabel("1. kalem açıklaması").fill("Kat Döşemesi Betonu C25/30");
  await row.getByLabel("1. kalem miktarı").fill("1320");
  await row.getByLabel("1. kalem birim fiyatı").fill("2113");

  // FK:183 — mockup'ın kendi rakamı.
  await expect(row.getByTestId("fat-line-total")).toHaveText("2.789.160");
  await expect(page.getByTestId("fat-subtotal-preview")).toHaveText("2.789.160");

  // FK:246-250 — kesinti YOKken matrah = ara toplam, KDV %20.
  await expect(page.getByTestId("fat-tax-base")).toHaveText("2.789.160");
  await expect(page.getByTestId("fat-vat-amount")).toHaveText("+ 557.832");
  await expect(page.getByTestId("fat-total")).toHaveText("₺3.346.992");
  // FK:237 — tevkifat kutusu işaretsiz: mockup'ın "—" hücresi.
  await expect(page.getByTestId("fat-withholding-amount")).toHaveText("—");

  // FK:222-227 — avans %20 işaretlenince matrah DÜŞER, KDV matrah üzerinden
  // yeniden hesaplanır (kesintinin matrahı ara toplam, KDV'ninki matrah).
  await page.getByTestId("fat-advance-toggle").check();
  await expect(page.getByTestId("fat-advance-amount")).toHaveText("– 557.832");
  await expect(page.getByTestId("fat-deduction-total")).toHaveText("– 557.832");
  await expect(page.getByTestId("fat-tax-base")).toHaveText("2.231.328");
  await expect(page.getByTestId("fat-vat-amount")).toHaveText("+ 446.265,6");
  await expect(page.getByTestId("fat-total")).toHaveText("₺2.677.593,6");

  // 🔴 Önizleme OTORİTE DEĞİL — ekran bunu söyler.
  await expect(page.getByTestId("fat-totals-reason")).toContainText(
    "Tutarlar ÖNİZLEMEDİR; kaydedilen değerleri sunucu hesaplar",
  );
});

test("form taslak kaydeder ve yeni faturanın DETAYINA götürür", async ({ page }) => {
  await login(page);
  await page.goto("/faturalar/kes");

  await page.getByTestId("fat-party-name").fill("Test Alıcı A.Ş.");
  // 🔒 Tarih Temmuz penceresinin DIŞINDA seçilir: yeni kayıt başka testlerin
  // liste iddialarını kirletmesin.
  await page.getByTestId("fat-issue-date").fill("05.05.2026");

  const row = page.getByTestId("fat-line-row").first();
  await row.getByLabel("1. kalem açıklaması").fill("Deneme kalemi");
  await row.getByLabel("1. kalem miktarı").fill("10");
  await row.getByLabel("1. kalem birim fiyatı").fill("100");

  await page.getByTestId("fat-save-draft").click();

  await expect(page).toHaveURL(/\/faturalar\/inv-new-\d+$/);
  await expect(page.getByTestId("fat-status-badge")).toHaveText("Taslak");
  // Sunucunun hesabı: 10 × 100 = 1.000 matrah, %20 KDV → 1.200.
  await expect(page.getByTestId("fat-hero-total")).toHaveText("₺1.200");
});

test("boş açıklamalı kalem sunucuya GİTMEDEN reddedilir (sessiz veri kaybı yok)", async ({
  page,
}) => {
  await login(page);
  await page.goto("/faturalar/kes");

  await page.getByTestId("fat-party-name").fill("Test Alıcı A.Ş.");
  const row = page.getByTestId("fat-line-row").first();
  await row.getByLabel("1. kalem miktarı").fill("5");

  await page.getByTestId("fat-save-draft").click();

  await expect(page.getByTestId("fat-form-error")).toHaveText(
    "1. kalemin açıklaması boş olamaz.",
  );
  await expect(page).toHaveURL(/\/faturalar\/kes$/);
});
