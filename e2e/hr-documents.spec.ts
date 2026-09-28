import { test, expect, type Page } from "@playwright/test";

// F-İK T5 · `/personel/belgeler` (BT · Belge & Sertifika) — FONKSİYONEL e2e
// (görsel DEĞİL; görsel tur T6'da, şefte). Kanıtlanan zincir:
//   liste → "Belge & Sertifika" sekmesi GERÇEK ekranı açar (ComingSoon DEĞİL)
//   → sekme aktifliği doğru ekranda → KPI/tablolar SUNUCU fikstüründen
//   → devre-dışı süzgeçler TIKLANAMAZ ve rota ÜRETMEZ
//   → personel adından detaya gidiş
//   → detaydaki "Belgeler" kartı GERÇEK listedir (salt-okunur).
//
// 🔒 FİKSTÜR İZOLASYONU: bu dosya SALT-OKURdur — hiçbir kaydı mutasyona
// uğratmaz (belge uçlarının mutasyon tarafı bu dilimde zaten bağlanmadı).
//
// ⚠️ `getByRole("alert")` bu depoda YASAKTIR. Tekil eleman bekleyen
// locator'lar akış-SSR çift-kopya tuzağına karşı `.first()` alır.

const DOCUMENTS_URL = "/personel/belgeler";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("liste → 'Belge & Sertifika' sekmesi GERÇEK ekranı açar (ComingSoon DEĞİL)", async ({
  page,
}) => {
  await login(page);
  await page.goto("/personel");

  await page.getByRole("tab", { name: "Belge & Sertifika" }).click();

  await expect(page).toHaveURL(/\/personel\/belgeler$/);
  await expect(page.getByRole("heading", { name: "Belge & Sertifika", level: 1 })).toBeVisible();
  await expect(page.locator("main").getByText("Bu modül yakında eklenecek.")).toHaveCount(0);
});

