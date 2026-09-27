import { test, expect } from "@playwright/test";

// P7 T7 · Hakediş (İşveren) fonksiyonel e2e — `e2e/projects.spec.ts` /
// `e2e/settings.spec.ts` deseninin aynısı. Kapsam (brief §b): listeden
// detaya geçiş, detayın bölümlerinin görünmesi, forma giriş + kaydetme
// akışı, bir durum geçişi (taslak → Onaya Gönder). Zaman aşımına dayalı
// bekleme YOK — her adım `expect(...)`in kendi deterministik yeniden
// denemesiyle bekler.
//
// Mock backend TÜM spec dosyaları arasında TEK bir paylaşılan sunucudur
// (`e2e/global-setup.ts`) — bu test `pp-6` (taslak) kaydını gerçekten
// mutasyona uğratır (satır miktarı + durum). `pp-2`..`pp-5` (görsel
// spec'lerin dayandığı sabit veri) hiç dokunulmaz.
//
// Test determinizmi: `pp-6` mock-backend'de `hiddenFromLists: true` ile
// işaretlidir (bkz. `e2e/mock-backend.ts` · `buildProgressPaymentFixtures`
// İZOLASYON notu) — liste (`GET /progress-payments`) ve özet uçlarından
// dışlanır, yalnız BURADA yapıldığı gibi doğrudan kimlikle okunur/mutasyona
// uğratılır. Bu sayede `progress-payments-visual.spec.ts` ve
// `site-progress-payments-visual.spec.ts` bu testin `fullyParallel` altında
// ne zaman/hangi sırada koştuğundan yapısal olarak bağımsızdır.

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("hakediş: listeden detaya geçiş, form kaydetme, durum geçişi", async ({ page }) => {
  await login(page);

  // 1) Liste → detay geçişi (pp-5, pending_approval — sabit fikstür).
  await page.goto("/hakedisler");
  await expect(page.getByRole("heading", { name: "Hakedişler" })).toBeVisible();
  await page.getByRole("link", { name: "Kule A — #5 — Temmuz 2026" }).click();
  await expect(page).toHaveURL(/\/hakedisler\/pp-5$/);

  // 2) Detayın bölümleri görünür: başlık, KPI şeridi, kalem tablosu, Ödeme
  // Hesabı, Sözleşme İlerlemesi (Ekran 15 61-193).
  await expect(page.getByRole("heading", { name: "#5 — Temmuz 2026" })).toBeVisible();
  await expect(page.getByTestId("pp-detail-kpi").first()).toBeVisible();
  await expect(page.getByText("Betonarme İşleri")).toBeVisible();
  await expect(page.getByText("Ödeme Hesabı")).toBeVisible();
  await expect(page.getByText("Sözleşme İlerlemesi")).toBeVisible();

  // 3) Forma giriş + kaydetme akışı: pp-6 (taslak) düzenleme — bir hücreye
  // miktar girilip "Taslak Kaydet" ile PATCH + PUT …/lines tetiklenir.
  await page.goto("/hakedisler/pp-6/duzenle");
  await expect(page.getByRole("heading", { name: "İşveren Hakediş #6" })).toBeVisible();
  const qtyInput = page.getByLabel("Kat Döşemesi C25/30 — B-Blok Şantiyesi miktar");
  await qtyInput.fill("200");
  await page.getByRole("button", { name: "Taslak Kaydet" }).first().click();
  // Kaydetme başarılı: hata bandı basılmaz, Ödeme Hesabı kartı sunucudan
  // dönen GÜNCEL net tahsili gösterir (185.000 + 370.000 + 105.000 = 660.000
  // brüt → %20 KDV/%20 avans birbirini götürür, %5 teminat kalır → net
  // 660.000 × 0,95 = 627.000).
  await expect(page.getByTestId("pp-form-error")).toHaveCount(0);
  await expect(page.getByText("₺ 627.000")).toBeVisible();

  // 4) Durum geçişi: taslak → Onaya Gönder. Mock geçiş sonrası GÜNCEL
  // detayı döndürür (brief §Belirsizlik çözümü 3) — rozet gerçekten değişir.
  await page.goto("/hakedisler/pp-6");
  await expect(page.getByText("Taslak", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Onaya Gönder" }).click();
  await expect(page.getByText("Onay Bekliyor", { exact: true })).toBeVisible();
});

// F-SD T5 · "Günlükten Doldur" (spec §4). Yalnız OKUR + form state'ini
// değiştirir — HİÇBİR kayıt mutasyona uğramaz (create formu, kaydetme yok),
// bu yüzden görsel spec'lerin fikstürlerinden yapısal olarak bağımsızdır.
// Köprü tablosu: `bi-3 → ci-1`, `bi-4 → ci-3` (bkz. `mock-backend.ts`
// DIARY_BOQ_BRIDGE); `bi-5`/`bi-6` işveren tarafında köprüsüzdür ve
// "atlandı" olarak GÖRÜNÜR bildirilir.
test("hakediş: Günlükten Doldur önerilen miktarları forma yazar, atlananları bildirir", async ({
  page,
}) => {
  await login(page);

  await page.goto("/hakedisler/yeni?project=p-1");
  await expect(page.getByRole("heading", { name: "İşveren Hakediş Oluştur" })).toBeVisible();

  // Günlük fikstürleri Temmuz 2026'dadır — öneri formun DÖNEMİYLE çağrılır.
  await page.locator("main").getByLabel("Hakediş Dönemi").selectOption("7");
  await page.locator("main").getByLabel("Hakediş yılı").fill("2026");

  await page.getByTestId("pp-form-diary-fill").click();

  const notice = page.getByTestId("pp-form-diary-fill-notice");
  await expect(notice).toContainText("2 satır günlük kayıtlardan dolduruldu.");
  await expect(notice).toContainText("günlük pozu sözleşme kalemine bağlı olmadığı için atlandı");
  await expect(
    page.locator("main").getByLabel("Kat Döşemesi C25/30 — A-Blok Şantiyesi miktar"),
  ).toHaveValue("120.000");
  await expect(
    page.locator("main").getByLabel("Nervürlü Demir Ø12–Ø20 — A-Blok Şantiyesi miktar"),
  ).toHaveValue("8.500");

  // Kullanıcı düzeltebilir (spec §4: "kullanıcı düzeltebilir").
  await page.locator("main").getByLabel("Kat Döşemesi C25/30 — A-Blok Şantiyesi miktar").fill("100");
  await expect(
    page.locator("main").getByLabel("Kat Döşemesi C25/30 — A-Blok Şantiyesi miktar"),
  ).toHaveValue("100");
});
