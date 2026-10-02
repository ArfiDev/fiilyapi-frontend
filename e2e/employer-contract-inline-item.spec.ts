import { test, expect, type Page, type Route } from "@playwright/test";

// F-ISVPOZ · İşveren sözleşmesi pozlarının SATIR-İÇİ düzenlenmesi ve
// SATIR-İÇİ eklenmesi (kullanıcı isteği, 2026-08-25).
//
// ---------------------------------------------------------------------------
// 🔒 FİKSTÜR İZOLASYONU — BU DOSYA PAYLAŞILAN MOCK DURUMUNU DEĞİŞTİRMEZ
// ---------------------------------------------------------------------------
// İşveren sözleşmesi mock'ta YALNIZ `p-1` (dolu) ve `p-4` (boş) için vardır.
// İkisi de başka spec'lerin kadrajını besler:
//   · `p-1` → `isveren-sozlesme-kalemler` + `poz-ekle-isveren` kareleri
//   · `p-4` → `isveren-sozlesme-bos-kalemler` + `employer-contract-first-item`
// Yani buradan kalıcı bir yazma yapmak, `contract-distribution.spec.ts`in
// 1.800→1.900 penceresiyle AYNI SINIF bir yarış yaratırdı (kâh eski kâh yeni
// hâl baseline'a girer; öbürü görsel CI'da KIRMIZI). `pinEmployerContractItems`
// yalnız `distributed`/`remaining` kolonlarını sabitler — `quantity` ve
// `unit_price` sabitlenmiş DEĞİLDİR, tam da bu dilimin yazdığı iki alan.
//
// Çözüm: UI'dan çıkan YAZMA istekleri `page.route` ile YAKALANIR ve gövdeleri
// üzerinden iddia edilir; sahte backend'in durumuna hiç ulaşmazlar.
// Bu bir "mock'u onaylayıcıya çevirme" DEĞİLDİR: mock'un gerçekten BEKÇİ
// olduğu son testte AYRI ve doğrudan ölçülür (`page.request` ile ham PATCH →
// 422 beklenir; reddedilen istek durumu zaten değiştirmez).
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (Next route-announcer tuzağı).
// ⚠️ Sabit `waitForTimeout` YOKTUR; her bekleme durum tabanlıdır.

const ITEMS_URL = "/sozlesmeler/isveren/p-1?tab=items";
const PATCH_PREFIX = "/api/backend/contracts/employer/items/";
const POST_PATH = "/api/backend/projects/p-1/contract/items";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

interface CapturedWrite {
  method: string;
  pathname: string;
  body: Record<string, unknown>;
}

/**
 * Yazma uçlarını yakalar ve KANLI CANLI bir yanıtla karşılar (istek sahte
 * backend'e ULAŞMAZ). Dönen dizi, uçan isteklerin ham gövdeleridir.
 */
async function captureWrites(page: Page): Promise<CapturedWrite[]> {
  const writes: CapturedWrite[] = [];
  const handler = async (route: Route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fallback();
      return;
    }
    writes.push({
      method: request.method(),
      pathname: new URL(request.url()).pathname,
      body: JSON.parse(request.postData() ?? "{}") as Record<string, unknown>,
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      // Yanıt gövdesi ekranda BASILMAZ (hook `invalidate` eder, `setQueryData`
      // yapmaz) — kimlik taşıması yeter.
      body: JSON.stringify({ id: "ci-1" }),
    });
  };
  await page.route((url) => url.pathname.startsWith(PATCH_PREFIX), handler);
  await page.route((url) => url.pathname === POST_PATH, handler);
  return writes;
}

async function gotoLoadedItems(page: Page) {
  await login(page);
  await page.goto(ITEMS_URL);
  // YÜKLENDİ: tablo gerçekten doldu (türev kolonlar + toplam satırı basıldı).
  await expect(page.getByTestId("ecd-item-distributed").first()).toBeVisible();
  await expect(page.getByTestId("ecd-items-total")).toBeVisible();
}

