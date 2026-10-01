import { test, expect, type Page } from "@playwright/test";

import { installFakeDiaryServer } from "./site-diary-fake-create";

// F-SD T6 · Şantiye Günlüğü fonksiyonel e2e (görsel DEĞİL).
// Kapsam: Kayıt Gir akışı (taslak aç → miktar → Taslak Kaydet → Kaydet &
// Gönder → Yeniden Aç), mod anahtarı geçişleri, Hakediş Özeti ay gezinmesi +
// tablo, 409 akışı. "Günlükten Doldur" akışları T5'te yazıldı
// (`progress-payments.spec.ts` / `subcontractor-progress-payments.spec.ts`) —
// burada TEKRARLANMAZ.
//
// ⏱️ TARİH SABİTLEME (zorunlu): ekranın varsayılan günü BUGÜNdür
// (`derive.ts · isoDate(new Date())`) ve Hakediş Özeti'nin varsayılan dönemi
// içinde bulunulan aydır. Sabitlenmezse testler yarın başka bir güne bakar.
// `page.clock.setFixedTime` NAVİGASYONDAN ÖNCE kurulur (aynı yöntem:
// `section-detail-visual.spec.ts`).
//
// 🔒 FİKSTÜR İZOLASYONU (P7 dersi): mock backend TÜM spec dosyalarında TEK
// paylaşılan sunucudur (fullyParallel). Bu dosya mock durumuna HİÇBİR yazma
// göndermez: kaydı açan akış (POST + gönder/yeniden aç) `page.route` ile
// yakalanır (`site-diary-fake-create.ts`), 409 testi de öyle. Okuma testleri
// Temmuz fikstürlerine bakar, değiştirmez; Eylül yalnız "kayıtsız ay" içindir.

const SITE_DIARY_URL = "/projeler/p-1/santiyeler/s-1/gunluk-kayit";

