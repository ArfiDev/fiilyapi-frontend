import { test, expect } from "@playwright/test";

import { login } from "./equipment-helpers";

/*
 * F-KIRA · Makine Kira Hakedişi (MK-2) fonksiyonel e2e'si.
 *
 * 🔒 MUTASYON ADASI (F-BOR kanonu) — HER YAZMA TESTİNE AYRI FATURA.
 * İlk sürümde üç test `rental-3`ü paylaşıyordu; onay testi durumu `approved`a
 * çevirince satır PATCH'inin düzenlenebilir kutuları kayboluyordu ve CI
 * `element(s) not found` verdi. `fullyParallel` altında test sırası garanti
 * DEĞİLDİR, bu yüzden durumu oynatan her testin kendi faturası vardır ve
 * salt-okur iddialar durumu HİÇ oynatılmayan fikstürlere bakar.
 */

const RENTAL_LIST_URL = "/makine/kira";
const VISUAL_INVOICE = "rental-2";
const APPROVE_INVOICE = "rental-3"; // YAZMA: ileri adım
const REJECT_INVOICE = "rental-4"; // YAZMA: onayı geri alma
const UNKNOWN_INVOICE = "rental-5"; // SALT-OKUR: fail-closed
const LINE_EDIT_INVOICE = "rental-6"; // YAZMA: satır PATCH'i
const APPROVED_READONLY = "rental-7"; // SALT-OKUR: `approved` süzgeç iddiası

test("liste ucu GERCEKTEN 200 + dolu govde doner (rota sirasi bekcisi)", async ({ page }) => {
  await login(page);

  /*
   * 🔴 F-TKV M11 KANONU — SAHTE BACKEND'DE İŞLEYİCİ SIRASI BİR SÖZLEŞMEDİR.
   * `mock-backend.ts`teki `/^\/equipment\/([^/]+)$/` deseni tek segmentli
   * `/equipment/rental-invoices` yolunu YUTAR ve 404 "Ekipman bulunamadı."
   * döndürür; ekran bunu BOŞ LİSTE olarak basar ve naif bir test YEŞİL geçer.
   * Bu yüzden ucun kendisi DOĞRUDAN ölçülür — ekranın yorumuna güvenilmez.
   */
  const response = await page.request.get(
    `/api/backend/equipment/rental-invoices?limit=200`,
  );
  expect(response.status(), "liste ucu 404 dönüyorsa işleyici yutulmuştur").toBe(200);
  const body = (await response.json()) as { items: unknown[]; total: number };
  expect(body.items.length, "liste BOŞ dönüyorsa desen sırası bozulmuştur").toBeGreaterThan(0);
  expect(body.total).toBeGreaterThan(0);
});

