import { test, expect, type Page, type Request } from "@playwright/test";

import { withSystemAdmin } from "./with-system-admin";

// F-TH T6 · Taşeron Hakedişi fonksiyonel e2e — `e2e/progress-payments.spec.ts`
// deseninin AYNISI. Kapsam (brief §Fonksiyonel e2e): sekme gezinmesi, filtre
// URL state, liste → detay, durum aksiyonları (draft→onaya gönder,
// pending→onayla/reddet, approved→ödendi/geri al), Düzenle giriş noktası,
// sözleşme seçim adımı, form kaydetme + veri-kaybı korkuluğu, şantiye sekmesi.
//
// ⚠️ İKİ TUZAK (brief §⛔): (1) `getByRole("alert")` KULLANILMAZ — Next.js
// route-announcer'ı kendi `role="alert"` düğümünü basar, bunun yerine
// sınıf/test-id kapsamlı assert kullanılır. (2) Mutasyona uğrayan kayıtlar
// görsel spec'lerin kadrajına GİRMEZ — bu dosyanın mutasyona uğrattığı `scpp-6`
// ve `scpp-7`, `e2e/mock-backend.ts`te `hiddenFromLists: true` ile işaretlidir
// (liste/özet uçlarından tamamen dışlanır), `subcontractor-progress-payments-
// visual.spec.ts` vb. bu testin ne zaman/hangi sırada koştuğundan (fullyParallel)
// yapısal olarak bağımsızdır. Okuma-amaçlı testler (A/B/C/G) SABİT `scpp-1..5`
// kayıtlarını KULLANIR ama MUTASYONA UĞRATMAZ.
//
// Zamanlayıcıya dayalı bekleme YOK — her adım `expect(...)`in kendi
// deterministik yeniden denemesiyle bekler.

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

