import { test, expect, type Page } from "@playwright/test";

// F-P8 T2 · `/satis` Satış Yönetimi listesi — FONKSİYONEL e2e (görsel DEĞİL;
// görsel spec'ler T4'te). Kanıtlanan zincir: kabuk sidebar'ı GERÇEK ekranı açar
// (ComingSoon DEĞİL) → KPI'lar summary ucundan gelir → durum süzgeci
// İSTEMCİDE çalışır (sunucuya YENİ İSTEK ATILMAZ, TELDEN kanıt) → TOPLAM
// satırının kaynağı süzgeçle DEĞİŞİR → satır detaya GİTMEZ ve durum aksiyonu
// BASILMAZ (spec §2/K3).
//
// 🔒 FİKSTÜR İZOLASYONU: `p-1` projesinin satışları (`sl-1…sl-3`) T4 görsel
// baseline'larının kaynağıdır — bu dosya SALT-OKURDUR, hiçbir satış/müşteri
// oluşturmaz, güncellemez, silmez.
//
// ⚠️ `getByRole("alert")` bu depoda YASAKTIR. Sabit `waitForTimeout` da yasak;
// beklemeler locator tabanlıdır.

const SALES_URL = "/satis";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/** Ekranın ilk yükü tamamlandı: tablo kartı ve KPI şeridi basıldı. */
async function waitForSalesScreen(page: Page) {
  await expect(page.getByRole("heading", { name: "Satış Yönetimi", level: 1 })).toBeVisible();
  await expect(page.getByTestId("satis-kpi-strip")).toBeVisible();
  await expect(page.getByTestId("satis-row-sl-1")).toBeVisible();
}

test("kabuk sidebar'ındaki 'Satış Yönetimi' gerçek ekranı açar (ComingSoon DEĞİL)", async ({
  page,
}) => {
  await login(page);

  await page.getByRole("navigation").getByRole("link", { name: "Satış Yönetimi" }).first().click();
  await expect(page).toHaveURL(/\/satis$/);
  await expect(page.getByRole("heading", { name: "Satış Yönetimi", level: 1 })).toBeVisible();
  await expect(page.getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
});

test("KPI şeridi + doluluk haritası + tablo + yaklaşan tahsilatlar sunucudan gelir", async ({
  page,
}) => {
  await login(page);
  await page.goto(SALES_URL);
  await waitForSalesScreen(page);

  // 54-60 · beş kutu (rakamlar sunucudan; mockup'ın sabitleri DEĞİL).
  const strip = page.getByTestId("satis-kpi-strip");
  for (const label of ["Satılan (Tapulu)", "Rezerve", "Boş Ünite", "Tahsil Edilen", "Vadesi Geçen"]) {
    await expect(strip).toContainText(label);
  }
  await expect(strip).not.toContainText("₺31,4M"); // mockup sabiti sızmaz

  // 62-140 · blok haritası, ünite ucunun blok gruplarından.
  await expect(page.getByRole("heading", { name: "Blok Doluluk Haritası" })).toBeVisible();
  await expect(page.getByTestId("satis-blok-blk-1")).toContainText("A Blok");
  await expect(page.getByTestId("satis-unite-u-1")).toBeVisible();

  // 148-204 · fikstür satırları (unit_label = "<blok> · <no>").
  await expect(page.getByTestId("satis-row-sl-1")).toContainText("A Blok · 1");
  await expect(page.getByTestId("satis-row-sl-2")).toContainText("Demir İnşaat Ltd. Şti.");
  await expect(page.getByTestId("satis-durum-sl-2")).toHaveText("Tapu Devredildi");
  await expect(page.getByTestId("satis-durum-sl-3")).toHaveText("Rezerve");
  // 197 · kurumsal alıcının VKN'si maskelenmez.
  await expect(page.getByTestId("satis-row-sl-2")).toContainText("VKN: 1234567890");

  // 217-234 · kart her hâlükârda çizilir.
  await expect(page.getByRole("heading", { name: "Yaklaşan Tahsilatlar (30 Gün)" })).toBeVisible();
});

test("durum süzgeci İSTEMCİDE çalışır: sunucuya YENİ istek atılmaz", async ({ page }) => {
  await login(page);

  const salesRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/\/api\/backend\/projects\/[^/]+\/sales(\?|$)/.test(url)) salesRequests.push(url);
  });

  await page.goto(SALES_URL);
  await waitForSalesScreen(page);
  const initialCount = salesRequests.length;
  expect(initialCount).toBeGreaterThan(0);

  await page.locator("main").getByLabel("Durum filtresi").selectOption("reservation");

  // Süzgeç uygulandı: yalnız rezervasyon satırı kaldı.
  await expect(page.getByTestId("satis-row-sl-3")).toBeVisible();
  await expect(page.getByTestId("satis-row-sl-1")).toHaveCount(0);
  await expect(page.getByTestId("satis-row-sl-2")).toHaveCount(0);

  // TELDEN KANIT: liste ucuna yeni çağrı YOK (uç query parametresi almaz —
  // `status=` göndermek 422 verirdi).
  expect(salesRequests).toHaveLength(initialCount);

  // Durum URL'de taşınır (paylaşılabilir).
  await expect(page).toHaveURL(/durum=reservation/);
});

