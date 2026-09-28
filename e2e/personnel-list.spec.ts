import { test, expect, type Page } from "@playwright/test";

// F-PT2 T2 · `/personel` liste ekranı — FONKSİYONEL e2e (görsel DEĞİL; görsel
// spec'ler T4'te). Kanıtlanan zincir: kabuk sidebar'ı gerçek ekranı açar
// (ComingSoon DEĞİL) → arama SUNUCUYA `q` olarak gider (TELDEN kanıt) →
// meslek süzgeci İSTEMCİDE çalışır (yeni istek ATILMAZ, TELDEN kanıt) →
// Detay bağlantısı doğru rotaya gider.
//
// 🔒 FİKSTÜR İZOLASYONU (T1 notu): `per-1…per-6` puantaj GÖRSEL kadrajının VE
// bu dilimin baseline'larının kaynağıdır — bu dosya SALT-OKUR kalır, personel
// fikstürlerini MUTASYONA UĞRATMAZ.
//
// ⚠️ `getByRole("alert")` bu depoda YASAKTIR. Tekil eleman bekleyen locator'lar
// akış-SSR çift-kopya tuzağına karşı `.first()` alır.

const PERSONNEL_URL = "/personel";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("kabuk sidebar'ındaki 'Personel' gerçek ekranı açar (ComingSoon DEĞİL)", async ({ page }) => {
  await login(page);

  await page.getByRole("navigation").getByRole("link", { name: "Personel" }).first().click();
  await expect(page).toHaveURL(/\/personel$/);
  await expect(page.getByRole("heading", { name: "İnsan Kaynakları" })).toBeVisible();
  await expect(page.getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
});

test("KPI şeridi + sekmeler + tablo sunucu fikstüründen gelir", async ({ page }) => {
  await login(page);
  await page.goto(PERSONNEL_URL);

  // ⚠️ Mock backend TÜM spec dosyaları arasında PAYLAŞILIR (paralel worker'lar
  // eşzamanlı POST yapabilir) — toplam sayı deterministik değildir, bu yüzden
  // yalnız kartların VARLIĞI ve bilinen fikstür satırları sınanır (tam sayı
  // DEĞİL).
  const strip = page.getByTestId("personel-kpi-strip");
  await expect(strip).toContainText("Toplam Personel");
  await expect(strip).toContainText("Şirket Kadrosu");
  await expect(strip).toContainText("Taşeron İşçisi");

  // Sekme şeridi. 🔴 F-BOR T5 (K8/K9): şeritteki ALTI sekmenin ALTISI da artık
  // gerçek rotaya gider — "Bordro"/"SGK" bu dilimde canlandı. İddia görsel
  // kapıya BIRAKILAMAZ: devre-dışı→canlı geçişi yalnız gri tonunu değiştirir
  // (#94a3b8 → #64748b, ölçülmüş delta 1120 < eşik 1408.6) ve kare OYNAMAZ.
  await expect(page.getByRole("tab", { name: "Personel Listesi" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const timesheetTab = page.getByRole("tab", { name: "Puantaj" }).first();
  await expect(timesheetTab).toHaveAttribute("href", "/puantaj");
  await expect(page.getByRole("tab", { name: "İzin Yönetimi" }).first()).toHaveAttribute(
    "href",
    "/personel/izinler",
  );
  await expect(page.getByRole("tab", { name: "Bordro" }).first()).toHaveAttribute(
    "href",
    "/bordro",
  );
  await expect(page.getByRole("tab", { name: "SGK" }).first()).toHaveAttribute(
    "href",
    "/bordro/sgk",
  );

  // Tablo satırları — Tür rozeti sunucudan.
  await expect(page.getByTestId("personel-row-per-1")).toContainText("Mehmet Kılıç");
  await expect(page.getByTestId("personel-row-per-1")).toContainText("Şirket");
  await expect(page.getByTestId("personel-row-per-3")).toContainText("Taşeron");

  // F-İK T2 · Proje/SGK/Ücret-Gün hücreleri GERÇEK veri basar (İK-1 alanları).
  // Proje hücresi KİMLİK değil AD gösterir (proje listesinden eşlenir).
  await expect(page.getByTestId("personel-project-per-1")).toHaveText("Kule A");
  await expect(page.getByTestId("personel-sgk-per-1")).toHaveText("1234567890");
  await expect(page.getByTestId("personel-wage-per-1")).toHaveText("₺ 1.450");
  // `monthly` ücret birim ekiyle basılır (yanıltmama kuralı).
  await expect(page.getByTestId("personel-wage-per-2")).toHaveText("₺ 42.000 / Ay");
  // Alanları boş olan kayıtta sade "—" (atanmamış/girilmemiş).
  await expect(page.getByTestId("personel-project-per-5")).toHaveText("—");
  await expect(page.getByTestId("personel-sgk-per-5")).toHaveText("—");
});

test("proje süzgeci SUNUCUDA süzer (TELDEN kanıt)", async ({ page }) => {
  await login(page);
  await page.goto(PERSONNEL_URL);
  await expect(page.getByTestId("personel-row-per-1")).toBeVisible();

  const projectRequest = page.waitForRequest(
    (request) => request.url().includes("/personnel") && request.url().includes("project_id=p-2"),
  );
  await page.locator("main").getByLabel("Proje filtresi").selectOption("p-2");
  await projectRequest;

  await expect(page).toHaveURL(/proje=p-2/);
  await expect(page.getByTestId("personel-row-per-3")).toContainText("Ramazan Yıldız");
  await expect(page.getByTestId("personel-row-per-1")).toHaveCount(0);
});

test("uyarı bandı GERÇEK sayaçları basar ve Belge & Sertifika ekranına bağlanır", async ({
  page,
}) => {
  await login(page);
  await page.goto(PERSONNEL_URL);

  const alert = page.getByTestId("personel-document-alert");
  await expect(alert).toContainText("3 belgenin süresi doldu");
  await expect(alert).toContainText("2 belgenin süresi yaklaşıyor");
  // Sunucu BELGE sayısı verir — mockup'ın "N personelin…" ifadesi UYDURULMAZ.
  await expect(alert).not.toContainText("personelin");
  await expect(alert.getByRole("link", { name: "Belgeleri Gör →" })).toHaveAttribute(
    "href",
    "/personel/belgeler",
  );
  await expect(page.getByRole("tab", { name: "Belge & Sertifika" }).first()).toHaveAttribute(
    "href",
    "/personel/belgeler",
  );
});

test("arama SUNUCUYA ?q= olarak gider (TELDEN kanıt)", async ({ page }) => {
  await login(page);
  await page.goto(PERSONNEL_URL);
  await expect(page.getByTestId("personel-row-per-1")).toBeVisible();

  const searchRequest = page.waitForRequest(
    (request) => request.url().includes("/personnel") && request.url().includes("q=Ramazan"),
  );
  await page.locator("main").getByLabel("Personel ara").fill("Ramazan");
  await searchRequest;

  await expect(page).toHaveURL(/q=Ramazan/);
  await expect(page.getByTestId("personel-row-per-3")).toContainText("Ramazan Yıldız");
  await expect(page.getByTestId("personel-row-per-1")).toHaveCount(0);
});

test("meslek süzgeci İSTEMCİDE çalışır — yeni istek ATILMAZ (TELDEN kanıt)", async ({ page }) => {
  await login(page);
  await page.goto(PERSONNEL_URL);
  await expect(page.getByTestId("personel-row-per-1")).toBeVisible();

  const personnelRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/backend/personnel") && !url.includes("/personnel/")) {
      personnelRequests.push(url);
    }
  });

  await page.locator("main").getByLabel("Meslek filtresi").selectOption("Elektrikçi");
  await expect(page.getByTestId("personel-row-per-3")).toContainText("Ramazan Yıldız");
  await expect(page.getByTestId("personel-row-per-1")).toHaveCount(0);

  // Süzgeç URL'e yazılır (paylaşılabilir) ama sunucuya YENİ istek gitmez.
  await expect(page).toHaveURL(/meslek=Elektrik%C3%A7i/);
  expect(personnelRequests, `meslek süzgeci sunucuya istek ATMAMALI: ${personnelRequests.join(", ")}`).toHaveLength(0);
});

test("durum süzgecinde 'İzinde' basılır ama seçilemez; Aktif/Pasif GERÇEKtir", async ({ page }) => {
  await login(page);
  await page.goto(PERSONNEL_URL);
  await expect(page.getByTestId("personel-row-per-1")).toBeVisible();

  await expect(page.getByRole("option", { name: "İzinde" })).toBeDisabled();

  const inactiveRequest = page.waitForRequest(
    (request) => request.url().includes("/personnel") && request.url().includes("is_active=false"),
  );
  await page.locator("main").getByLabel("Durum filtresi").selectOption("inactive");
  await inactiveRequest;

  await expect(page.getByTestId("personel-row-per-6")).toContainText("Kemal Toprak");
  await expect(page.getByTestId("personel-row-per-1")).toHaveCount(0);
});

test("Detay bağlantısı doğru rotaya gider", async ({ page }) => {
  await login(page);
  await page.goto(PERSONNEL_URL);
  await expect(page.getByTestId("personel-row-per-1")).toBeVisible();

  const detailLink = page.getByTestId("personel-row-per-1").getByRole("link", { name: "Detay" });
  await expect(detailLink).toHaveAttribute("href", "/personel/per-1");
});

test("sekme şeridinden 'İzin Yönetimi' GERÇEK ekranı açar (ComingSoon DEĞİL) ve geri döner", async ({
  page,
}) => {
  await login(page);
  await page.goto(PERSONNEL_URL);

  await page.getByRole("tab", { name: "İzin Yönetimi" }).first().click();
  await expect(page).toHaveURL(/\/personel\/izinler$/);
  await expect(page.locator("main").getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "İzin Yönetimi" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // "Personel Listesi" burada GERÇEK bağlantıdır — geri dönüş çalışır.
  const listTab = page.getByRole("tab", { name: "Personel Listesi" });
  await expect(listTab).toHaveAttribute("href", "/personel");
  await listTab.click();
  await expect(page).toHaveURL(/\/personel$/);
});

test("'+ Personel Ekle' mevcut forma döner, 'Dışa Aktar' ETKİNDİR", async ({ page }) => {
  await login(page);
  await page.goto(PERSONNEL_URL);

  // 🔴 EXPORT-XLSX: uç açıldı; indirmenin kendisi `export-xlsx.spec.ts`te.
  await expect(page.getByRole("button", { name: "Dışa Aktar" }).first()).toBeEnabled();

  await page.getByRole("link", { name: "+ Personel Ekle" }).first().click();
  // URL-1 ölçülmüş sapma: `?donus=` artık HER çağırandan kodlanmış çıkar
  // (gerekçe: `PersonnelListView.test.tsx`teki uzun not). Dönüş hedefi
  // `PersonnelForm` tarafından aynı `/personel` olarak çözülür.
  await expect(page).toHaveURL(/\/personel\/yeni\?donus=%2Fpersonel/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Yeni Personel Kaydı" }).first(),
  ).toBeVisible();
});
