import { test, expect, type Page } from "@playwright/test";

// F-BC T4 · Ekran 12 genel belge arşivi (`/belgeler`) FONKSİYONEL e2e'si —
// görsel spec'ler T5'te.
//
// Kapsam: kabuk sidebar girişi (ComingSoon DEĞİL), proje kökleri (S4), URL
// durumu (`?proje=`/`?folder=`/`?q=`), kart ızgarası + indirme, "Son
// Eklenenler" (İndir düğmesi YOK) ve KAPSAM KURALININ telden kanıtı: hiçbir
// istek `site_id` TAŞIMAZ.
//
// ⏱️ TARİH SABİTLEME (zorunlu): "Bugün"/"Dün" etiketleri gerçek saate bağlıdır
// ve belge fikstürleri TEMMUZ 2026'dadır (site-documents spec'iyle aynı yöntem).
//
// 🔒 FİKSTÜR İZOLASYONU: bu dosya SALT-OKURDUR — p-1 proje düzeyi belgeleri
// (E12 baseline kaynağı) ve s-1 hiç değiştirilmez.

const ARCHIVE_URL = "/belgeler";
const FIXED_NOW = "2026-07-17T13:00:00Z";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("kabuk sidebar'ındaki 'Belge Arşivi' gerçek ekranı açar (ComingSoon DEĞİL)", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);

  await page.getByRole("navigation").getByRole("link", { name: "Belge Arşivi" }).first().click();
  await expect(page).toHaveURL(/\/belgeler$/);
  await expect(page.getByRole("navigation", { name: "Belge klasörleri" })).toBeVisible();
  await expect(page.locator("main").getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
});

test("klasör paneli kökleri PROJELERDİR; proje seçimi klasörleri açar (S4)", async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await page.goto(ARCHIVE_URL);

  // E12 71-73 — başlık + "+" (sayı rozeti YOK)
  const panel = page.getByRole("navigation", { name: "Belge klasörleri" });
  await expect(panel.getByText("Klasörler")).toBeVisible();

  // Proje seçilmeden yönlendirme metni basılır (uydurma satır YOK)
  await expect(page.locator("main").getByText("Belgeleri görmek için soldaki panelden bir proje seçin.")).toBeVisible();

  await panel.getByRole("link", { name: /Kule A/ }).first().click();
  await expect(page).toHaveURL(/\?proje=p-1/);

  // E12 79-98 — seçilen projenin PROJE DÜZEYİ klasörleri girintili gelir
  await expect(panel.getByRole("link", { name: /Sözleşmeler/ }).first()).toBeVisible();
  await expect(panel.getByRole("link", { name: /Hakedişler/ }).first()).toBeVisible();

  // E12 118-119 — breadcrumb + başlık
  await panel.getByRole("link", { name: /Hakedişler/ }).first().click();
  await expect(page).toHaveURL(/folder=df-p1-2/);
  await expect(page.locator("main").getByText("Kule A / Hakedişler")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Hakedişler" })).toBeVisible();
});

// ⚠️⚠️ Bu dilimin EN KRİTİK testi (spec §2): E12 proje düzeyidir.
test("kapsam kuralı: HİÇBİR istek site_id taşımaz, şantiye belgesi görünmez", async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);

  const documentUrls: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/\/api\/backend\/(documents|projects\/[^/]+\/document-folders)/.test(url)) {
      documentUrls.push(url);
    }
  });

  await page.goto(`${ARCHIVE_URL}?proje=p-1`);
  const panel = page.getByRole("navigation", { name: "Belge klasörleri" });
  await panel.getByRole("link", { name: /Hakedişler/ }).first().click();
  await expect(page).toHaveURL(/folder=df-p1-2/);
  await expect(
    page.getByRole("button", { name: /Hakediş_47_Güneşkent\.pdf/ }).first(),
  ).toBeVisible();

  expect(documentUrls.length).toBeGreaterThan(0);
  for (const url of documentUrls) {
    expect(url, `site_id TAŞIYAN istek (E12 proje düzeyidir): ${url}`).not.toContain("site_id");
  }

  // Şantiye (s-1) belgeleri E12'de GÖRÜNMEZ — kapsamın görünür kanıtı.
  await page.goto(`${ARCHIVE_URL}?proje=p-1`);
  await expect(page.locator("main").getByText("Hakediş_5_Jul2026.pdf")).toHaveCount(0);
  await expect(page.locator("main").getByText("Yapı_Ruhsatı_2025.pdf")).toHaveCount(0);
});