test("TOPLAM satırının kaynağı süzgeçle DEĞİŞİR (sunucu totals ↔ görünen satırlar)", async ({
  page,
}) => {
  await login(page);
  await page.goto(SALES_URL);
  await waitForSalesScreen(page);

  // Süzgeç kapalıyken sunucunun SÜZÜLMEMİŞ toplamı basılır; "yalnız görünenler"
  // notu ÇIKMAZ.
  const total = page.getByTestId("satis-toplam");
  await expect(total).toContainText("TOPLAM (3 satış)");
  await expect(page.getByTestId("satis-toplam-notu")).toHaveCount(0);

  await page.locator("main").getByLabel("Durum filtresi").selectOption("reservation");

  // Tek rezervasyon satışı: sl-3 · 1.850.000 (kuruş-hassas türev).
  await expect(total).toContainText("TOPLAM (1 satış)");
  await expect(total).toContainText("1.850.000");
  // Gerekçe kullanıcıya GÖRÜNÜR yazılır — sessiz kaynak değişimi yok.
  await expect(page.getByTestId("satis-toplam-notu")).toContainText(
    "yalnızca süzgeçle görünen 1 satışı sayar",
  );
});

test("🛑 satır detaya GİTMEZ ve durum aksiyonu düğmesi BASILMAZ (spec §2/K3)", async ({ page }) => {
  await login(page);
  await page.goto(SALES_URL);
  await waitForSalesScreen(page);

  // Satış DETAY ekranı YOKTUR: tablonun içinde hiç bağlantı/düğme yok.
  const table = page.getByRole("table");
  await expect(table.getByRole("link")).toHaveCount(0);
  await expect(table.getByRole("button")).toHaveCount(0);

  // activate / transfer-deed / cancel / pay aksiyonlarının hiçbiri basılmaz.
  for (const forbidden of ["Aktifleştir", "Tapu Devret", "İptal Et", "Tahsilat Gir"]) {
    await expect(page.getByRole("button", { name: forbidden })).toHaveCount(0);
  }
});

test("'Fiyat Listesi' devre dışı + gerekçeli; '+ Satış Kaydı' forma gider", async ({ page }) => {
  await login(page);
  await page.goto(SALES_URL);
  await waitForSalesScreen(page);

  // 24 · rotası olmayan mockup öğesi SİLİNMEZ, devre dışı basılır (F-TH kuralı).
  const priceList = page.getByRole("button", { name: "Fiyat Listesi" });
  await expect(priceList).toBeDisabled();
  await expect(page.getByTestId("satis-fiyat-listesi-notu")).toContainText("henüz tasarlanmadı");

  // 25 · T3'ün açacağı form rotası.
  // 🔴 2026-09-23 (kayıt 236): birincil eylem artık PROJE BAĞLAMINI taşır —
  // blok/ünite düğmeleri zaten taşıyordu, bu düğme ham `NEW_SALE_HREF`
  // kullanıyordu ve kullanıcı forma proje seçilmemiş olarak düşüyordu.
  await expect(page.getByRole("link", { name: "+ Satış Kaydı" })).toHaveAttribute(
    "href",
    "/satis/yeni?proje=p-1",
  );
});

test("proje seçimi URL'de taşınır ve listeyi değiştirir", async ({ page }) => {
  await login(page);
  await page.goto(SALES_URL);
  await waitForSalesScreen(page);

  // `p-2`de satış fikstürü yoktur → boş durum basılır (mockup örnekleri DEĞİL).
  await page.locator("main").getByLabel("Proje seçimi").selectOption({ label: "Villa B" });
  await expect(page).toHaveURL(/proje=p-2/);
  await expect(page.getByTestId("satis-bos-durum")).toContainText("henüz satış kaydı yok");
  await expect(page.getByTestId("satis-row-sl-1")).toHaveCount(0);
});
