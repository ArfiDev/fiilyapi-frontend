import { test, expect, type Page } from "@playwright/test";

// F-ST T3 · Şantiye › Stok (ŞS) FONKSİYONEL e2e'si — görsel spec'ler T5'te
// (dosya adında "gorsel"/"visual" GEÇMEZ ki beşinci kapıda koşsun).
//
// Kapsam: şantiye sekmesinin ComingSoon'dan ÇIKTIĞI · sekme aktifliğinin TEK
// olduğu (F-SD çift aktiflik dersi) · KPI şeridi + tablo satırlarının SUNUCU
// verisinden geldiği · pending iki sütunun gerekçeli "—" bastığı · satır
// aksiyonlarının devre dışı olduğu · "+ Stok Girişi" link hedefi · şantiye
// bakiyesinin MERKEZ depoyu KAPSAMADIĞI (telden görülen kapsam kuralı).
//
// 🔒 FİKSTÜR İZOLASYONU (T1/T2 kuralı): stok kayıtlarının PROJE KAPSAMI YOKTUR;
// başarılı bir yazma T5'in görsel baseline'larını sessizce kırar. Bu dosya
// YALNIZ OKUR.

const SITE_STOCK_URL = "/projeler/p-1/santiyeler/s-1/stok";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("'Stok' sekmesi gerçek ekranı açar (ComingSoon DEĞİL) ve TEK sekme aktiftir", async ({
  page,
}) => {
  await login(page);
  await page.goto("/projeler/p-1/santiyeler/s-1");

  // SEKME-F1.4b: kabuk-düzeyi çalışma sekmeleri şeridi de `role="tab"`
  // taşıyor (`aria-label="Çalışma sekmeleri"`) — bu ekranın KENDİ drill
  // sekmeleri (`aria-label="Şantiye detay sekmeleri"`) locator'ı artık
  // yalnız daralttıktan sonra tekil eşleşir (e2e düzeltmesi — ürün davranışı
  // DEĞİŞMEDİ; iki şerit de kendi başına AYRI aktiflik taşıması BEKLENİR).
  const siteTabs = page.getByRole("tablist", { name: "Şantiye detay sekmeleri" });

  await siteTabs.getByRole("tab", { name: "Stok" }).click();
  await expect(page).toHaveURL(/\/santiyeler\/s-1\/stok$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi — Stok Durumu" }),
  ).toBeVisible();
  await expect(page.getByText("Bu modül yakında eklenecek.")).toHaveCount(0);

  // Çift aktiflik olmaz: kök sekme ("Bölümler") ön ek eşleşmesiyle seçilmez.
  await expect(siteTabs.locator('[role="tab"][aria-selected="true"]')).toHaveCount(1);
  await expect(siteTabs.getByRole("tab", { name: "Stok" })).toHaveAttribute("aria-selected", "true");
  // 🔴 DRILL-KALDIR (kullanıcı kararı 2026-08-29) — KULLANICININ BİLDİRDİĞİ
  // KUSURUN e2e BEKÇİSİ. Drill kenar çubuğu global kabuk sidebar'ıyla aynı
  // konumdaydı (`fixed; top:52px; left:0; z-index:90`) ve onu ÖRTÜYORDU:
  // şantiyeye girince ANA MENÜ KAYBOLUYORDU. Çubuk kaldırıldı; burada
  // ölçülen şey ana menünün şantiye rotasında GÖRÜNÜR kaldığıdır.
  await expect(page.locator("nav.drill-sidebar")).toHaveCount(0);
  const shellNav = page.locator("nav.sidebar-nav");
  await expect(shellNav).toHaveCount(1);
  await expect(shellNav).toBeVisible();
  await expect(shellNav.getByRole("link", { name: "Stok & Depo" })).toBeVisible();
  // 🔴 Landmark SAYIMI korunur ama artık KÖR DEĞİL: F-KIRINTI üst çubuğa bir
  // yol göstergesi ekledi ve kırıntı ARIA'da bir `nav`dır, yani beklenen sayı
  // 2'dir. Sayıyı 2'ye çekip bırakmak bekçiyi körleştirirdi (drill çubuğu
  // kırıntı YOKKEN geri gelse yine 2 olurdu), bu yüzden İKİSİ DE ADIYLA
  // iddia edilir: üçüncü bir `<nav>` ya da yanlış kimlikli bir ikinci `<nav>`
  // hâlâ bu testi düşürür.
  await expect(page.getByRole("navigation")).toHaveCount(2);
  await expect(page.getByRole("navigation", { name: "Yol göstergesi" })).toHaveCount(1);
});

