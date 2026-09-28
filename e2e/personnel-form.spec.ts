import { test, expect, type Page } from "@playwright/test";

// F-PT T4 + F-İK T4 · "Yeni Personel Kaydı" formu — FONKSİYONEL e2e (görsel DEĞİL).
//
// Kanıtlanan zincir: puantajdan giriş → form doldur → kaydet → puantaj
// matrisinde YENİ SATIR göründü. jsdom testleri BFF izin listesini ve gerçek
// yönlendirmeyi görmez; bu dosya onları da kapsar.
//
// 🔒 FİKSTÜR İZOLASYONU (mock-backend'deki nota göre): 2026-08 · s-1 GÖRSEL
// kadrajdır ve DEĞİŞTİRİLMEZ. Yeni personel `state.personnel`e eklenir ve
// AKTİF olduğu için matriste hücresiz satır olarak görünür (T2 kararı K1) —
// bu yüzden matris okuması EYLÜL (2026-09) oyun alanında yapılır.
//
// 🔒 TCKN İZOLASYONU (F-İK T4): fikstürlerin `tc_no` alanı BOŞTUR; çakışma
// testleri KENDİ oluşturdukları kayıtla 409 üretir, fikstürlere DOKUNMAZ.
// Her test kendi TC'sini kullanır ki testler birbirini kirletmesin.
//
// ⚠️ `getByRole("alert")` bu depoda YASAKTIR — görünür metinle iddia edilir.
//
// ⚠️ AKIŞ-SSR ÇİFT KOPYA: sunucu kopyası + hidrasyon kopyası kısa bir an yan
// yana durur ve strict-mode ihlali verir (Linux CI run 31218793998, macOS'ta
// görülmez). TEKİL eleman bekleyen her locator `.first()` alır.

/** Puantajın fonksiyonel oyun alanı: 2026-W36 = 31 Ağu – 6 Eyl. */
const WEEK_36 = "iso_year=2026&iso_week=36";
const SITE_URL = "/projeler/p-1/santiyeler/s-1/puantaj";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/** Alt eylem şeridindeki bir buton (mockup 210–212). */
function actionButton(page: Page, name: string) {
  return page.locator("main").locator(".pf-actions").first().getByRole("button", { name, exact: true });
}

function submitButton(page: Page) {
  return actionButton(page, "Personeli Kaydet");
}

/** Mockup'ta `*` taşıyan alanlar — yayın yolunun gerektirdiği küme. */
async function fillPublishable(
  page: Page,
  values: { firstName: string; lastName: string; tcNo: string },
) {
  const content = page.locator("main");
  await content.getByLabel("Ad", { exact: true }).first().fill(values.firstName);
  await content.getByLabel("Soyad").first().fill(values.lastName);
  await content.getByLabel("Çalışan Tipi").first().selectOption("subcontractor");
  await content.getByLabel("Meslek / Görev").first().selectOption("Elektrikçi");
  await content.getByLabel("TC Kimlik No").first().fill(values.tcNo);
  await content.getByLabel("Doğum Tarihi").first().fill("12.04.1985");
  await content.getByLabel("Cep Telefonu").first().fill("0532 123 45 67");
  await content.getByLabel("Adres").first().fill("Cumhuriyet Mah. 12/3 Ankara");
  await content.getByLabel("Acil Durum Kişisi").first().fill("Ayşe Yılmaz");
  await content.getByLabel("Acil Durum Telefonu").first().fill("0533 987 65 43");
  await content.getByLabel("İşe Giriş Tarihi").first().fill("01.08.2026");
  await content.getByLabel("Atandığı Proje").first().selectOption({ index: 1 });
  await content.getByLabel("Ücret Tutarı (₺)").first().fill("1200");
}

test("puantajdan girilir, personel kaydedilir ve matriste satır olur", async ({ page }) => {
  await login(page);
  await page.goto(`${SITE_URL}?${WEEK_36}`);

  // Giriş noktası (mockup'ta YOK — spec §4 S2(a) onaylı türetimi).
  await page.getByRole("link", { name: "Personel Ekle" }).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Yeni Personel Kaydı" }).first(),
  ).toBeVisible();

  await fillPublishable(page, { firstName: "Zeki", lastName: "Karaca", tcNo: "10000000001" });
  // "Bağlı Taşeron" yalnız taşeron işçisinde açılır ve GERÇEK veriyi listeler.
  const subcontractor = page.locator("main").getByLabel("Bağlı Taşeron").first();
  await expect(subcontractor).toBeEnabled();
  await subcontractor.selectOption({ label: "Aydın Elektrik Taah." });

  await submitButton(page).click();

  // Geldiği puantaj ekranına DÖNER (hafta korunur) ve yeni kişi satır alır.
  await expect(page).toHaveURL(new RegExp(`${SITE_URL}\\?.*iso_week=36`));
  await expect(
    page.locator("main .ts-week-table").first().getByRole("rowheader", { name: /Zeki Karaca/ }),
  ).toBeVisible();
});