// ---------------------------------------------------------------------------
// 1) Hücre düzenleme — emsalin tetikleyicisi (odak çıkışı)
// ---------------------------------------------------------------------------
test("poz miktarı hücrede düzenlenir ve odak çıkışında KISMİ PATCH uçar", async ({ page }) => {
  const writes = await captureWrites(page);
  await gotoLoadedItems(page);

  const quantity = page.locator("main").getByLabel("03.001 miktar");
  await expect(quantity).toBeEditable();
  await quantity.fill("3300");
  await quantity.blur();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe("PATCH");
  expect(writes[0].pathname).toBe(`${PATCH_PREFIX}ci-1`);
  // 🔴 KISMİ: dokunulmayan alanlar gövdeye GİRMEZ.
  expect(writes[0].body).toEqual({ quantity: "3300" });
});

test("birim fiyat hücresi ayrı PATCH'lenir; miktar gövdeye karışmaz", async ({ page }) => {
  const writes = await captureWrites(page);
  await gotoLoadedItems(page);

  const price = page.locator("main").getByLabel("03.002 birim fiyatı");
  await price.fill("2.250,50");
  await price.blur();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toEqual({ unit_price: "2250.50" });
});

// SZK-F1 · var olan satırın poz no / ad / birim hücreleri
test("poz no hücresi düzenlenir; PATCH gövdesi YALNIZ {code} taşır", async ({ page }) => {
  const writes = await captureWrites(page);
  await gotoLoadedItems(page);

  const code = page.locator("main").getByLabel("03.001 poz no");
  await expect(code).toBeEditable();
  await code.fill("03.001-A");
  await code.blur();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe("PATCH");
  expect(writes[0].pathname).toBe(`${PATCH_PREFIX}ci-1`);
  expect(writes[0].body).toEqual({ code: "03.001-A" });
});

test("şantiye BOQ çakışması (409): sunucu metni AYNEN hata bandında görünür", async ({ page }) => {
  const detail = "Bu poz numarası hedef şantiyede zaten kullanılıyor: Şantiye A · 03.777";
  // Mock durumuna YAZILMAZ: istek `page.route` ile karşılanır.
  await page.route(
    (url) => url.pathname === `${PATCH_PREFIX}ci-1`,
    async (route) => {
      if (route.request().method() === "GET") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail }),
      });
    },
  );
  await gotoLoadedItems(page);

  const code = page.locator("main").getByLabel("03.001 poz no");
  await code.fill("03.777");
  await code.blur();

  await expect(page.getByTestId("ecd-items-error-line")).toHaveText(`03.001 · Poz No: ${detail}`);
});

// ---------------------------------------------------------------------------
// 2) 🔴 KISIT KORKULUĞU — tipte YAŞAMAYAN kural, tarayıcıda bekçilenir
// ---------------------------------------------------------------------------
test("miktar SIFIR: istek HİÇ UÇMAZ, sebep görünür basılır, hücre eski değerine döner", async ({
  page,
}) => {
  const writes = await captureWrites(page);
  await gotoLoadedItems(page);

  const quantity = page.locator("main").getByLabel("03.001 miktar");
  await quantity.fill("0");
  await quantity.blur();

  await expect(page.getByTestId("ecd-items-error")).toContainText(
    "Miktar sıfırdan büyük olmalıdır.",
  );
  await expect(quantity).toHaveValue("3.200");
  expect(writes).toEqual([]);
});

test("negatif birim fiyat: istek HİÇ UÇMAZ", async ({ page }) => {
  const writes = await captureWrites(page);
  await gotoLoadedItems(page);

  const price = page.locator("main").getByLabel("03.002 birim fiyatı");
  await price.fill("-1");
  await price.blur();

  await expect(page.getByTestId("ecd-items-error")).toContainText("Birim Fiyat negatif olamaz.");
  expect(writes).toEqual([]);
});