test("taşeron: sekme gezinmesi (gerçek URL değişimi, geri tuşu)", async ({ page }) => {
  await login(page);

  await page.goto("/hakedisler");
  await expect(page.getByRole("heading", { name: "Hakedişler" })).toBeVisible();
  // Final inceleme F-4: sekme şeridi gerçek `tabpanel` taşımadığı için
  // tab/tablist rolleri kaldırıldı — gezinme linki olarak sorgulanır.
  await page.getByRole("navigation", { name: "Hakediş türü" }).getByRole("link", { name: "Taşeron" }).click();
  await expect(page).toHaveURL(/\/hakedisler\/taseron$/);
  await expect(page.getByRole("heading", { name: "Taşeron Hakedişi" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/hakedisler$/);
  await expect(page.getByRole("heading", { name: "Hakedişler" })).toBeVisible();
});

// Coordinator review (Important) — kilit testi: `sc-3` (TB2 U1 kanıt kaydı,
// `site_id: null`) `active_subcontractor_count`i (KPI
// şeridindeki "Aktif Taşeron") ARTIRMAMALI. `buildSubcontractorPaymentSummary`
// bu sayıyı `state.subcontractorContracts` üzerinden projeye/hakedişe göre
// SÜZMEDEN, distinct `subcontractor_id`ye göre hesaplıyor — `sc-3` sc-1 ile
// AYNI `subcontractor_id`yi (`sub-1`) taşıdığından sayı sc-1/sc-2'nin ikisiyle
// (2) sınırlı kalmalı. Bu test o tuzağın yeniden AÇILMASINI engeller.
//
// ⚠️ GÜNCELLEME (F-OK): `sc-3` artık "sıfır hakedişli" DEĞİLDİR — onay kutusunun
// yazma hedefi `scpp-8` bu sözleşmeye bağlıdır (`hiddenFromLists: true`). İddia
// yine de GEÇERLİDİR ve bu bir tesadüf değildir: sayı `state.subcontractor
// Contracts` üzerinden SÖZLEŞMELERDEN türer, hakedişlerden DEĞİL — bir hakediş
// eklemek onu tanım gereği oynatamaz. `scpp-8` ayrıca `sub-1` taşıyan `sc-3`e
// bağlandığı için distinct kümeye de yeni üye katmaz (iki katlı güvence).
test("taşeron: Aktif Taşeron KPI'ı 2'de kalır (sc-3 kanıt kaydı distinct subcontractor_id'yi ARTIRMAZ)", async ({
  page,
}) => {
  await login(page);

  await page.goto("/hakedisler/taseron");
  await expect(page.getByTestId("thk-kpi-strip")).toBeVisible();
  const activeCard = page.locator("main").getByText("Aktif Taşeron").locator("..");
  await expect(activeCard.getByTestId("thk-kpi-value")).toHaveText("2");
});

test("taşeron: filtreler URL state (yazma, kalıcılık, paylaşılan URL)", async ({ page }) => {
  await login(page);

  // 1) Seçim URL'ye yazılır.
  await page.goto("/hakedisler/taseron");
  await expect(page.getByTestId("thk-kpi-strip")).toBeVisible();
  await page.locator("main").getByLabel("Durum filtresi").selectOption("paid");
  await expect(page).toHaveURL(/status=paid/);

  // 2) Sayfa yenilenince filtre korunur.
  await page.reload();
  await expect(page.locator("main").getByLabel("Durum filtresi")).toHaveValue("paid");

  // 3) Paylaşılan URL doğrudan filtreli açılır — yalnız `paid` (scpp-1)
  // görünür, diğer durumlardaki sabit kayıtlar (scpp-2..5) basılmaz.
  await page.goto("/hakedisler/taseron?status=paid");
  await expect(page.locator("main").getByLabel("Durum filtresi")).toHaveValue("paid");
  await expect(page.getByRole("link", { name: "Aydın Elektrik Taah." }).first()).toBeVisible();
  await expect(page.locator("main").getByText("Çelik İnşaat Taah.")).toHaveCount(0);
});

test("taşeron: liste → detay geçişi", async ({ page }) => {
  await login(page);

  await page.goto("/hakedisler/taseron");
  await expect(page.getByRole("heading", { name: "Taşeron Hakedişi" })).toBeVisible();
  await page
    .getByRole("row", { name: "Aydın Elektrik Taah. — Hakediş #2" })
    .click();
  await expect(page).toHaveURL(/\/hakedisler\/taseron\/scpp-2$/);
  await expect(page.getByRole("heading", { name: "Taşeron Hakedişi #2" })).toBeVisible();
});

test("taşeron: sözleşme seçim adımı (hiç hakedişi olmayan sözleşme de listelenir, seçim → form)", async ({
  page,
}) => {
  await login(page);

  await page.goto("/hakedisler/taseron/yeni");
  await expect(page.getByRole("heading", { name: "Taşeron Hakediş Oluştur" })).toBeVisible();
  // TB2 takip: sözleşme LİSTE ucu (U1) geldi — seçim kutusu artık DOĞRUDAN
  // `GET /subcontractor-contracts`ten beslenir, hakedişten türetme YOK. Eski
  // sınır ("yalnız en az bir hakedişi olan sözleşmeler görünür") bitti; bunu
  // kanıtlamak için hiç hakedişi olmayan `sc-3` (Yılmaz Boya A.Ş.) da seçim
  // kutusunda görünür olmalı.
  await expect(page.locator("main").getByLabel("Taşeron Sözleşmesi")).toBeVisible();
  await expect(
    page.getByRole("option", { name: /Yılmaz Boya A\.Ş\./ }),
  ).toHaveCount(1);

  await page.locator("main").getByLabel("Taşeron Sözleşmesi").selectOption("sc-1");
  await page.getByRole("button", { name: "Devam Et" }).click();
  await expect(page).toHaveURL(/\/hakedisler\/taseron\/yeni\?contract=sc-1$/);
  // Final inceleme F-7 sonrası başlık parçalıdır ("Hakediş" + pending `#—` +
  // "Oluştur") — erişilebilir adla sorgulanır. `thf-sequence-pending` YALNIZ
  // create kipinde basılır, yani seçim adımından create formuna gerçekten
  // geçildiğini kanıtlar.
  await expect(page.getByRole("heading", { name: /Hakediş .* Oluştur/ })).toBeVisible();
  await expect(page.getByTestId("thf-sequence-pending")).toBeVisible();
});

test("taşeron: sözleşme seçim adımı — hiç kayıtlı sözleşme yoksa boş durum metni", async ({ page }) => {
  await login(page);

  // Boş durum, mock state'i MUTASYONA UĞRATMADAN, yalnız BU sayfa yüküne
  // özel bir ağ yanıtı override'ı ile üretilir (brief §Yasaklar: mock-backend
  // state'i başka testleri etkilemez, deterministik — zamanlayıcı YOK).
  // TB2 takip: türetme kaldırıldığından override artık U1 ucunadır (U2 değil).
  await page.route("**/subcontractor-contracts*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });

  await page.goto("/hakedisler/taseron/yeni");
  await expect(page.getByTestId("th-contract-picker-empty")).toBeVisible();
});

test("taşeron: form kaydetme + veri kaybı korkuluğu (PUT lines gövdesi)", async ({ page }) => {
  await login(page);

  // `scpp-6` — hiddenFromLists:true, sc-2 (2 sözleşme kalemi: sci-4/sci-5),
  // taze taslak, satırsız. Yalnız BİR miktar doldurulur; PUT gövdesinde İKİ
  // satırın da (dokunulmayan dahil) gittiği doğrulanır — veri-kaybı korkuluğu.
  const linesRequest = page.waitForRequest(
    (req) => req.url().includes("/subcontractor-progress-payments/scpp-6/lines") && req.method() === "PUT",
  );

  await page.goto("/hakedisler/taseron/scpp-6/duzenle");
  await expect(page.getByRole("heading", { name: /Hakediş #2 Düzenle/ })).toBeVisible();

  await page.getByLabel("Duvar Örgü İşleri — miktar").fill("500");
  await page.getByRole("button", { name: "Taslak Kaydet" }).click();

  const request: Request = await linesRequest;
  const body = request.postDataJSON() as { lines: Array<{ contract_item_id: string; quantity: string }> };
  expect(body.lines).toHaveLength(2);
  expect(body.lines.map((l) => l.contract_item_id).sort()).toEqual(["sci-4", "sci-5"]);
  const filledLine = body.lines.find((l) => l.contract_item_id === "sci-4");
  expect(filledLine?.quantity).toBe("500");

  // Kaydetme başarılı: hata bandı basılmaz, listeye dönülür.
  await expect(page).toHaveURL(/\/hakedisler\/taseron$/);
});

test("taşeron: durum aksiyonları (draft→onaya gönder→reddet→onayla→geri al→ödendi) + Düzenle giriş noktası", async ({
  page,
}) => {
  await withSystemAdmin(page); // IZN-F6d: "Geri al" `need: "sa"` — mock patron SA değil.
  await login(page);

  // `scpp-7` — hiddenFromLists:true, sc-1, taze taslak (2 satır). Bu test
  // kaydı UÇTAN UCA mutasyona uğratır (fullyParallel altında görsel
  // spec'lerin sabit kayıtlarından İZOLE, brief §⛔ tuzak 2).
  await page.goto("/hakedisler/taseron/scpp-7");
  await expect(page.getByRole("heading", { name: "Taşeron Hakedişi #5" })).toBeVisible();
  await expect(page.getByText("Taslak", { exact: true })).toBeVisible();

  // Düzenle girişi — yalnız `draft` detayında görünür.
  const editLink = page.getByRole("link", { name: "Düzenle" });
  await expect(editLink).toHaveAttribute("href", "/hakedisler/taseron/scpp-7/duzenle");

  // draft → Onaya Gönder.
  await page.getByRole("button", { name: "Onaya Gönder" }).click();
  await expect(page.getByText("Onay Bekliyor", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Düzenle" })).toHaveCount(0);

  // pending_approval → Reddet: boş gerekçeyle GÖNDERİLEMEZ.
  await page.getByRole("button", { name: "Reddet" }).click();
  const rejectDialog = page.getByRole("dialog", { name: "Hakedişi Reddet" });
  await expect(rejectDialog).toBeVisible();
  const confirmRejectButton = rejectDialog.getByRole("button", { name: "Reddet" });
  await expect(confirmRejectButton).toBeDisabled();

  // Gerekçe girilince gönderilebilir → draft'a döner, "Revize Gerekli" rozeti.
  await rejectDialog.getByLabel("Gerekçe (zorunlu)").fill("eksik metraj kontrol edilsin");
  await expect(confirmRejectButton).toBeEnabled();
  await confirmRejectButton.click();
  await expect(rejectDialog).toHaveCount(0);
  await expect(page.getByText("Revize Gerekli")).toBeVisible();
  await expect(page.getByTestId("th-detail-rejection-alert")).toContainText("eksik metraj kontrol edilsin");

  // draft → Onaya Gönder (tekrar) → pending_approval → Onayla.
  await page.getByRole("button", { name: "Onaya Gönder" }).click();
  await expect(page.getByText("Onay Bekliyor", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Onayla" }).click();
  await expect(page.getByText("Onaylandı", { exact: true })).toBeVisible();

  // approved → Onayı Geri Al → pending_approval.
  await page.getByRole("button", { name: "Onayı Geri Al" }).click();
  const unapproveDialog = page.getByRole("dialog", { name: "Onayı Geri Al" });
  await expect(unapproveDialog).toBeVisible();
  await unapproveDialog.getByRole("button", { name: "Onayı Geri Al" }).click();
  await expect(unapproveDialog).toHaveCount(0);
  await expect(page.getByText("Onay Bekliyor", { exact: true })).toBeVisible();

  // pending_approval → Onayla → approved → Ödendi İşaretle → paid.
  await page.getByRole("button", { name: "Onayla" }).click();
  await expect(page.getByText("Onaylandı", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ödendi İşaretle" }).click();
  await expect(page.getByText("Ödendi", { exact: true })).toBeVisible();
});

test("taşeron: şantiye sekmesi (satır → detay, Tümü → listeye)", async ({ page }) => {
  await login(page);

  await page.goto("/projeler/p-1/santiyeler/s-1/hakedisler");
  await expect(page.getByRole("heading", { name: "A-Blok Şantiyesi — Hakedişler" })).toBeVisible();

  await page
    .getByRole("link", { name: "Aydın Elektrik Taah. — Hakediş #1" })
    .click();
  await expect(page).toHaveURL(/\/hakedisler\/taseron\/scpp-1$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/hakedisler\/p-1\/santiyeler\/s-1\/hakedisler$|\/santiyeler\/s-1\/hakedisler$/);
  await page.getByRole("link", { name: "Tümü →" }).last().click();
  await expect(page).toHaveURL(/\/hakedisler\/taseron$/);
});

test("taşeron: şantiye sekmesi — U2 `site_id` sunucuda süzer (başka şantiyenin sözleşmesi HARİÇ TUTULUR)", async ({
  page,
}) => {
  await login(page);

  // TB2 takip: `site_id` süzmesi artık sunucudadır (mock-backend, gerçek
  // backend'in aynısı) — istemci TEKRAR süzmez. Sc-2'nin (site s-2) taşeron
  // adı "Çelik İnşaat Taah." s-1 sekmesinde HİÇ görünmemeli; sc-3'ün
  // (proje-geneli, `site_id: null`) hiç hakedişi olmadığından bu ekranı
  // etkilemez ama `site_id` filtresi verilince bu tür sözleşmelerin ASLA
  // eşleşmediği `useSiteSubcontractorPayments`in doğrudan sunucuya `site_id`
  // ilettiği unit testle (hook seviyesinde) ayrıca kanıtlanır.
  const paymentsRequest = page.waitForRequest(
    (req) =>
      req.url().includes("/subcontractor-progress-payments?") && req.url().includes("site_id=s-1"),
  );
  await page.goto("/projeler/p-1/santiyeler/s-1/hakedisler");
  await expect(page.getByRole("heading", { name: "A-Blok Şantiyesi — Hakedişler" })).toBeVisible();
  await paymentsRequest;

  await expect(page.getByText("Aydın Elektrik Taah. #1")).toBeVisible();
  await expect(page.getByText("Çelik İnşaat Taah.")).toHaveCount(0);
});

// F-SD T5 · "Günlükten Doldur" — sözleşme bazlı uç (`sc-2`, şantiye `s-2`).
// Köprü: `bi-5 → sci-4`, `bi-6 → sci-5`. Create formu + kaydetme YOK →
// hiçbir fikstür mutasyona uğramaz.
test("taşeron: Günlükten Doldur miktarları yazar", async ({ page }) => {
  await login(page);

  await page.goto("/hakedisler/taseron/yeni?contract=sc-2");
  await expect(page.getByTestId("thf-hierarchy")).toBeVisible();

  await page.locator("main").getByLabel("Dönem").selectOption("7");
  await page.locator("main").getByLabel("Hakediş yılı").fill("2026");

  await page.getByTestId("thf-diary-fill").click();

  await expect(page.getByTestId("thf-diary-fill-notice")).toContainText(
    "2 satır günlük kayıtlardan dolduruldu.",
  );
  await expect(page.locator("main").getByLabel("Duvar Örgü İşleri — miktar")).toHaveValue("320");
  await expect(page.locator("main").getByLabel("Sıva İşleri — miktar")).toHaveValue("260");
  // F-P10 T2 · rozet göçü: rozet artık YALNIZ sunucunun `quantity_source`
  // damgasından basılır — kaydedilmemiş doldurma rozet üretmez.
  await expect(page.getByTestId("thf-diary-source")).toHaveCount(0);
});