/** Temmuz fikstürlerinin AYI, ama kayıt OLMAYAN bir gün (409'a takılmaz). */
const JULY_FREE_DAY = "2026-07-20T09:00:00Z";
/** Kayıt akışının günü — hiçbir fikstür/başka spec Eylül'e bakmaz (mock'a yazılmaz). */
const SEPTEMBER_FREE_DAY = "2026-09-10T09:00:00Z";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("günlük kayıt: mod anahtarı, son kayıtlar ve gün seçimi (SALT-OKUR)", async ({ page }) => {
  await page.clock.setFixedTime(new Date(JULY_FREE_DAY));
  await login(page);

  await page.goto(SITE_DIARY_URL);
  const content = page.locator("main");
  await expect(page.getByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" })).toBeVisible();

  // Mod anahtarı (GK164-168): "Kayıt Gir" aktif; "Planlama" ve "Hakediş Özeti"
  // GERÇEK bağlantıdır (F-PL T2 ile Planlama rotası açıldı, devre dışı değil).
  const modeSwitch = page.getByRole("group", { name: "Görünüm seçimi" });
  await expect(modeSwitch.getByText("Kayıt Gir")).toHaveAttribute("aria-current", "page");
  await expect(modeSwitch.getByRole("link", { name: "Planlama" })).toHaveAttribute(
    "href",
    /\/gunluk-kayit\/planlama$/,
  );

  // Son Kayıtlar (GK356-386) — Temmuz fikstürleri, türetilmiş rozetlerle.
  const recent = content.locator(".diary-recent__list");
  await expect(recent.getByText("16 Temmuz")).toBeVisible();
  await expect(recent.getByText("15 Temmuz")).toBeVisible();
  await expect(recent.getByText("Yağışlı")).toBeVisible();

  // 20 Temmuz'da kayıt YOK → GKS-F1: satırlar kaydı beklemeden iskelet
  // önizlemesinden (GET /diary/skeleton) gelir; eski "Önce Taslak Kaydet" boş
  // metni artık YOK. Bölüm seçili değil → şantiyenin tüm kalemleri, miktar boş.
  await expect(content.getByLabel("01.001 bugün yapılan miktar")).toHaveValue("");
  await expect(content.getByLabel("02.002 bugün yapılan miktar")).toBeVisible();
  await expect(content.getByText("İş kalemi satırları, gün için kayıt açıldığında", { exact: false })).toHaveCount(0);
  await expect(content.getByText("Önce Taslak Kaydet", { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Kaydet & Gönder" })).toBeDisabled();

  // Satıra tıklayınca O GÜNÜN kaydı açılır (GK359) — 16 Temmuz taslak kaydı.
  await recent.getByText("16 Temmuz").click();
  await expect(content.locator(".diary__status-row")).toContainText("Taslak");
  // Satırlar sunucudan geldi: İç Sıva pozunda kaydın miktarı görünür.
  await expect(content.getByLabel("03.002 bugün yapılan miktar")).toHaveValue("180.000");
  // Kümülatif ve ₺ sütunları YANITTAN gelir — ekran çarpma yapmaz.
  await expect(content.locator(".diary-lines__total-amount")).toContainText("₺ 26.100");

  // Gönderilmiş kayıt SALT-OKUNURDUR: 15 Temmuz'a geçince yazma yüzeyi kapanır.
  await recent.getByText("15 Temmuz").click();
  await expect(content.getByText("Gönderilmiş kayıt salt-okunurdur.", { exact: false })).toBeVisible();
  await expect(content.getByLabel("02.001 bugün yapılan miktar")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Taslak Kaydet" })).toHaveCount(0);
  // Mock oturum `permissions` taşımadığı için bilinmezlik kuralı geçerli →
  // admin eşiği açık, "Yeniden Aç" basılır.
  await expect(page.getByRole("button", { name: "Yeniden Aç" })).toBeVisible();
});

test("günlük kayıt: önizlemeden miktar gir → Taslak Kaydet (tek POST) → Kaydet & Gönder → Yeniden Aç", async ({
  page,
}) => {
  // 🔒 MOCK'A YAZMAZ: POST/submit/reopen `page.route` ile yakalanır
  // (`site-diary-fake-create.ts`); yanıtlar iskelet önizlemesinden + istek
  // gövdesinden türetilir. Paylaşılan mock durumu (fullyParallel görsel kareler)
  // değişmez, bu yüzden günün Temmuz/Eylül olması artık yarış doğurmaz.
  await page.clock.setFixedTime(new Date(SEPTEMBER_FREE_DAY));
  await login(page);
  const fake = await installFakeDiaryServer(page, "s-1");

  await page.goto(SITE_DIARY_URL);
  const content = page.locator("main");
  await expect(page.getByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" })).toBeVisible();
  await expect(content.getByLabel("Tarih")).toHaveValue("10.09.2026");
  await expect(content.locator(".diary-recent__list")).toContainText("Bu ayda henüz günlük kayıt yok.");

  // 1) Kayıt YOKKEN satırlar önizlemeden gelir; Taslak Kaydet'e BASMADAN miktar girilir.
  const quantity = content.getByLabel("01.001 bugün yapılan miktar");
  await expect(quantity).toBeVisible();
  await expect(quantity).toHaveValue("");
  await expect(content.locator(".diary__status-row")).not.toContainText("Taslak");

  // 2) Miktar girilir → sağ panelde görünür "kaydedilmemiş değişiklik" uyarısı.
  await quantity.fill("12");
  await expect(content.locator(".diary-recent__warning")).toBeVisible();

  // 3) "Taslak Kaydet" başlığı + satırları TEK istekte yazar; toplam yanıttan döner
  //    (12 × ₺280 = ₺3.360 — ekran bu çarpımı YAPMAZ).
  await page.getByRole("button", { name: "Taslak Kaydet" }).click();
  await expect(content.locator(".diary__status-row")).toContainText("Taslak");
  await expect(page.locator(".diary-lines__total-amount")).toContainText("₺ 3.360");
  await expect(content.locator(".diary-recent__warning")).toHaveCount(0);

  // Gövde: TEK POST, girilen miktar `lines` içinde, PUT lines / PATCH YOK.
  expect(fake.createBodies).toHaveLength(1);
  const [body] = fake.createBodies;
  expect(body.entry_date).toBe("2026-09-10");
  expect(body.lines).toEqual([expect.objectContaining({ boq_item_id: "bi-1", quantity: 12 })]);
  expect(fake.writeCalls).toEqual({ putLines: 0, patch: 0 });

  // 4) "Kaydet & Gönder" → kayıt gönderilir ve salt-okunur olur.
  await page.getByRole("button", { name: "Kaydet & Gönder" }).click();
  await expect(page.locator(".diary__status-row")).toContainText("Gönderildi");
  await expect(page.getByText("Gönderilmiş kayıt salt-okunurdur.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Taslak Kaydet" })).toHaveCount(0);
  await expect(page.getByLabel("01.001 bugün yapılan miktar")).toBeDisabled();

  // 5) "Yeniden Aç" kaydı taslağa döndürür, form yeniden yazılabilir olur.
  await page.getByRole("button", { name: "Yeniden Aç" }).click();
  await expect(page.locator(".diary__status-row")).toContainText("Taslak");
  await expect(page.getByLabel("01.001 bugün yapılan miktar")).toBeEnabled();
  expect(fake.createBodies).toHaveLength(1);
});

test("günlük kayıt: aynı güne ikinci kayıt 409 → Türkçe mesaj + mevcut kayda yönlendirme", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(JULY_FREE_DAY));
  await login(page);

  // 409 YARIŞ durumudur (liste güncel değilken başka bir istemci o günü
  // açmış olabilir) — mock veriyi bozmadan, YALNIZ kayıt açma isteği
  // araya girilerek deterministik üretilir. Fikstürler MUTASYONA UĞRAMAZ.
  await page.route("**/api/backend/sites/s-1/diary", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ detail: "Bu güne ait günlük kayıt zaten var." }),
    });
  });

  await page.goto(SITE_DIARY_URL);
  const content = page.locator("main");
  await expect(page.getByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" })).toBeVisible();

  await page.getByRole("button", { name: "Taslak Kaydet" }).click();

  const error = content.locator(".diary__error");
  await expect(error).toContainText("Bu güne ait günlük kayıt zaten var.");
  // Yönlendirme: kullanıcı çıkmazda bırakılmaz, mevcut kaydı açabilir.
  await page.getByRole("button", { name: "Var olan kaydı aç" }).click();
  await expect(content.locator(".diary__error")).toHaveCount(0);
});

