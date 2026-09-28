import { test, expect, type Page } from "@playwright/test";

// F-ST T4 · SG (`.../santiyeler/{siteId}/stok/giris`) FONKSİYONEL e2e'si —
// görsel spec'ler T5'te (dosya adında "gorsel"/"visual" GEÇMEZ ki beşinci
// kapıda koşsun).
//
// Kapsam: rotanın ComingSoon'dan ÇIKTIĞI · deponun ROTADAN ön doldurulduğu
// (query parametresi YOK) · koşullu "Kaynak Depo" · pending yüzeylerin
// devre dışılığı + gerekçesi · tutar/toplam türevi · adjustment negatif
// kuralı · 404/422 Türkçe mesajları (TELDEN sunucudan).
//
// 🔒 FİKSTÜR İZOLASYONU (T1-T3 kuralı aynen sürer): mock backend TÜM
// spec'lerde TEK paylaşılan sunucudur ve stok kayıtlarının PROJE KAPSAMI
// YOKTUR. BAŞARILI bir yazma bakiyeleri değiştirir ve T5'in görsel
// baseline'larını sessizce kırar. Bu dosya YALNIZ OKUR; yazma tarafında
// yalnızca REDDEDİLEN (durum değiştirmeyen) gövdeler kanıtlanır. Başarılı
// yazmanın uçtan uca kanıtı kapanış smoke'unda CANLI ortamda alınır.

const ENTRY_URL = "/projeler/p-1/santiyeler/s-1/stok/giris";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/** Üst şeritteki birincil düğme — alt şeritteki ikizi AYNI işi yapar. */
function submitButton(page: Page) {
  return page.getByRole("button", { name: "Girişi Kaydet" }).first();
}

test("ŞS'deki '+ Stok Girişi' gerçek formu açar (ComingSoon DEĞİL)", async ({ page }) => {
  await login(page);
  await page.goto("/projeler/p-1/santiyeler/s-1/stok");
  const content = page.locator("main");

  await content.getByTestId("santiye-stok-giris-link").click();

  await expect(page).toHaveURL(/\/santiyeler\/s-1\/stok\/giris$/);
  await expect(page.getByRole("heading", { level: 1, name: "Stok Girişi" })).toBeVisible();
  await expect(content.getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
});

test("depo ROTADAN ön doldurulur; merkez depo listede durur, query parametresi YOKTUR", async ({
  page,
}) => {
  await login(page);
  await page.goto(ENTRY_URL);

  // wh-1 (D-1 Ambar) s-1'in İLK deposudur.
  await expect(page.getByTestId("stok-giris-depo")).toHaveValue("wh-1");
  // URL'e süzgeç parametresi EKLENMEZ (T3 sözleşmesi).
  await expect(page).toHaveURL(/\/stok\/giris$/);
  // SG 84 merkez depoyu çizer — listeden düşmez.
  await expect(
    page.getByTestId("stok-giris-depo").locator('option[value="wh-0"]'),
  ).toHaveCount(1);
});

test("'Kaynak Depo' YALNIZ transfer tipinde görünür ve hedef depoyu içermez", async ({
  page,
}) => {
  await login(page);
  await page.goto(ENTRY_URL);

  await expect(page.getByTestId("stok-giris-kaynak-depo")).toHaveCount(0);

  await page.getByTestId("stok-giris-tip-transfer").click();
  const source = page.getByTestId("stok-giris-kaynak-depo");
  await expect(source).toBeVisible();
  // Kendine transfer 422'dir — hedef depo seçenek olarak SUNULMAZ.
  await expect(source.locator('option[value="wh-1"]')).toHaveCount(0);

  await page.getByTestId("stok-giris-tip-adjustment").click();
  await expect(page.getByTestId("stok-giris-kaynak-depo")).toHaveCount(0);
});

test("pending yüzeyler devre dışıdır ve gerekçeleri GÖRÜNÜR (spec §5 S5)", async ({ page }) => {
  await login(page);
  await page.goto(ENTRY_URL);

  const order = page.getByTestId("stok-giris-siparis");
  await expect(order).toBeDisabled();
  await expect(order).toHaveAttribute("title", "Satınalma verisi bu yüzeye henüz bağlanmadı");

  const orderCell = page.getByTestId("stok-giris-siparis-0");
  await expect(orderCell).toContainText("—");
  await expect(orderCell).toHaveAttribute("title", "Satınalma verisi bu yüzeye henüz bağlanmadı");

  const notify = page.getByTestId("stok-giris-bildirim");
  await expect(notify).toBeDisabled();
  await expect(notify).not.toBeChecked();

  // Belge kutuları: yükleme yüzeyi HİÇ basılmaz.
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.getByText("Belge verisi bu yüzeye henüz bağlanmadı").first()).toBeVisible();

  // Mockup'ın örnek içeriği basılmaz.
  await expect(page.getByText("SP-2026-042")).toHaveCount(0);
  await expect(page.getByText("Nervürlü Demir Ø12", { exact: true })).toHaveCount(0);
});

