import { test, expect, type Page, type Route } from "@playwright/test";

// F-P8 T3 · DS (`/satis/yeni`) Yeni Satış formu — FONKSİYONEL e2e (görsel DEĞİL;
// görsel spec'ler T4'te, dosya adında "gorsel"/"visual" GEÇMEZ ki 5. kapıda
// koşsun).
//
// 🔒 FİKSTÜR İZOLASYONU (F-PL/F-ST dersi): mock backend TÜM spec'lerde TEK
// paylaşılan sunucudur ve DURUM SIFIRLANMAZ. `sales.spec.ts` `p-2`yi BOŞ okur;
// başarılı bir satış YAZMASI bu okumayı ve T4 baseline'larını sessizce kırardı.
// Bu yüzden OKUMA uçları GERÇEK sunucuya gider (proje/ünite/müşteri/maliyet
// telden gelir) ama YAZMA uçları (`POST customers` · `POST …/sales` ·
// `generate-plan` · `PUT installments`) `page.route` ile YAKALANIR ve
// fulfill'lenir — paylaşılan durum HİÇ değişmez, akış yine TELDEN kanıtlanır.
//
// ⚠️ `getByRole("alert")` ve sabit `waitForTimeout` bu depoda YASAKTIR.

const FORM_URL = "/satis/yeni";
const WRITE_PROJECT = "p-2"; // Villa B — yazma alanı
const WRITE_UNIT = "u-p2-1"; // liste fiyatı 8.400.000, maliyet 0.62× = 5.208.000

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/** Yalnız POST'u yakala, diğer metotları GERÇEK sunucuya bırak. */
function interceptPost(route: Route, onBody: (body: unknown) => void, response: unknown) {
  if (route.request().method() !== "POST") return route.continue();
  onBody(route.request().postDataJSON());
  return route.fulfill({
    status: 201,
    contentType: "application/json",
    body: JSON.stringify(response),
  });
}

test("p-2 yazma akışı: müşteri→ünite→bedel→Plan Oluştur (Σ=bedel TELDEN)→kaydet", async ({
  page,
}) => {
  await login(page);

  const salePostBodies: Array<Record<string, unknown>> = [];
  let generatePlanUrl: string | null = null;
  const putInstallmentsBodies: Array<Record<string, unknown>> = [];

  // Müşteri POST → paylaşılan durumu KİRLETMEDEN sabit yanıt.
  await page.route(`**/api/backend/customers`, (route) =>
    interceptPost(route, () => undefined, {
      id: "cus-test",
      customer_type: "person",
      name: "Test Alıcı",
      national_id: "12345678901",
      tax_number: null,
      phone: "0532 000 00 00",
      email: null,
      address: null,
    }),
  );

  // Satış POST → gövde toplanır, sabit `id` döner (durum değişmez).
  await page.route(`**/api/backend/projects/${WRITE_PROJECT}/sales`, (route) =>
    interceptPost(route, (body) => salePostBodies.push(body as Record<string, unknown>), {
      id: "sl-test",
      sale_type: (route.request().postDataJSON() as { sale_type?: string }).sale_type ?? "sale",
    }),
  );

  // generate-plan → TOPLAM = sale_price (Σ kuralı sunucudan). İki taksit,
  // toplamı 8.400.000 (peşinat 2.400.000 + 6.000.000).
  await page.route(`**/api/backend/sales/*/generate-plan`, (route) => {
    generatePlanUrl = route.request().url();
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sale_id: "sl-test",
        sale_price: "8400000.00",
        total_amount: "8400000.00",
        paid_amount: "0.00",
        term_interest_amount: "0.00",
        items: [
          { id: "si-1", sale_id: "sl-test", sequence_no: 1, label: "Peşinat", due_date: "2026-09-01", amount: "2400000.00", payment_method: "transfer", paid_amount: "0.00", paid_at: null, remaining_amount: "2400000.00", is_overdue: false },
          { id: "si-2", sale_id: "sl-test", sequence_no: 2, label: "1. Taksit", due_date: "2026-10-01", amount: "6000000.00", payment_method: null, paid_amount: "0.00", paid_at: null, remaining_amount: "6000000.00", is_overdue: false },
        ],
      }),
    });
  });

  // PUT installments = DEĞİŞTİRME: düzenlenmiş plan BÜTÜN olarak gelmelidir.
  await page.route(`**/api/backend/sales/*/installments`, (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    putInstallmentsBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sale_id: "sl-test",
        sale_price: "8400000.00",
        total_amount: "8400000.00",
        paid_amount: "0.00",
        term_interest_amount: "0.00",
        items: [],
      }),
    });
  });

  await page.goto(FORM_URL);
  await expect(page.getByRole("heading", { name: "Yeni Satış Kaydı", level: 1 })).toBeVisible();

  // Belgeler kartı PENDING: gerçek yükleme yüzeyi yok.
  await expect(page.locator('main input[type="file"]')).toHaveCount(0);

  // Proje + ünite (GERÇEK sunucudan) → maliyet ve kâr TELDEN türetilir.
  await page.getByTestId("satis-form-proje").selectOption(WRITE_PROJECT);
  await page.getByTestId("satis-form-unite").selectOption(WRITE_UNIT);
  await expect(page.getByTestId("satis-form-maliyet")).toContainText("₺5.208.000");

  // Yeni müşteri (inline) + bedel + plan parametreleri.
  await page.getByTestId("satis-form-alici-ad").fill("Test Alıcı");
  await page.getByTestId("satis-form-alici-kimlik").fill("12345678901");
  await page.getByTestId("satis-form-alici-telefon").fill("0532 000 00 00");
  await page.getByTestId("satis-form-satis-bedeli").fill("8400000");

  // "Bu Satıştan Kâr" = bedel − sunucu maliyeti (8.400.000 − 5.208.000).
  await expect(page.getByTestId("satis-form-kar")).toContainText("₺3.192.000");

  await page.getByTestId("satis-form-pesinat").fill("2400000");
  await page.getByTestId("satis-form-taksit-sayisi").fill("2");
  await page.getByTestId("satis-form-ilk-taksit").fill("01.09.2026");

  // Plan Oluştur → önce POST sales, sonra generate-plan.
  await page.getByTestId("satis-form-plan-olustur").click();
  await expect(page.getByTestId("satis-form-plan-tablo")).toBeVisible();

  // Σ = sale_price TELDEN (sunucunun total_amount'u; istemci toplamaz).
  await expect(page.getByTestId("satis-form-plan-toplam")).toContainText("₺8.400.000");
  expect(generatePlanUrl).not.toBeNull();

  // POST sales gövdesi: has_* DAİMA var, customer_id yeni müşteriden, unit doğru.
  expect(salePostBodies).toHaveLength(1);
  expect(salePostBodies[0]).toHaveProperty("has_condominium_easement");
  expect(salePostBodies[0]).toHaveProperty("has_mortgage");
  expect(salePostBodies[0].customer_id).toBe("cus-test");
  expect(salePostBodies[0].unit_id).toBe(WRITE_UNIT);

  // Plan satırını düzenle → kaydetmede PUT DEĞİŞTİRME (tam plan gider).
  await page.locator("main").getByLabel("1. taksit ödeme şekli").selectOption("cash");
  await page.getByTestId("satis-form-plan-uyari").waitFor();
  await page.getByTestId("satis-form-kaydet").click();

  await expect(page).toHaveURL(/\/satis$/);
  expect(putInstallmentsBodies).toHaveLength(1);
  const items = (putInstallmentsBodies[0].items ?? []) as unknown[];
  expect(items).toHaveLength(2); // BÜTÜN plan gider (kısmi değil)
});

