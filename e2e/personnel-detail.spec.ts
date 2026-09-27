import { test, expect, type Page } from "@playwright/test";

// F-PT2 T3 · `/personel/[id]` detay + düzenleme kipi — FONKSİYONEL e2e
// (görsel DEĞİL; görsel spec'ler T4'te). Kanıtlanan zincir: liste → Detay →
// Düzenle → meslek değiştir → kaydet (PATCH TELDEN kanıt) → detayda doğrula
// → GERİ AL (izole fikstür üzerinde).
//
// 🔒 FİKSTÜR İZOLASYONU (T1 notu): bu dosya YALNIZ `per-new-pt2-fixture-1`
// kaydını mutasyona uğratır — `per-1…per-6` puantaj/liste GÖRSEL baseline'
// larının kaynağıdır, DOKUNULMAZ.
//
// ⚠️ `getByRole("alert")` bu depoda YASAKTIR. Tekil eleman bekleyen
// locator'lar `.first()` alır.

const FIXTURE_ID = "per-new-pt2-fixture-1";
const DETAIL_URL = `/personel/${FIXTURE_ID}`;
const ORIGINAL_TRADE = "Kaynakçı";
const NEW_TRADE = "Elektrikçi";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("liste → Detay → başlık kartı sunucu fikstüründen gelir", async ({ page }) => {
  await login(page);
  await page.goto("/personel");
  // Fikstür sayfalamada (PAGE_SIZE=6) ileri sayfada kalabilir — aramayla
  // (sunucuya `q=` giden GERÇEK süzgeç) TEK satıra indirilir.
  await page.locator("main").getByLabel("Personel ara").fill("Derya Aydın");
  const row = page.getByTestId(`personel-row-${FIXTURE_ID}`);
  await expect(row).toContainText("Derya Aydın");
  await row.getByRole("link", { name: "Detay" }).click();

  await expect(page).toHaveURL(new RegExp(`/personel/${FIXTURE_ID}$`));
  const header = page.getByTestId("personnel-header-card");
  await expect(header).toContainText("Derya Aydın");
  await expect(header).toContainText("Aktif");
  await expect(header).toContainText("Şirket");
});

test("4 pending kart basılır; Puantaj Özeti 'Tümü →' /puantaj'a gider", async ({ page }) => {
  await login(page);
  await page.goto(DETAIL_URL);

  await expect(page.getByTestId("personnel-timesheet-summary-card")).toBeVisible();
  await expect(page.getByTestId("personnel-leave-card")).toBeVisible();
  await expect(page.getByTestId("personnel-project-history-card")).toBeVisible();
  await expect(page.getByTestId("personnel-documents-card")).toBeVisible();

  const allLink = page
    .getByTestId("personnel-timesheet-summary-card")
    .getByRole("link", { name: "Tümü →" });
  await expect(allLink).toHaveAttribute("href", "/puantaj");
});

test("Düzenle → meslek değiştir → kaydet (PATCH TELDEN kanıt) → detayda doğrula → GERİ AL", async ({
  page,
}) => {
  await login(page);
  await page.goto(DETAIL_URL);

  await page.getByRole("link", { name: "Düzenle" }).click();
  await expect(page).toHaveURL(new RegExp(`/personel/${FIXTURE_ID}/duzenle$`));
  await expect(page.getByRole("heading", { level: 1, name: "Personeli Düzenle" })).toBeVisible();

  const patchRequest = page.waitForRequest(
    (request) =>
      request.url().includes(`/personnel/${FIXTURE_ID}`) && request.method() === "PATCH",
  );
  await page.getByLabel("Meslek / Görev").selectOption(NEW_TRADE);
  await page.getByRole("button", { name: "Kaydet" }).first().click();
  const request = await patchRequest;
  expect(request.postDataJSON()).toMatchObject({ trade: NEW_TRADE });

  await expect(page).toHaveURL(new RegExp(`/personel/${FIXTURE_ID}$`));
  await expect(page.getByTestId("personnel-header-card")).toContainText(NEW_TRADE);

  // GERİ AL — `ORIGINAL_TRADE` ("Kaynakçı") `TRADE_OPTIONS`ın SEKİZ sabit
  // seçeneği DIŞINDA (fikstürün gerçekçiliği için bilinçli seçildi, bkz.
  // JobCard'ın "mevcut değer" enjeksiyonu). Değer bir kez seçiciden
  // uzaklaşınca kapalı listeye GERİ DÖNMEZ (doğru UI davranışı — mockup'ın
  // sabit sekiz seçeneği kapalıdır) — bu yüzden geri alma UI'DAN DEĞİL,
  // aynı `PATCH` ucundan (mock backend `page.request` ile TELDEN) yapılır.
  const restore = await page.request.patch(`/api/backend/personnel/${FIXTURE_ID}`, {
    data: { trade: ORIGINAL_TRADE },
  });
  expect(restore.ok()).toBe(true);

  await page.goto(DETAIL_URL);
  await expect(page.getByTestId("personnel-header-card")).toContainText(ORIGINAL_TRADE);
});

test("İptal detay sayfasına döner; İK alanları düzenleme kipinde de ETKİN", async ({ page }) => {
  await login(page);
  await page.goto(`${DETAIL_URL}/duzenle`);

  // F-İK T4: TC/IBAN artık GERÇEK alanlar (İK-1 sözleşmesi). PENDING kalan
  // tek alan "Bölüm"dür — proje düzeyinde bölüm listeleme ucu yok.
  await expect(page.locator("main").getByLabel("TC Kimlik No")).toBeEnabled();
  await expect(page.locator("main").getByLabel("IBAN")).toBeEnabled();
  await expect(page.locator("main").getByLabel("Bölüm")).toBeDisabled();

  await page.getByRole("button", { name: "İptal" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/personel/${FIXTURE_ID}$`));
});
