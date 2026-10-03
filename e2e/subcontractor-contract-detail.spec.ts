import { test, expect, type Page } from "@playwright/test";

// F-P5 T7 · TSD (`/sozlesmeler/taseron/[contractId]`) fonksiyonel e2e.
// Kapsam: rotanın ComingSoon'dan çıkması, SZL/TL girişlerinin buraya
// götürmesi, başlık + VKN + bağlantı zinciri + poz tablosu + tfoot +
// hakediş geçmişinin basılması, F-TH'nin ARTIK AKTİF "Sözleşmeyi Gör"
// bağlantısının bu rotaya gitmesi.
//
// ⚠️ `getByRole("alert")` KULLANILMAZ (Next route-announcer tuzağı).
//
// 🔒 FİKSTÜR İZOLASYONU: mock state tüm koşu boyunca TEKTİR ve spec'ler
// PARALEL koşar. Bu dosya HİÇBİR kaydı mutasyona uğratmaz — B.F. hücresine
// yazılmaz, "Kaydet" tıklanmaz. Bir PATCH atsaydı `sc-1`in kalem fiyatları
// (dolayısıyla `contract_total`) değişir ve TL agregasyonu + SZL bedel
// kolonu + taşeron hakediş formundaki birim fiyatlar kirlenirdi. PATCH
// akışları Vitest'te `SubcontractorContractDetailView.test.tsx`te kanıtlanır.
//
// Zamanlayıcıya dayalı bekleme YOK.

const CONTRACT_ID = "sc-1";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("TSD: rota ComingSoon'dan çıktı; başlık + VKN + zincir basılır", async ({ page }) => {
  await login(page);
  await page.goto(`/sozlesmeler/taseron/${CONTRACT_ID}`);

  await expect(page.locator("main").getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Aydın Elektrik Taah.");

  // VKN sözleşme şemasında YOK — `GET /subcontractors` listesinden süzülür.
  await expect(page.getByTestId("tsd-tax-number")).toHaveText("1234567890");

  // Zincirin dört halkası: işveren sözleşmesi → proje → şantiye → bu sözleşme.
  const chain = page.getByTestId("tsd-chain");
  await expect(chain.getByRole("link", { name: "Kule A" })).toHaveAttribute(
    "href",
    "/projeler/p-1",
  );
  await expect(chain.getByRole("link", { name: "SZL-2025-01" })).toHaveAttribute(
    "href",
    "/sozlesmeler/isveren/p-1",
  );
  await expect(chain).toContainText("TSD-2026-01");
});

test("TSD: poz tablosunda YALNIZ Taşeron B.F. yazılabilir, tfoot şemadan gelir", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/sozlesmeler/taseron/${CONTRACT_ID}`);

  const items = page.getByTestId("tsd-items");
  await expect(items.getByText("Kaba Elektrik Tesisatı")).toBeVisible();

  // Üç kalem → üç girdi; Sözleşme Miktarı sütununda girdi YOKTUR.
  await expect(items.locator("input")).toHaveCount(3);
  await expect(items.getByLabel("E.01 taşeron birim fiyatı")).toHaveValue("45,00"); // TKL-F7a (T42): Türkçe gösterim

  // tfoot TEK KAYNAK `contract_total`: 5200×45 + 620×120 + 18×3500 = 371.400
  await expect(page.getByTestId("tsd-items-total")).toContainText("371.400");
});

test("TSD: hakediş geçmişi + önseçimli oluşturma bağlantıları", async ({ page }) => {
  await login(page);
  await page.goto(`/sozlesmeler/taseron/${CONTRACT_ID}`);

  await expect(page.getByRole("link", { name: "+ Hakediş Oluştur" })).toHaveAttribute(
    "href",
    `/hakedisler/taseron/yeni?contract=${CONTRACT_ID}`,
  );
  await expect(page.getByRole("link", { name: "+ Yeni Hakediş →" })).toHaveAttribute(
    "href",
    `/hakedisler/taseron/yeni?contract=${CONTRACT_ID}`,
  );

  await expect(page.locator("main").getByText("Hakediş Geçmişi")).toBeVisible();
  await expect(page.getByRole("link", { name: "Detay" }).first()).toHaveAttribute(
    "href",
    /\/hakedisler\/taseron\//,
  );
});

test("TSD: SZL taşeron satırı ve F-TH 'Sözleşmeyi Gör' bu rotaya götürür", async ({ page }) => {
  await login(page);

  // (a) SZL taşeron sekmesindeki satır "Detay →" bağlantısı
  await page.goto("/sozlesmeler?type=subcontractor");
  await page.getByRole("link", { name: "Detay →" }).first().click();
  await expect(page).toHaveURL(/\/sozlesmeler\/taseron\/[^/]+$/);
  await expect(page.getByTestId("tsd-items")).toBeVisible();

  // (b) F-TH hakediş formundaki "Sözleşmeyi Gör →" ARTIK AKTİF (F-P5 T7).
  await page.goto(`/hakedisler/taseron/yeni?contract=${CONTRACT_ID}`);
  const seeContract = page.getByTestId("thf-see-contract-link");
  await expect(seeContract).toHaveAttribute("href", `/sozlesmeler/taseron/${CONTRACT_ID}`);
  await seeContract.click();
  await expect(page).toHaveURL(new RegExp(`/sozlesmeler/taseron/${CONTRACT_ID}$`));
});

test("TSD: devre-dışı PDF yerinde durur; '+ Poz Ekle' ARTIK diyalog açar", async ({ page }) => {
  await login(page);
  await page.goto(`/sozlesmeler/taseron/${CONTRACT_ID}`);

  await expect(page.getByTestId("tsd-pdf-disabled")).toBeDisabled();
  await expect(page.locator("main").getByText(/Dışa aktarma ucu henüz açılmadı/)).toBeVisible();

  // F-BLG T2a: form mockup'ı geldi, buton devre-dışı gerekçesinden kurtuldu.
  // Testid `tsd-add-item-disabled` → `tsd-add-item`. "Aktif" iddiası TEK
  // BAŞINA yetmez (kapalı bir `onClick` de aktif görünür): diyalogun gerçekten
  // AÇILDIĞI iddia edilir. Diyalog kaydetmez — bu spec `sc-1`i kirletmez.
  const addItem = page.getByTestId("tsd-add-item");
  await expect(addItem).toBeEnabled();
  await addItem.click();

  const dialog = page.getByRole("dialog", { name: "Taşeron Sözleşmesine Poz Ekle" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("tsi-line-total")).toBeVisible();

  // Escape ile kapanır → fikstür dokunulmadan bırakılır.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