test("'Rezervasyon Yap' aynı POST'a sale_type=reservation gönderir (kayıtlı müşteriyle)", async ({
  page,
}) => {
  await login(page);

  const salePostBodies: Array<Record<string, unknown>> = [];
  let customerPostCalled = false;

  await page.route(`**/api/backend/customers`, (route) => {
    if (route.request().method() === "POST") customerPostCalled = true;
    return route.continue(); // GET listesi GERÇEK sunucudan gelir
  });
  await page.route(`**/api/backend/projects/${WRITE_PROJECT}/sales`, (route) =>
    interceptPost(route, (body) => salePostBodies.push(body as Record<string, unknown>), {
      id: "sl-test-2",
      sale_type: "reservation",
    }),
  );
  await page.route(`**/api/backend/sales/*/generate-plan`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        sale_id: "sl-test-2",
        sale_price: "8400000.00",
        total_amount: "8400000.00",
        paid_amount: "0.00",
        term_interest_amount: "0.00",
        items: [],
      }),
    }),
  );

  await page.goto(FORM_URL);
  await page.getByTestId("satis-form-proje").selectOption(WRITE_PROJECT);
  await page.getByTestId("satis-form-unite").selectOption(WRITE_UNIT);

  // Kayıtlı müşteri seç (global fikstür cus-1 Ayşe Yılmaz) — POST /customers ATLANIR.
  await page.getByTestId("satis-form-musteri-sec").selectOption("cus-1");
  await page.getByTestId("satis-form-satis-bedeli").fill("8000000");

  await page.getByTestId("satis-form-rezervasyon").click();

  await expect(page).toHaveURL(/\/satis$/);
  expect(customerPostCalled).toBe(false); // kayıtlı müşteri → yeni müşteri açılmaz
  expect(salePostBodies).toHaveLength(1);
  expect(salePostBodies[0].sale_type).toBe("reservation");
  expect(salePostBodies[0].customer_id).toBe("cus-1");
});