test("KPI şeridi ve tablo SUNUCU verisinden gelir; merkez depo bakiyeye GİRMEZ", async ({
  page,
}) => {
  await login(page);
  await page.goto(SITE_STOCK_URL);

  const strip = page.getByTestId("santiye-stok-kpi-strip");
  await expect(strip).toContainText("Toplam Malzeme");
  await expect(strip).toContainText("Kritik Stok");
  await expect(strip).toContainText("Düşük Stok");
  await expect(strip).toContainText("Stok Değeri");
  // E3'ün kartı ŞS'de ÇİZİLMEMİŞTİR.
  await expect(strip).not.toContainText("Bekleyen Sipariş");

  // wh-1/wh-2/wh-4 s-1'in depolarıdır; wh-3 (s-2) ve wh-0 (merkez) HARİÇTİR.
  // it-7 (SNK-0447) YALNIZ wh-3'te hareket görür → bu şantiyede satırı YOKTUR.
  await expect(page.getByTestId("santiye-stok-row-SNK-0421")).toBeVisible();
  await expect(page.getByTestId("santiye-stok-row-SNK-0447")).toHaveCount(0);

  // Rozet SUNUCUNUN damgasıdır; ŞS'de `normal` "Yeterli" basılır.
  await expect(page.getByTestId("santiye-stok-status-SNK-0421")).toHaveText("Kritik");
  await expect(page.getByTestId("santiye-stok-status-SNK-0055")).toHaveText("Yeterli");
  // Eşiksiz kalem (it-8 · min_stock null) rozet İCAT ETMEZ.
  await expect(page.getByTestId("santiye-stok-status-ICY-0090")).toHaveText("—");
});

// 🔴 STOK-BOLUM — İDDİA BÖLÜNDÜ. Eski test iki sütunu BİRLİKTE pending sayıyordu;
// "Bölüm" backend `186ffe9` ile GERÇEĞE döndü ve o iddia artık bir YALAN olurdu.
test("'Aylık İhtiyaç' HÂLÂ gerekçeli pending basar (sayı uydurulmaz)", async ({ page }) => {
  await login(page);
  await page.goto(SITE_STOCK_URL);

  const need = page.getByTestId("santiye-stok-need-SNK-0421");
  await expect(need).toHaveText("—");
  await expect(need).toHaveAttribute("title", "Şantiye planlama verisi bu yüzeye henüz bağlanmadı");

  // Gerekçe `title`da görünmez kalmasın diye metne de basılır.
  await expect(page.getByTestId("santiye-stok-pending-notice")).toContainText(
    "Şantiye planlama verisi bu yüzeye henüz bağlanmadı",
  );
});

test("'Bölüm' sütunu GERÇEK bölüm adını basar; atfı olmayan kart hâlâ '—'", async ({ page }) => {
  await login(page);
  await page.goto(SITE_STOCK_URL);

  // it-1 (SNK-0421) `sec-1`e atfedilmiştir → gerçek ad, yer tutucu hücre YOK.
  await expect(page.getByTestId("santiye-stok-section-SNK-0421")).toHaveCount(0);
  await expect(page.getByTestId("santiye-stok-row-SNK-0421")).toContainText(
    "Kat 6–10 Kaba İnşaat",
  );

  // POZİTİF KONTROL — sütun "her satıra ad basan" hâle DÜŞMEDİ: it-3
  // (ELK-0334) hiçbir bölüme atfedilmemiştir ve gerekçeli "—" basar.
  const unattributed = page.getByTestId("santiye-stok-section-ELK-0334");
  await expect(unattributed).toHaveText("—");
  await expect(unattributed).toHaveAttribute(
    "title",
    "Şantiye planlama verisi bu yüzeye henüz bağlanmadı",
  );
});