test("hakediş özeti: mod geçişi, ay gezinmesi ve poz bazlı birikim tablosu", async ({ page }) => {
  await page.clock.setFixedTime(new Date(JULY_FREE_DAY));
  await login(page);

  await page.goto(SITE_DIARY_URL);
  const content = page.locator("main");
  await page.getByRole("link", { name: "Hakediş Özeti" }).click();
  await expect(page).toHaveURL(/\/gunluk-kayit\/ozet$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Hakediş Özeti — A-Blok Şantiyesi" }),
  ).toBeVisible();

  // Varsayılan dönem = içinde bulunulan ay (sabitlenmiş saat → Temmuz 2026).
  const monthLabel = content.locator(".diary-month-nav__label");
  await expect(monthLabel).toHaveText("Temmuz 2026");

  // Tablo YALNIZ `submitted` günlerden beslenir: d-1 gönderilmiş (bi-3/bi-4/
  // bi-5), d-2 taslak olduğu için İç Sıva satırı GÖRÜNMEZ.
  const table = content.locator(".diary-summary-table");
  await expect(table.getByText("C25/30 Beton (Döşeme)")).toBeVisible();
  await expect(table.getByText("Demir Donatı (Ø8-Ø20)")).toBeVisible();
  await expect(table.getByText("İç Sıva (Çimento+Alçı)")).toHaveCount(0);

  // Ay gezinmesi (HÖ90/92): Haziran'da gönderilmiş gün yok → dürüst boş durum.
  await page.getByRole("button", { name: "Önceki ay" }).click();
  await expect(monthLabel).toHaveText("Haziran 2026");
  await expect(content.getByText("Bu ay gönderilmiş günlük kayıt yok", { exact: false })).toBeVisible();

  // Geri dönüşte tablo yeniden dolar.
  await page.getByRole("button", { name: "Sonraki ay" }).click();
  await expect(monthLabel).toHaveText("Temmuz 2026");
  await expect(table.getByText("C25/30 Beton (Döşeme)")).toBeVisible();

  // Mod anahtarı geri "Kayıt Gir"e döner (Planlama burada da gerçek link).
  const modeSwitch = page.getByRole("group", { name: "Görünüm seçimi" });
  await expect(modeSwitch.getByRole("link", { name: "Planlama" })).toBeVisible();
  await modeSwitch.getByRole("link", { name: "Kayıt Gir" }).click();
  await expect(page).toHaveURL(/\/gunluk-kayit$/);
  await expect(page.getByRole("heading", { level: 1, name: "Günlük Kayıt & Planlama" })).toBeVisible();
});