test("İK alanları ETKİN; PENDING kalan tek alan Bölüm'dür", async ({ page }) => {
  await login(page);
  await page.goto("/personel/yeni");

  for (const label of [
    "TC Kimlik No",
    "Cep Telefonu",
    "Adres",
    "IBAN",
    "Atandığı Proje",
    "Ücret Tutarı (₺)",
    "SGK Sicil No",
  ]) {
    await expect(page.locator("main").getByLabel(label).first()).toBeEnabled();
  }
  await expect(page.locator("main").getByLabel("Bölüm").first()).toBeDisabled();

  // Taslak yolu ARTIK açık (mockup 39, 211).
  await expect(page.getByRole("button", { name: "Taslak", exact: true }).first()).toBeEnabled();
  await expect(actionButton(page, "Taslak Kaydet")).toBeEnabled();

  // Gerekçeler GÖRÜNÜR yazar.
  const notices = page.getByTestId("personnel-form-notices").first();
  // 🔴 "Serbest Meslek" gerekçesi 2026-09-23'te KALKTI (kayıt 397): o iki tür
  // backend enum'unda ZATEN vardı, ekran onları kapatıyordu. Artık seçilebilir,
  // dolayısıyla gerekçe de basılmaz — pozitif kontrol olarak YOKLUĞU ölçülür.
  await expect(notices).not.toContainText("Serbest Meslek");
  await expect(notices).toContainText("Bölüm");
});

test("yayın yolunda yıldızlı alanlar denetlenir, taslak yolunda denetlenmez", async ({ page }) => {
  await login(page);
  await page.goto("/personel/yeni");

  await submitButton(page).click();
  await expect(page.locator("main").getByText("Ad zorunludur.").first()).toBeVisible();
  await expect(page.locator("main").getByText("TC kimlik no zorunludur.").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: "Yeni Personel Kaydı" }).first(),
  ).toBeVisible();

  // Taslak yolu sunucunun gerçekten istediği iki alanla geçer.
  await page.locator("main").getByLabel("Ad", { exact: true }).first().fill("Taslak");
  await page.locator("main").getByLabel("Soyad").first().fill("Adayı");
  await page.locator("main").getByLabel("Çalışan Tipi").first().selectOption("company");
  await actionButton(page, "Taslak Kaydet").click();

  await expect(page).toHaveURL(/\/puantaj/);
});

test("geçersiz TCKN (422) ile çift kayıt (409) AYRI mesaj gösterir", async ({ page }) => {
  await login(page);

  // 1) 422 — biçimsel geçersizlik. Checksum İSTEMCİDE hesaplanmaz: alan
  //    doldurulur, reddi SUNUCU verir ve ekran onu anlaşılır gösterir.
  await page.goto("/personel/yeni");
  await fillPublishable(page, { firstName: "Kısa", lastName: "Numara", tcNo: "12345" });
  await submitButton(page).click();

  const error = page.getByTestId("personnel-form-error").first();
  await expect(error).toContainText("Geçersiz bilgi");
  await expect(error).not.toContainText("Çift kayıt");
  const invalidMessage = (await error.textContent()) ?? "";

  // 2) Aynı TC ile GERÇEK bir kayıt açılır (fikstürler kirlenmez).
  await page.goto("/personel/yeni");
  await fillPublishable(page, { firstName: "Özgün", lastName: "Kayıt", tcNo: "10000000042" });
  await submitButton(page).click();
  await expect(page).toHaveURL(/\/puantaj/);

  // 3) 409 — aynı TC ikinci kez. Mesaj 422'den FARKLIDIR ve TC alanının
  //    altında da görünür.
  await page.goto("/personel/yeni");
  await fillPublishable(page, { firstName: "İkinci", lastName: "Kayıt", tcNo: "10000000042" });
  await submitButton(page).click();

  await expect(error).toContainText("Çift kayıt");
  await expect(error).not.toContainText("Geçersiz bilgi");
  expect(await error.textContent()).not.toBe(invalidMessage);
  await expect(
    page.locator("main").getByText("Bu TC kimlik no ile kayıtlı personel zaten var.").first(),
  ).toBeVisible();
});