// 🔴 SÜZGECİN ANLAMI: SATIR KÜMESİNİ daraltır, BAKİYEYİ DEĞİŞTİRMEZ.
test("?section= süzgeci satır kümesini daraltır, bakiyeyi DEĞİŞTİRMEZ", async ({ page }) => {
  await login(page);

  await page.goto(SITE_STOCK_URL);
  const unfilteredBalance = await page
    .getByTestId("santiye-stok-balance-SNK-0421")
    .textContent();
  // Süzgeçsiz görünümde `sec-2`ye atfedilmiş kart (it-6 · MKN-0192) DE vardır.
  await expect(page.getByTestId("santiye-stok-row-MKN-0192")).toBeVisible();

  await page.goto(`${SITE_STOCK_URL}?section=sec-1`);

  // (a) satır kümesi daraldı — `sec-2`nin kartı DÜŞTÜ,
  await expect(page.getByTestId("santiye-stok-row-SNK-0421")).toBeVisible();
  await expect(page.getByTestId("santiye-stok-row-MKN-0192")).toHaveCount(0);
  // (b) ama BAKİYE AYNI KALDI — süzgeç bakiyeyi yeniden hesaplamaz.
  await expect(page.getByTestId("santiye-stok-balance-SNK-0421")).toHaveText(
    unfilteredBalance ?? "",
  );
  // (c) ve band bunu SÖYLER — "bölümün stoğu" yalanı kurulmaz.
  const band = page.getByTestId("santiye-stok-section-filter");
  await expect(band).toContainText("ŞANTİYE bakiyesidir");
  await expect(band).toContainText("bölümün kendi miktarları değildir");

  // Süzgeci kaldırınca tam liste geri gelir (önbellek EZİLMEMİŞTİR).
  await page.getByTestId("santiye-stok-section-filter-clear").click();
  await expect(page.getByTestId("santiye-stok-row-MKN-0192")).toBeVisible();
  await expect(page.getByTestId("santiye-stok-section-filter")).toHaveCount(0);
});

test("satır aksiyonları ve 'Satınalma Talebi →' SA'ya pending: devre dışı + gerekçe", async ({
  page,
}) => {
  await login(page);
  await page.goto(SITE_STOCK_URL);

  const headerButton = page.getByRole("button", { name: "Satınalma Talebi →" });
  await expect(headerButton).toBeDisabled();
  await expect(headerButton).toHaveAttribute("title", "Satınalma verisi bu yüzeye henüz bağlanmadı");

  const criticalAction = page.getByTestId("santiye-stok-action-SNK-0421");
  await expect(criticalAction).toHaveText("Acil Sipariş");
  await expect(criticalAction).toBeDisabled();
  await expect(criticalAction).toHaveAttribute("title", "Satınalma verisi bu yüzeye henüz bağlanmadı");

  const detailAction = page.getByTestId("santiye-stok-action-SNK-0055");
  await expect(detailAction).toHaveText("Detay");
  await expect(detailAction).toBeDisabled();
});

test("'+ Stok Girişi' şantiye kapsamlı giriş rotasına bağlanır (T4 sözleşmesi)", async ({
  page,
}) => {
  await login(page);
  await page.goto(SITE_STOCK_URL);

  await expect(page.getByTestId("santiye-stok-giris-link")).toHaveAttribute(
    "href",
    "/projeler/p-1/santiyeler/s-1/stok/giris",
  );
});

test("görünmeyen şantiye 404 alır ve Türkçe GÖRÜNÜR mesaj basılır (ST §4b)", async ({ page }) => {
  await login(page);
  await page.goto("/projeler/p-1/santiyeler/yok-boyle-bir-santiye/stok");

  await expect(page.getByTestId("santiye-stok-error")).toContainText("bulunamadı");
});
