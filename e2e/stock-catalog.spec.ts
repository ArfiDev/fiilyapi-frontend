import { test, expect, type Page } from "@playwright/test";

// F-ST T2 · E3 (`/stok`) FONKSİYONEL e2e'si — görsel spec'ler T5'te (dosya
// adında "gorsel"/"visual" GEÇMEZ ki beşinci kapıda koşsun).
//
// Kapsam: kabuk sidebar girişi (ComingSoon DEĞİL) · KPI şeridi + SA pending'i ·
// katalog tablosunun SUNUCU durum rozetleri · `min_stock: null` ⇒ "—" ·
// süzgeç/aramanın TELDEN sunucuya gittiği · devre dışı "Stok Hareketi" ·
// türetilmiş iki diyaloğun gövde/hata davranışı.
//
// 🔒 FİKSTÜR İZOLASYONU (T1'de yazılan kural): mock backend TÜM spec'lerde TEK
// paylaşılan sunucudur ve stok kayıtlarının PROJE KAPSAMI YOKTUR. BAŞARILI bir
// yazma katalog tablosuna satır ekler ve T5'in görsel baseline'larını sessizce
// kırar. Bu yüzden bu dosya YALNIZ okur; yazma tarafında yalnızca REDDEDİLEN
// (durum değiştirmeyen) gövdeler kanıtlanır. Başarılı yazmanın uçtan uca
// kanıtı kapanış smoke'unda CANLI ortamda alınır.

const STOCK_URL = "/stok";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("kabuk sidebar'ındaki 'Stok & Depo' gerçek ekranı açar (ComingSoon DEĞİL)", async ({
  page,
}) => {
  await login(page);

  await page.getByRole("navigation").getByRole("link", { name: "Stok & Depo" }).first().click();
  await expect(page).toHaveURL(/\/stok$/);
  await expect(page.getByRole("heading", { name: "Stok & Depo" })).toBeVisible();
  await expect(page.getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
});

test("KPI şeridi sunucudan gelir; 'Bekleyen Sipariş' SA'ya pending kalır", async ({ page }) => {
  await login(page);
  await page.goto(STOCK_URL);

  const strip = page.getByTestId("stok-kpi-strip");
  await expect(strip).toContainText("Toplam Stok Değeri");
  // Fikstürde 8 malzeme kartı vardır — sayı SUNUCUNUN kpis zarfındandır.
  await expect(strip).toContainText("8 Kalem");

  // S5: uydurma "12 Sipariş" YOK, görünür gerekçe VAR.
  await expect(page.getByTestId("stok-kpi-pending-orders")).toHaveText("—");
  await expect(strip).toContainText("Satınalma verisi bu yüzeye henüz bağlanmadı");
});

test("katalog rozetleri SUNUCUDAN basılır; eşiksiz kalemin durumu '—'", async ({ page }) => {
  await login(page);
  await page.goto(STOCK_URL);

  // Dört durum da fikstürde temsil edilir (durum formülü SUNUCUDADIR).
  await expect(page.getByTestId("stok-status-SNK-0421")).toHaveText("Kritik");
  await expect(page.getByTestId("stok-status-ELK-0334")).toHaveText("Düşük");
  await expect(page.getByTestId("stok-status-SNK-0108")).toHaveText("Normal");
  await expect(page.getByTestId("stok-status-SNK-0447")).toHaveText("Fazla");

  // `min_stock: null` taşıyan tek kart: rozet İCAT EDİLMEZ.
  await expect(page.getByTestId("stok-status-ICY-0090")).toHaveText("—");

  // Kritik/düşük satır vurgusu (E3 121/139/166).
  await expect(page.getByTestId("stok-row-SNK-0421")).toHaveClass(/stok-row--flagged/);
  await expect(page.getByTestId("stok-row-SNK-0108")).not.toHaveClass(/stok-row--flagged/);
});

test("durum segmenti ve arama SUNUCU süzgecine gider (istemci süzmesi YOK)", async ({ page }) => {
  await login(page);
  await page.goto(STOCK_URL);
  const content = page.locator("main");
  await expect(page.getByTestId("stok-row-SNK-0108")).toBeVisible();

  const criticalRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/stock/summary") && request.url().includes("status=critical"),
  );
  await page.getByRole("button", { name: "Kritik" }).click();
  await criticalRequest;

  await expect(page).toHaveURL(/durum=critical/);
  await expect(page.getByTestId("stok-row-SNK-0421")).toBeVisible();
  // Sunucu süzdüğü için normal satır listeden DÜŞER.
  await expect(page.getByTestId("stok-row-SNK-0108")).toHaveCount(0);

  await page.getByRole("button", { name: "Tümü" }).click();
  await expect(page.getByTestId("stok-row-SNK-0108")).toBeVisible();

  const searchRequest = page.waitForRequest(
    (request) => request.url().includes("/stock/summary") && request.url().includes("q=Kablo"),
  );
  await content.getByLabel("Malzeme ara").fill("Kablo");
  await searchRequest;
  await expect(page).toHaveURL(/q=Kablo/);
  await expect(page.getByTestId("stok-row-ELK-0334")).toBeVisible();
  await expect(page.getByTestId("stok-row-SNK-0421")).toHaveCount(0);
});