// ---------------------------------------------------------------------------
// 3) Satır-içi poz ekleme
// ---------------------------------------------------------------------------
test("satır-içi ekleme: taslak satır TABLONUN İÇİNDE açılır (modal AÇILMAZ) ve POST eder", async ({
  page,
}) => {
  const writes = await captureWrites(page);
  await gotoLoadedItems(page);

  await page.getByTestId("ecd-add-row-cg-1").click();
  await expect(page.getByTestId("ecd-new-row")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.locator("main").getByLabel("Yeni poz no").fill("03.900");
  await page.locator("main").getByLabel("Yeni poz adı").fill("Satır-içi eklenen poz");
  await page.locator("main").getByLabel("Yeni poz birimi").selectOption("m³");
  await page.locator("main").getByLabel("Yeni poz birim fiyatı").fill("1750");
  await page.locator("main").getByLabel("Yeni poz miktarı").fill("42,5");
  await page.getByTestId("ecd-new-row-submit").click();

  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe("POST");
  expect(writes[0].pathname).toBe(POST_PATH);
  // `group_id` bir ALANDAN değil, satırın KONUMUNDAN gelir.
  expect(writes[0].body.group_id).toBe("cg-1");
  expect(writes[0].body.code).toBe("03.900");
  expect(writes[0].body.quantity).toBe("42.5");
  expect(writes[0].body.unit_price).toBe("1750");
  // Başarıda taslak kapanır.
  await expect(page.getByTestId("ecd-new-row")).toHaveCount(0);
});

test("satır-içi ekleme: miktarı SIFIR olan taslak POST EDİLMEZ", async ({ page }) => {
  const writes = await captureWrites(page);
  await gotoLoadedItems(page);

  await page.getByTestId("ecd-add-row-cg-1").click();
  await page.locator("main").getByLabel("Yeni poz no").fill("03.901");
  await page.locator("main").getByLabel("Yeni poz adı").fill("Sıfır miktarlı poz");
  await page.locator("main").getByLabel("Yeni poz birimi").selectOption("m³");
  await page.locator("main").getByLabel("Yeni poz birim fiyatı").fill("100");
  await page.locator("main").getByLabel("Yeni poz miktarı").fill("0");
  await page.getByTestId("ecd-new-row-submit").click();

  await expect(page.getByTestId("ecd-items-error")).toHaveText(
    "Miktar sıfırdan büyük olmalıdır.",
  );
  expect(writes).toEqual([]);
  // Taslak AÇIK kalır — kullanıcı düzeltebilsin.
  await expect(page.getByTestId("ecd-new-row")).toBeVisible();
});

// ---------------------------------------------------------------------------
// 4) 🔴 MOCK BEKÇİ Mİ, ONAYLAYICI MI?
// ---------------------------------------------------------------------------
// Kontrol sorusu: "bu mock, gerçek backend'in REDDEDECEĞİ bir isteği
// reddediyor mu?" — İstemci korkuluğu sökülse bile bu testler KIRMIZI olmalı.
// Reddedilen istek durumu DEĞİŞTİRMEZ, bu yüzden fikstür izolasyonu bozulmaz.
// ---------------------------------------------------------------------------
test("sahte backend `quantity = 0` ve negatif fiyatı REDDEDER (422) — onaylayıcı değil bekçi", async ({
  page,
}) => {
  await login(page);

  const zero = await page.request.patch(`${PATCH_PREFIX}ci-1`, { data: { quantity: "0" } });
  expect(zero.status()).toBe(422);

  const negativeQuantity = await page.request.patch(`${PATCH_PREFIX}ci-1`, {
    data: { quantity: "-3" },
  });
  expect(negativeQuantity.status()).toBe(422);

  const negativePrice = await page.request.patch(`${PATCH_PREFIX}ci-1`, {
    data: { unit_price: "-1" },
  });
  expect(negativePrice.status()).toBe(422);

  // Var olmayan kalem → 404 (görünmeyen kayıtla ayırt edilemez).
  const missing = await page.request.patch(`${PATCH_PREFIX}ci-yok`, {
    data: { quantity: "5" },
  });
  expect(missing.status()).toBe(404);
});