test("kart ızgarası, arama ve indirme", async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await page.goto(`${ARCHIVE_URL}?proje=p-1&folder=df-p1-2`);

  // E12 128-158 — tip ikonu + ad + "boyut · tarih"
  const card = page.getByRole("button", { name: /Hakediş_47_Güneşkent\.pdf/ }).first();
  await expect(card).toContainText("1,2 MB · Bugün");

  // ⚠️ TUZAK (F-BC T2 dersi): Chromium indirme adındaki ASCII dışı harfleri
  // alt çizgiye çevirir; ada tam eşitlik yerine desen bakılır.
  const download = page.waitForEvent("download");
  await card.click();
  expect((await download).suggestedFilename()).toMatch(/^Hakedi.*_47_G.*\.pdf$/);

  // E12 35 — arama sunucuda (`?q=`), klasör süzgecini KORUR
  await page.getByRole("searchbox", { name: "Belge ara" }).fill("metraj");
  await expect(page).toHaveURL(/folder=df-p1-2/);
  await expect(page).toHaveURL(/q=metraj/);
  await expect(page.getByRole("button", { name: /Metraj_Tablosu\.xlsx/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Hakediş_44\.pdf/ })).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Belge ara" }).fill("boyleBirBelgeYok");
  await expect(page.locator("main").getByText("Aramanızla eşleşen belge bulunamadı.")).toBeVisible();
});

test("'Son Eklenenler' listesinde İndir düğmesi YOKTUR; satır tıklaması indirir", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await page.goto(`${ARCHIVE_URL}?proje=p-1&folder=df-p1-2`);

  const recent = page.getByRole("list", { name: "Son eklenen belgeler" });
  await expect(recent).toBeVisible();
  // ŞB'den TEK farkı budur (E12 166-184'te düğme çizilmemiştir).
  await expect(recent.getByRole("button", { name: "İndir" })).toHaveCount(0);

  const download = page.waitForEvent("download");
  await recent.getByRole("button").first().click();
  expect((await download).suggestedFilename()).toMatch(/\.(pdf|xlsx|jpg)$/);
});

// BASILMAYANLAR (spec §4) — canlı DOM üzerinde sızıntı taraması.
test("basılmayanlar: belge silme / klasör düzenleme / versiyon yüzeyi YOKTUR", async ({ page }) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);
  await page.goto(`${ARCHIVE_URL}?proje=p-1&folder=df-p1-2`);
  await expect(page.getByRole("heading", { level: 1, name: "Hakedişler" })).toBeVisible();

  await expect(page.getByRole("button", { name: /^sil$/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /yeniden adlandır/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /klasörü sil/i })).toHaveCount(0);
  await expect(page.locator("main").getByText(/versiyon/i)).toHaveCount(0);
  await expect(page.locator("main").getByText(/onay bekliyor/i)).toHaveCount(0);
});

// Yazma akışı: fikstür izolasyonu için p-1'in BAŞKA bir projesinde (p-2) yürür
// ve API'den temizlenir (T3 deseni) — E12 baseline kaynağı p-1 bozulmaz.
test("proje düzeyi yükleme: diyalog multipart gönderir, liste tazelenir, site_id YOK", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await login(page);

  const uploadUrls: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/backend\/documents$/.test(r.url())) uploadUrls.push(r.url());
  });

  const filename = `e2e-arsiv-${Date.now()}.pdf`;
  await page.goto(`${ARCHIVE_URL}?proje=p-2`);
  await page.getByRole("button", { name: "↑ Yükle" }).click();
  const dialog = page.getByRole("dialog", { name: "Belge Yükle" });
  await dialog.getByLabel("Dosya").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 e2e"),
  });
  await dialog.getByRole("button", { name: "Yükle" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: new RegExp(filename) }).first()).toBeVisible();
  expect(uploadUrls.length).toBe(1);
  expect(uploadUrls[0]).not.toContain("site_id");

  // Temizlik: DELETE ucu API'den kullanılabilir (düğme BASILMADAN — spec §4).
  const listed = await page.request.get("/api/backend/documents?project_id=p-2");
  const docs = (await listed.json()).documents as Array<{ id: string; filename: string }>;
  const created = docs.find((d) => d.filename === filename);
  expect(created, "yüklenen belge listede yok").toBeTruthy();
  expect((await page.request.delete(`/api/backend/documents/${created!.id}`)).status()).toBe(204);
});