test("kategori süzgeci şema enum'unu gönderir ('Boya-Kaplama' seçeneği YOK)", async ({ page }) => {
  await login(page);
  await page.goto(STOCK_URL);
  const content = page.locator("main");

  const select = content.getByLabel("Kategori filtresi");
  await expect(select.getByRole("option", { name: "Boya-Kaplama" })).toHaveCount(0);

  const request = page.waitForRequest(
    (r) => r.url().includes("/stock/summary") && r.url().includes("category=steel"),
  );
  await select.selectOption("steel");
  await request;
  await expect(page.getByTestId("stok-row-SNK-0421")).toBeVisible();
  await expect(page.getByTestId("stok-row-SNK-0108")).toHaveCount(0);
});

test("'Stok Hareketi' devre dışıdır ve gerekçesi ekranda GÖRÜNÜR (S2)", async ({ page }) => {
  await login(page);
  await page.goto(STOCK_URL);

  await expect(page.getByRole("button", { name: "Stok Hareketi" })).toBeDisabled();
  await expect(page.getByTestId("stok-movements-notice")).toContainText("henüz tasarlanmadı");
});

test("'+ Malzeme Ekle': reddedilen gövde Türkçe hata basar, katalog DEĞİŞMEZ", async ({ page }) => {
  await login(page);
  await page.goto(STOCK_URL);

  await page.getByRole("button", { name: "+ Malzeme Ekle" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni Malzeme Kartı" });
  await expect(dialog).toBeVisible();

  // Var olan bir kod: sunucu reddeder → durum DEĞİŞMEZ (fikstür izolasyonu).
  await dialog.getByLabel(/Malzeme Kodu/).fill("SNK-0421");
  await dialog.getByLabel(/Malzeme Adı/).fill("Kopya Kart");
  await dialog.getByLabel(/^Birim/).fill("Ton");
  await dialog.getByRole("button", { name: "Kaydet" }).click();

  await expect(dialog).toContainText("Bu kodda bir malzeme zaten var.");
  await expect(dialog).toBeVisible();
});

// F-BLG T2c · diyalog artık `Form - Depo Ekle.dc.html`in kendisidir (eski S3
// sapması geçersiz): başlık "Yeni Depo Ekle" (72), gönder düğmesi "Depoyu
// Oluştur" (126), şantiye TEK seçici (86-96), canlı önizleme (98-109) ve
// "stok girişine dön" onay kutusu (119-127) eklendi.
test("'+ Depo Ekle': ad boşken ağa çıkılmaz, gerekçe basılır", async ({ page }) => {
  await login(page);
  await page.goto(STOCK_URL);

  await page.getByRole("button", { name: "+ Depo Ekle" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni Depo Ekle" });
  await expect(dialog).toBeVisible();
  // Merkez depo semantiği kullanıcıya açıkça yazılır (site_id gönderilmez).
  await expect(dialog).toContainText("— Merkez Depo (şantiyeye bağlı değil)");
  // Canlı önizleme boş adı ve MERKEZ rozetini basar (104-107).
  await expect(dialog.getByTestId("whf-preview")).toContainText("Depo adı girilmedi");
  await expect(dialog.getByTestId("whf-central-badge")).toHaveText("MERKEZ");
  // Merkez depo kipinde "stok girişine dön" kutusu kapalıdır ve gerekçesi
  // ekranda GÖRÜNÜR durur (kapsamsız stok giriş rotası yok).
  await expect(dialog.getByTestId("whf-keep-flow")).toBeDisabled();
  await expect(dialog.getByTestId("whf-keep-flow-reason")).toContainText(
    "şantiye kapsamındadır",
  );

  await dialog.getByRole("button", { name: "Depoyu Oluştur" }).click();
  await expect(dialog).toContainText("Depo adı zorunludur.");
});