test("liste ekrani suzgecleri URL'e yazar ve satirlari basar", async ({ page }) => {
  await login(page);
  await page.goto(RENTAL_LIST_URL);

  await expect(page.getByRole("heading", { level: 1, name: "Kira Hakedişi" })).toBeVisible();
  await expect(page.getByTestId("makine-kira-loaded-list")).toBeAttached();

  // Sekme şeridi bu ekranda da var ve "Kira Hakedişi" AKTİF.
  await expect(page.getByRole("tab", { name: "Kira Hakedişi" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const rows = page.locator("[data-rental-invoice-id]");
  await expect(rows).not.toHaveCount(0);

  // Durum süzgeci URL'e yazılır (paylaşılabilir/geri-ileri çalışır).
  await page.getByTestId("makine-kira-filter-status").selectOption("approved");
  await expect(page).toHaveURL(/status=approved/);
  // İddialar durumu HİÇ oynatılmayan fikstürlere bakar: `rental-4`ün durumunu
  // red testi, `rental-3`ünkünü onay testi değiştiriyor.
  await expect(page.locator(`[data-rental-invoice-id="${APPROVED_READONLY}"]`)).toBeVisible();
  await expect(page.locator(`[data-rental-invoice-id="${VISUAL_INVOICE}"]`)).toHaveCount(0);
});

test("arama kutusu YOKTUR (uc `q` parametresi tanimiyor)", async ({ page }) => {
  await login(page);
  await page.goto(RENTAL_LIST_URL);
  await expect(page.getByTestId("makine-kira-loaded-list")).toBeAttached();

  // Emsal `SubcontractorProgressPaymentsView` bir arama kutusu basıyor;
  // buraya kopyalansaydı yazdığı metnin hiçbir etkisi olmayan bir kutu olurdu.
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(page.locator("main").getByPlaceholder(/ara/i)).toHaveCount(0);
});

test("olusturma dugmesi DEVRE-DISI + GORUNUR gerekceli (form mockup'i yok)", async ({ page }) => {
  await login(page);
  await page.goto(RENTAL_LIST_URL);

  const createButton = page.getByTestId("makine-kira-create");
  await expect(createButton).toBeDisabled();
  // Gerekçe `title` ipucuna GÖMÜLÜ DEĞİL, ekranda okunur (F-TH kuralı).
  await expect(page.locator("main").getByText("Kira hakedişi oluşturma formunun mockup'ı henüz yok.")).toBeVisible();
});

test("liste satiri detaya gider ve M5'in bes karti basilir", async ({ page }) => {
  await login(page);
  await page.goto(RENTAL_LIST_URL);

  await page
    .locator(`[data-rental-invoice-id="${VISUAL_INVOICE}"]`)
    .getByRole("link")
    .click();

  await expect(page).toHaveURL(new RegExp(`/makine/kira/${VISUAL_INVOICE}$`));
  await expect(page.getByTestId("makine-kira-loaded-detail")).toBeAttached();

  // KART A · M5:35-43
  await expect(page.getByTestId("makine-kira-info")).toContainText("Makine Kira Hakediş Akışı:");
  // KART B · M5:46-66
  await expect(page.getByTestId("makine-kira-invoice-no")).toHaveValue("LT-2026-07-0184");
  await expect(page.getByTestId("makine-kira-status")).toHaveText("Doğrulama Bekliyor");
  // KART C · M5:69-77 — salt-okuma "Kaynak" kutusu
  await expect(page.getByTestId("makine-kira-source")).toHaveValue("Çalışma Kaydından");
  // KART D · M5:80-174
  await expect(page.getByTestId("makine-kira-lines")).toBeVisible();
  // KART E · M5:177-193
  await expect(page.getByTestId("makine-kira-distribution")).toBeVisible();
});

test("K3 — mockup'in YIRTIK tablosu DOKUZ hucreye tamamlanir", async ({ page }) => {
  await login(page);
  await page.goto(`/makine/kira/${VISUAL_INVOICE}`);
  await expect(page.getByTestId("makine-kira-loaded-detail")).toBeAttached();

  // `thead` dokuz kolon (M5:88-96).
  await expect(page.locator("[data-testid='makine-kira-lines'] thead th")).toHaveCount(9);

  // 🔴 Mockup'ın tbody satır 3-4'ü YALNIZ YEDİ hücre çiziyordu; `thead`
  // kazanır ve HER satır dokuza tamamlanır (eksik hücre "—" ile).
  const rows = page.locator("[data-rental-line-id]");
  await expect(rows).toHaveCount(4);
  for (const kind of ["rented", "breakdown", "owned"]) {
    await expect(
      page.locator(`[data-line-kind="${kind}"]`).first().locator("td"),
    ).toHaveCount(9);
  }

  // M5:149 — kendi malının "Kira B.F." hücresinde amortisman yazar.
  await expect(
    page.locator('[data-line-kind="owned"]').first().locator('[data-column="rateAmount"]'),
  ).toHaveText("Amortisman");
});

test("K6 — tfoot rozeti SAAT farkini basar (tutar farkini DEGIL)", async ({ page }) => {
  await login(page);
  await page.goto(`/makine/kira/${VISUAL_INVOICE}`);
  await expect(page.getByTestId("makine-kira-loaded-detail")).toBeAttached();

  // Mockup M5:162 "6 saat fark" der. Aynı satırdaki TUTAR farkı 20.416'dır
  // (= tam KDV, tesadüf); 6 saatlik fark 1.680 ederdi. Rozet saati anlatır.
  await expect(page.getByTestId("makine-kira-variance-total")).toHaveText("6 saat fark");
  // K9: KDV ve ödenecek toplam SUNUCUDAN basılır, ekran yeniden hesaplamaz.
  await expect(page.getByTestId("makine-kira-vat")).toHaveText("₺24.499,2");
  await expect(page.getByTestId("makine-kira-payable")).toHaveText("₺146.995,2");
});

test("K8/K9 — bilinmeyen bedel ve matrahsiz toplam SESSIZ KALMAZ", async ({ page }) => {
  await login(page);
  await page.goto(`/makine/kira/${UNKNOWN_INVOICE}`);
  await expect(page.getByTestId("makine-kira-loaded-detail")).toBeAttached();

  // K8 — `*_unknown_count` sıfırdan büyük: toplama girmeyen satır görünür.
  await expect(page.getByTestId("makine-kira-unknown-warning")).toBeVisible();
  // K9 — matrah yoksa KDV/ödenecek toplam da yoktur; uydurma sayı BASILMAZ.
  await expect(page.getByTestId("makine-kira-payable-warning")).toBeVisible();
  // Dördüncü fail-closed sayaç: dağılım kovası da sessiz kalmaz.
  await expect(page.getByTestId("makine-kira-dist-warning")).toBeVisible();
});

test("K5 — durum makinesi: pending_verification ileri adimi ONAYLAR", async ({ page }) => {
  await login(page);
  await page.goto(`/makine/kira/${APPROVE_INVOICE}`);
  await expect(page.getByTestId("makine-kira-loaded-detail")).toBeAttached();

  // 🔴 M5:27 "Kiracıya Gönder" KULLANILMADI — backend'in ONAYLI SAPMA etiketi.
  const forward = page.getByTestId("makine-kira-approve");
  await expect(forward).toHaveText("Onayla ve Ödemeye Gönder");
  // `pending_verification`ta ödeme/red YOKTUR (409 verirdi).
  await expect(page.getByTestId("makine-kira-pay")).toHaveCount(0);
  await expect(page.getByTestId("makine-kira-reject")).toHaveCount(0);

  await forward.click();
  await expect(page.getByTestId("makine-kira-status")).toHaveText("Onaylandı");

  // Onaylandıktan sonra eylem kümesi DEĞİŞİR: geri alma + ödeme açılır.
  await expect(page.getByTestId("makine-kira-reject")).toHaveText("Onayı Geri Al");
  await expect(page.getByTestId("makine-kira-pay")).toHaveText("Ödendi İşaretle");
  // Kilitli durumda başlık düzenlenemez (EDIT_LOCKED_STATUSES).
  await expect(page.getByTestId("makine-kira-save-header")).toHaveCount(0);
});

test("K5 — approved faturada onay GERI ALINIR (ayri bir `rejected` durumu YOK)", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/makine/kira/${REJECT_INVOICE}`);
  await expect(page.getByTestId("makine-kira-loaded-detail")).toBeAttached();

  await expect(page.getByTestId("makine-kira-approve")).toHaveCount(0);
  await page.getByTestId("makine-kira-reject").click();

  const dialog = page.getByRole("dialog", { name: "Onayı Geri Al" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Onayı Geri Al" }).click();

  // Red bir GERİ GEÇİŞTİR: fatura "Doğrulama Bekliyor"a döner, kaybolmaz.
  await expect(page.getByTestId("makine-kira-status")).toHaveText("Doğrulama Bekliyor");
});

test("satir PATCH'i yalniz DEGISEN kutuda istek atar ve rozeti tazeler", async ({ page }) => {
  await login(page);
  // 🔒 KENDİ faturası: onay testi başka bir faturayı ilerletir, yoksa bu
  // ekran `approved` olur ve düzenlenebilir kutular HİÇ basılmazdı.
  await page.goto(`/makine/kira/${LINE_EDIT_INVOICE}`);
  await expect(page.getByTestId("makine-kira-loaded-detail")).toBeAttached();

  const invoicedHours = page.getByTestId("makine-kira-invoiced_hours").first();
  await expect(invoicedHours).toHaveValue("186.00");

  // Dokunulmamış kutu istek ÜRETMEZ (F-İK "touched" dersi): odaklanıp
  // değiştirmeden çıkmak durumu oynatmamalıdır.
  await invoicedHours.click();
  await page.getByTestId("makine-kira-invoice-no").click();
  await expect(page.locator('[data-column="variance"] .badge').first()).toHaveText("Eşleşiyor");

  // Değişen kutu PATCH atar; `variance_status` SUNUCU damgasıdır ve tazelenir.
  await invoicedHours.fill("196");
  await page.getByTestId("makine-kira-invoice-no").click();
  await expect(page.locator('[data-column="variance"] .badge').first()).toHaveText("10 saat fark");
});

test("fatura ekranindaki kaynak cipi kira detayina baglanir (bayat gerekce dustu)", async ({
  page,
}) => {
  await login(page);
  await page.goto("/faturalar/inv-in-1");

  const chip = page.getByTestId("fat-source-chip");
  await expect(chip).toHaveAttribute("href", "/makine/kira/rental-1");
});