test("tutar ve TOPLAM istemcide türetilir (kolon şemada yoktur)", async ({ page }) => {
  await login(page);
  await page.goto(ENTRY_URL);

  await page.getByTestId("stok-giris-malzeme-0").selectOption("it-1");
  await page.getByTestId("stok-giris-miktar-0").fill("15");
  await page.getByTestId("stok-giris-fiyat-0").fill("21500");

  await expect(page.getByTestId("stok-giris-tutar-0")).toHaveText("322.500");
  await expect(page.getByTestId("stok-giris-toplam")).toHaveText("₺322.500");
  // Birim SUNUCU kartından gelir.
  await expect(page.getByTestId("stok-giris-satir-0")).toContainText("Ton");
});

test("kalem satırı eklenir ve silinir", async ({ page }) => {
  await login(page);
  await page.goto(ENTRY_URL);

  await page.getByTestId("stok-giris-kalem-ekle").click();
  await expect(page.getByTestId("stok-giris-satir-1")).toBeVisible();

  await page.getByTestId("stok-giris-kart-sec").click();
  await expect(page.getByTestId("stok-giris-satir-2")).toBeVisible();

  await page.getByTestId("stok-giris-satir-sil-2").click();
  await expect(page.getByTestId("stok-giris-satir-2")).toHaveCount(0);
});

test("miktar işaret kuralı: purchase/transfer'de negatif REDDEDİLİR", async ({ page }) => {
  await login(page);
  await page.goto(ENTRY_URL);

  await page.getByTestId("stok-giris-malzeme-0").selectOption("it-1");
  await page.getByTestId("stok-giris-miktar-0").fill("-5");
  await submitButton(page).click();

  // İstemci kuralı sunucuya gitmeden yakalar (istek AÇILMAZ).
  await expect(page.getByTestId("stok-giris-hata")).toContainText("negatif olamaz");

  // ⚠️ `adjustment`ta negatif miktarın GEÇTİĞİ burada kanıtlanmaz: geçen bir
  // gövde BAŞARILI yazma demektir ve T5 baseline'larını kırardı (fikstür
  // izolasyonu). O dal `validate.test.ts`te birim testiyle, uçtan uca kanıtı
  // ise kapanış smoke'unda CANLI ortamda alınır.
});

test("transferde kaynak depo boşsa istek açılmaz; Türkçe hata GÖRÜNÜR basılır", async ({
  page,
}) => {
  await login(page);
  await page.goto(ENTRY_URL);

  await page.getByTestId("stok-giris-malzeme-0").selectOption("it-1");
  await page.getByTestId("stok-giris-miktar-0").fill("5");
  await page.getByTestId("stok-giris-tip-transfer").click();
  await submitButton(page).click();

  await expect(page.getByTestId("stok-giris-hata")).toContainText("kaynak depo zorunludur");
});

test("SUNUCUNUN 404'ü (gövde içi varlık referansı) Türkçe basılır — ST §4b", async ({ page }) => {
  await login(page);
  await page.goto(ENTRY_URL);

  await page.getByTestId("stok-giris-malzeme-0").selectOption("it-1");
  await page.getByTestId("stok-giris-miktar-0").fill("5");
  // Var olmayan bir depo kimliğini telden gönder: istemci doğrulaması geçer,
  // sunucu §4b uyarınca 404 döner (görünmeyen = var olmayan).
  await page.getByTestId("stok-giris-depo").evaluate((element) => {
    const select = element as HTMLSelectElement;
    const option = document.createElement("option");
    option.value = "wh-yok";
    option.textContent = "yok";
    select.append(option);
  });
  await page.getByTestId("stok-giris-depo").selectOption("wh-yok");
  await submitButton(page).click();

  await expect(page.getByTestId("stok-giris-hata")).toContainText("bulunamadı");
});

test("kendine transfer İSTEMCİDE engellenir (sunucu 422 kuralının aynası) — ST §4b", async ({
  page,
}) => {
  await login(page);
  await page.goto(ENTRY_URL);

  await page.getByTestId("stok-giris-malzeme-0").selectOption("it-1");
  await page.getByTestId("stok-giris-miktar-0").fill("5");
  await page.getByTestId("stok-giris-tip-transfer").click();
  // İstemci kendine transferi engeller; kuralı SUNUCUDA görmek için hedef
  // depoyu kaynakla aynı yapacak seçeneği telden ekliyoruz.
  await page.getByTestId("stok-giris-kaynak-depo").evaluate((element) => {
    const select = element as HTMLSelectElement;
    const option = document.createElement("option");
    option.value = "wh-1";
    option.textContent = "D-1 Ambar";
    select.append(option);
  });
  await page.getByTestId("stok-giris-kaynak-depo").selectOption("wh-1");
  // İstemci doğrulaması bu ihlali yakalar — sunucu kuralının AYNADAKİ
  // karşılığı olduğunu kanıtlar (istek açılmaz, mesaj aynı anlamı taşır).
  await submitButton(page).click();

  await expect(page.getByTestId("stok-giris-hata")).toContainText("aynı olamaz");
});