test("sekme aktifliği bu ekranda 'Belge & Sertifika'ya geçer, liste sekmesi geri döner", async ({
  page,
}) => {
  await login(page);
  await page.goto(DOCUMENTS_URL);

  await expect(page.getByRole("tab", { name: "Belge & Sertifika" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // "Personel Listesi" burada GERÇEK bağlantıdır — geri dönüş çalışır.
  const listTab = page.getByRole("tab", { name: "Personel Listesi" });
  await expect(listTab).toHaveAttribute("href", "/personel");
  await listTab.click();
  await expect(page).toHaveURL(/\/personel$/);
  await expect(page.getByRole("tab", { name: "Personel Listesi" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("KPI + iki tablo + tip dağılımı SUNUCU özetinden gelir", async ({ page }) => {
  await login(page);
  await page.goto(DOCUMENTS_URL);

  // 5 KPI — mock fikstürünün sabit sayıları (istemci hesaplamaz).
  const strip = page.getByTestId("bt-kpi-strip");
  await expect(strip).toContainText("Toplam Belge");
  await expect(strip).toContainText("Eksik Belge");

  // Süresi dolan satırı — `project_name` dolu olan kayıt.
  const expiredRow = page.getByTestId("bt-expired-row-pd-1");
  await expect(expiredRow).toContainText("Mehmet Kılıç");
  await expect(expiredRow).toContainText("Kule A");
  await expect(expiredRow).toContainText("30.06.2026");
  await expect(expiredRow).toContainText("44 gün");

  // Yaklaşan satırı.
  await expect(page.getByTestId("bt-expiring-row-pd-2")).toContainText("Ramazan Yıldız");

  // Tip dağılımı — sıfır sayaçlı tip de ÇÖKMEDEN basılır.
  await expect(page.getByTestId("bt-breakdown-row-dt-1")).toContainText("6 / 8");
  await expect(page.getByTestId("bt-breakdown-row-dt-4")).toContainText("Kayıt yok");
});

test("kritik bant BELGE sayacından kurulur; personel sayısı UYDURULMAZ", async ({ page }) => {
  await login(page);
  await page.goto(DOCUMENTS_URL);

  const alert = page.getByTestId("bt-critical-alert");
  await expect(alert).toContainText("3 belgenin süresi doldu");
  await expect(alert).not.toContainText(/\d+ personel/);
});

test("devre-dışı süzgeçler TIKLANAMAZ ve rota ÜRETMEZ (koruma testi)", async ({ page }) => {
  await login(page);
  await page.goto(DOCUMENTS_URL);

  const filters = page.getByTestId("bt-filters");

  // Çipler GERÇEK sayaç basar ama süzmez.
  const chip = filters.getByRole("button", { name: /^Süresi Dolan \(\d+\)$/ });
  await expect(chip).toBeDisabled();
  await chip.click({ force: true });
  await expect(page).toHaveURL(/\/personel\/belgeler$/);

  await expect(filters.getByLabel("Belge tipi")).toBeDisabled();
  await expect(filters.getByLabel("Proje")).toBeDisabled();

  // Devre-dışı öğelerin HİÇBİRİ bağlantı DEĞİLDİR (rota üretmezler).
  await expect(filters.getByRole("link")).toHaveCount(0);

  // Gerekçe title'a gömülü kalmaz — şeritte görünür.
  await expect(filters).toContainText("süzgeç parametresi almıyor");
});

test("aksiyon düğmeleri devre-dışıdır ve 'Durum' sütunu pending basar", async ({ page }) => {
  await login(page);
  await page.goto(DOCUMENTS_URL);

  await expect(page.getByRole("button", { name: "Toplu Randevu Al" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "+ Belge Yükle" })).toBeDisabled();

  const expiredRow = page.getByTestId("bt-expired-row-pd-1");
  await expect(expiredRow.getByRole("button", { name: "Aksiyon Al" })).toBeDisabled();
  // Sütun SİLİNMEZ (kalıcı kural) — başlık var, hücre "—".
  await expect(
    page.getByTestId("bt-expired-card").getByRole("columnheader", { name: "Durum" }),
  ).toBeVisible();
});

test("proje adı null olan satır GERÇEK boşluk basar", async ({ page }) => {
  await login(page);
  await page.goto(DOCUMENTS_URL);

  await expect(page.getByTestId("bt-expired-row-pd-3")).toContainText("Hasan Demirci");
  await expect(page.getByTestId("bt-expired-row-pd-3")).toContainText("—");
});

test("personel adından detaya gidilir; oradaki 'Belgeler' kartı GERÇEK listedir", async ({
  page,
}) => {
  await login(page);
  await page.goto(DOCUMENTS_URL);

  await page
    .getByTestId("bt-expired-row-pd-1")
    .getByRole("link", { name: "Mehmet Kılıç" })
    .click();

  await expect(page).toHaveURL(/\/personel\/per-1$/);

  // PD 130-141 · kart artık pending metni DEĞİL, sunucu kayıtlarını basar.
  const card = page.getByTestId("personnel-documents-card");
  await expect(card).toContainText("Sağlık Raporu");
  await expect(card).toContainText("15.01.2027 tarihine kadar");
  // Serbest etiketli kayıt `free_label`den adlanır.
  await expect(card).toContainText("İşe Giriş Taahhütnamesi");
  // Dosya uzantısı/boyutu sunucuda YOK — uydurulmaz.
  await expect(card).not.toContainText(/PDF|MB/);

  // "İndir" HÂLÂ bağlanmadı (arşiv indirme ucu bu karta çekilmedi).
  await expect(card.getByRole("button", { name: "İndir" }).first()).toBeDisabled();

  // F-BLG T2c: "+ Ekle" ARTIK GERÇEK — `Form - Personel Belgesi.dc.html`
  // geldi ve düğme `PersonnelDocumentFormModal`ı açar. "Aktif" iddiası tek
  // başına yetmez (kapalı bir `onClick` de aktif görünür): diyalogun
  // GERÇEKTEN açıldığı iddia edilir. Diyalog KAYDETMEZ — `per-1` fikstürü
  // (PD/BT baseline'larının kaynağı) dokunulmadan bırakılır.
  const addButton = card.getByRole("button", { name: "+ Ekle" });
  await expect(addButton).toBeEnabled();
  await addButton.click();

  const dialog = page.getByRole("dialog", { name: "Personel Belgesi Ekle" });
  await expect(dialog).toBeVisible();
  // Bağlam bandı personelin KENDİ kaydını taşır (yanlış personele belge
  // eklenmesin) ve tip kataloğu İK özetinden doldu.
  await expect(dialog.getByTestId("pdf-context")).toContainText("Mehmet Kılıç");
  await expect(dialog.getByTestId("pdf-type")).toContainText("Sağlık Raporu");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("belgesi olmayan personelde kart sade boş-durum basar", async ({ page }) => {
  await login(page);
  await page.goto("/personel/per-2");

  await expect(page.getByTestId("personnel-documents-card")).toContainText(
    "Bu personele ait belge kaydı yok.",
  );
});
