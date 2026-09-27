import { test, expect, type Page } from "@playwright/test";

// F-P5 T6 · FSO (`/sozlesmeler/taseron/yeni`) fonksiyonel e2e. Kapsam: rotanın
// ComingSoon'dan çıkması, SZL'deki girişin buraya götürmesi, beş kartın
// basılması, belge kutularının devre-dışı+gerekçeli olması, taşeron seçilince
// salt-okunur alanların dolması, işveren sözleşme no'sunun okunması.
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (Next route-announcer tuzağı).
//
// 🔒 FİKSTÜR İZOLASYONU: mock state tüm koşu boyunca TEKTİR ve spec'ler
// PARALEL koşar. Bu dosya HİÇBİR kaydı mutasyona uğratmaz — sözleşme POST'u
// ATILMAZ. Atılsaydı `state.subcontractorContracts` büyür ve (a) TL'nin
// "Aktif Sözleşme/Bedel" agregasyonunu, (b) taşeron hakediş açma adımının
// `GET /subcontractor-contracts` listesini kirletirdi. Oluşturma/taslak/
// load-from-employer yolları Vitest'te
// `SubcontractorContractCreateView.test.tsx`te kapsanır.
//
// Zamanlayıcıya dayalı bekleme YOK.

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("FSO: SZL'deki '+ Yeni Sözleşme' formu açar, beş kart basılır", async ({ page }) => {
  await login(page);
  await page.goto("/sozlesmeler?type=subcontractor");
  await page.getByRole("link", { name: "+ Yeni Sözleşme" }).click();

  await expect(page).toHaveURL(/\/sozlesmeler\/taseron\/yeni$/);
  await expect(page.getByRole("heading", { name: "Yeni Taşeron Sözleşmesi" })).toBeVisible();
  await expect(page.locator("main").getByText("Bu modül yakında eklenecek.")).toHaveCount(0);

  for (const title of [
    "🔗 Proje Bağlantısı",
    "🏗 Taşeron Bilgileri",
    "📝 Sözleşme Şartları",
    "⭐ Poz Listesi & Taşeron Fiyatları",
    "📎 Sözleşme Belgeleri",
  ]) {
    await expect(page.locator("main").getByText(title, { exact: true })).toBeVisible();
  }
});

test("FSO: proje seçilince işveren sözleşme no'su salt-okunur dolar", async ({ page }) => {
  await login(page);
  await page.goto("/sozlesmeler/taseron/yeni");

  // Proje seçilmeden poz yükleme kapalıdır (uç sözleşme kimliği ister).
  await expect(page.getByRole("button", { name: "İşveren Sözleşmesinden Yükle" })).toBeDisabled();
  await expect(page.getByTestId("fso-employer-contract")).toHaveText("—");

  await page.locator("main").getByLabel("Proje", { exact: true }).selectOption({ index: 1 });
  await expect(page.getByTestId("fso-employer-contract")).not.toHaveText("—");
});

test("FSO: taşeron seçilince VKN/yetkili/telefon/e-posta salt-okunur dolar", async ({ page }) => {
  await login(page);
  await page.goto("/sozlesmeler/taseron/yeni");

  await expect(page.getByTestId("fso-tax-number")).toHaveText("—");
  await page.locator("main").getByLabel("Taşeron Firma", { exact: true }).selectOption({ index: 1 });
  await expect(page.getByTestId("fso-tax-number")).not.toHaveText("—");
});

test("FSO: belge kutuları SİLİNMEZ, altısı da devre dışı + gerekçelidir", async ({ page }) => {
  await login(page);
  await page.goto("/sozlesmeler/taseron/yeni");

  const boxes = page.locator("main .pf-doc[aria-disabled='true']");
  // Altı belge kutusu + ortak "sürükle" satırı.
  await expect(boxes).toHaveCount(7);
  await expect(page.locator("main").getByText("İmzalı Sözleşme", { exact: true })).toBeVisible();
  await expect(page.locator("main").getByText("Birim Fiyat Analizi", { exact: true })).toBeVisible();
});

test("FSO: eksik formda 'Sözleşmeyi Oluştur' kaydetmez, hata gösterir", async ({ page }) => {
  await login(page);
  await page.goto("/sozlesmeler/taseron/yeni");

  await page
    .locator("main .pf-actions")
    .getByRole("button", { name: "Sözleşmeyi Oluştur" })
    .click();

  await expect(page.getByTestId("fso-form-error")).toBeVisible();
  // Kaydedilmedi → hâlâ formdayız.
  await expect(page).toHaveURL(/\/sozlesmeler\/taseron\/yeni$/);
});
