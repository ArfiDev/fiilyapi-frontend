import { test, expect, type Page } from "@playwright/test";

/**
 * F-BLMSEK T4 · Bölüm Detay'ın ÜÇ sekmesinin DAVRANIŞ testi (piksel DEĞİL).
 *
 * Kullanıcının şikâyeti "üç sekme de aynı görünüyor"du. T1/T2 "Günlük Kayıt" ve
 * "Hakediş"i canlıya aldı, T3 "Malzeme"yi kendi dürüst gerekçesine taşıdı. Bu
 * dosya o üçünün GERÇEKTEN ayrıştığını ve süzgeçlerin GERÇEKTEN süzdüğünü
 * ölçer.
 *
 * 🔴 SÜZGEÇLER KARŞI-KANITLA ÖLÇÜLÜR (K-IKIZ1): T4 fikstür turunda `d-2`
 * "sec-2"ye, `scpp-2` "sec-1"e, `scpp-3` "sec-2"ye taşındı. Bundan ÖNCE s-1'in
 * TÜM günlükleri sec-1'de ve TÜM hakedişleri `null` bölümdeydi — yani süzgeci
 * tamamen SİLEN bir mutant bile bu ekranı yeşil geçirirdi. Aşağıdaki
 * "GÖSTERİLMEZ" iddiaları o boşluğu kapatır.
 *
 * 🔴 READ-ONLY: yalnız GET. Hiçbir kaydı mutasyona uğratmaz, dolayısıyla
 * `fullyParallel` altında görsel spec'lerle YARIŞMAZ.
 *
 * 🔴 `getByRole("alert")` BU DOSYADA KULLANILMAZ (F-P6 kanonu). Bağlantı
 * toplayan iddialar `querySelectorAll("a[href]")` ile yapılır.
 */
const FIXED_TODAY = new Date("2026-08-20T12:00:00Z");

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

async function openSection(page: Page, sectionId: string, heading: string) {
  await page.clock.setFixedTime(FIXED_TODAY);
  await login(page);
  await page.goto(`/projeler/p-1/santiyeler/s-1/bolumler/${sectionId}`);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

/**
 * 🔴 DET-1.1 · Bölüm listesi SUNUCU süzgecidir: `GET /sites/{id}/diary?section_id=`
 * (Kural A — başlığı bu bölüm ∪ bu bölüme miktar satırı yazılmış gün). Kaldırılan
 * İSTEMCİ süzgeci (`section-diary.ts`) "başka bölüme atanmış N kayıt bu listede
 * yok" notunu basıyordu; sunucu süzgecinde dışarıda kalan sayılamaz ve not
 * artık YALNIZ sayfa kırpılmasında (`items < total`) çıkar. Eski not iddiaları
 * bu yüzden TERSİNE döndü: not YOK, eski cümle de hiçbir yerde YOK.
 */
function sectionDiaryRequest(page: Page, sectionId: string) {
  return page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      request.method() === "GET" &&
      url.pathname === "/api/backend/sites/s-1/diary" &&
      url.searchParams.get("section_id") === sectionId
    );
  });
}

/** Satırın detay adresi — yol ADRES anahtarlarıyla (`routes.projects.sites.sections.diaryEntry`). */
const diaryEntryPath = (sectionId: string, entryId: string) =>
  `/projeler/p-1/santiyeler/s-1/bolumler/${sectionId}/gunluk-kayit/${entryId}`;

test("Gunluk Kayit sekmesi SUNUCU suzgecini (Kural A) basar: satir detaya baglanir, baska bolum DUSER", async ({
  page,
}) => {
  const request = sectionDiaryRequest(page, "sec-1");
  await openSection(page, "sec-1", "Kat 6–10 Kaba İnşaat");
  // Süzgeç İSTEKTEDİR: `section_id` gider, ay süzgeci GİTMEZ (liste tüm ayları kapsar).
  const listUrl = new URL((await request).url());
  expect(listUrl.searchParams.has("year")).toBe(false);
  expect(listUrl.searchParams.has("month")).toBe(false);

  await page.getByRole("tab", { name: "Günlük Kayıt" }).click();
  // DET-1.2 · S4 — açık sekme URL'dedir (detayın kırıntısı buraya döner).
  await expect(page).toHaveURL(/\/bolumler\/sec-1\?sekme=gunluk-kayit$/);
  await expect(page.getByRole("tab", { name: "Günlük Kayıt" })).toHaveAttribute("aria-selected", "true");

  const panel = page.getByTestId("section-diary");
  await expect(panel).toBeVisible();
  await expect(page.getByText("Yükleniyor…")).toHaveCount(0);
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText(
    "Kat 6–10 Kaba İnşaat · Günlük Kayıtlar",
  );

  // (a) `d-1` (başlığı sec-1) BASILIR — tek satır.
  await expect(panel.locator(".section-diary__row")).toHaveCount(1);
  await expect(panel).toContainText("15 Tem");
  // `d-1`in işçi toplamı: 12 + 8 + 6 = 26.
  await expect(panel).toContainText("26 işçi");
  await expect(panel).toContainText("Kat 6–10 Kaba İnşaat");

  // (b) 🔴 KARŞI-KANIT: `d-2` sec-2'dedir (başlık VE satır) ve GÖSTERİLMEZ.
  await expect(panel).not.toContainText("16 Tem");
  await expect(panel).not.toContainText("5 işçi");
  await expect(panel).not.toContainText("Zemin Kat Kaba İnşaat");

  // (c) Satırın TAMAMI detay sayfasına TEK bağlantıdır (`a[href]` ile toplanır).
  const rowHrefs = await panel.locator(".section-diary__row").evaluateAll((rows) =>
    rows.flatMap((row) => Array.from(row.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"))),
  );
  expect(rowHrefs).toEqual([diaryEntryPath("sec-1", "d-1")]);
  await expect(panel.getByRole("link", { name: "15.07.2026 günlük kaydını görüntüle · Gönderildi" })).toBeVisible();

  // (d) `d-1` BAŞLIK koluyla bağlıdır → "Satırla bağlı" rozeti ve "Başlık:" metası YOK.
  // (Satır kolu listede görünmez: kalıcı fikstürü d-10 KASIM'dadır ve ay
  // süzgeçsiz listeden gizlidir — bekçisi ikiz testinde, görünümü detay karesinde.)
  await expect(panel.getByText("Satırla bağlı")).toHaveCount(0);
  await expect(panel).not.toContainText("Başlık:");

  // (e) Kırpılma yok → not YOK; kaldırılan istemci süzgecinin cümlesi de YOK.
  await expect(panel.getByTestId("section-diary-note")).toHaveCount(0);
  await expect(panel).not.toContainText("başka bölüme atanmış");

  // (f) Başlığın çıkış yolu şantiye günlüğüdür.
  const headHrefs = await panel.locator(".section-diary__head").evaluate((el) =>
    Array.from(el.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")),
  );
  expect(headHrefs).toEqual(["/projeler/p-1/santiyeler/s-1/gunluk-kayit"]);
});

test("gunlugu olmayan bolumde 'kayit yok' der, 'kirilmiyor' DEMEZ", async ({ page }) => {
  const request = sectionDiaryRequest(page, "sec-3");
  await openSection(page, "sec-3", "Peyzaj Düzenlemesi (Taslak)");
  await request;
  await page.getByRole("tab", { name: "Günlük Kayıt" }).click();

  const panel = page.getByTestId("section-diary");
  await expect(panel).toBeVisible();
  await expect(page.getByText("Yükleniyor…")).toHaveCount(0);

  // 🔴 "Veri YOK" ≠ "modül bu bölüme KIRILMIYOR". Bağ AÇIK; eksik olan kayıttır.
  await expect(panel).toContainText("Bu bölümde günlük kayıt yok");
  await expect(panel.locator(".section-diary__row")).toHaveCount(0);
  await expect(panel).not.toContainText("kırılmıyor");

  // Boş listede bile kart KENDİ kapsamını söyler (başlıkta bölüm adı).
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText(
    "Peyzaj Düzenlemesi (Taslak) · Günlük Kayıtlar",
  );
  // DET-1.1 — s-1'in öteki kayıtları SUNUCUDA süzülür; istemci onları SAYMAZ
  // (eski "başka bölüme atanmış 2 kayıt" notu kalktı).
  await expect(panel.getByTestId("section-diary-note")).toHaveCount(0);
  await expect(panel).not.toContainText("başka bölüme atanmış");
});

/**
 * DET-1.2 · Liste → detay → geri AKIŞI (davranış; piksel DEĞİL). Kareleri
 * `site-diary-detail-visual.spec.ts`tedir. READ-ONLY: yalnız GET.
 */
test("gunluk satirina tiklamak detaya goturur, kirinti 'Gunluk Kayit' sekmesine DONER", async ({ page }) => {
  await openSection(page, "sec-1", "Kat 6–10 Kaba İnşaat");
  await page.getByRole("tab", { name: "Günlük Kayıt" }).click();
  const panel = page.getByTestId("section-diary");
  await expect(panel.locator(".section-diary__row")).toHaveCount(1);

  const entryResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/backend/diary/d-1",
  );
  await panel.getByRole("link", { name: /^15\.07\.2026 günlük kaydını görüntüle/ }).click();

  // Detay adresi + kayıt BÖLÜM bağlamında istenir (önceki/sonraki Kural A kümesinde).
  await expect(page).toHaveURL(new RegExp(`${diaryEntryPath("sec-1", "d-1")}$`));
  const response = await entryResponse;
  expect(response.status()).toBe(200);
  expect(new URL(response.url()).searchParams.get("section_id")).toBe("sec-1");
  await expect(page.getByRole("heading", { level: 1, name: "15.07.2026 Çarşamba" })).toBeVisible();

  // Kırıntı: "… / Günlük Kayıt / 15.07.2026" — "Günlük Kayıt" bölümün SEKMESİNE bağlanır.
  const crumbs = page.getByTestId("topbar-crumbs");
  await expect(crumbs.locator("li").last()).toHaveText(/15\.07\.2026$/);
  const diaryCrumb = crumbs.getByRole("link", { name: "Günlük Kayıt", exact: true });
  await expect(diaryCrumb).toHaveAttribute("href", "/projeler/p-1/santiyeler/s-1/bolumler/sec-1?sekme=gunluk-kayit");

  // Geri: kırıntı → Bölüm Detay, "Günlük Kayıt" sekmesi AÇIK.
  await diaryCrumb.click();
  await expect(page).toHaveURL(/\/bolumler\/sec-1\?sekme=gunluk-kayit$/);
  await expect(page.getByRole("tab", { name: "Günlük Kayıt" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("section-diary").locator(".section-diary__row")).toHaveCount(1);
});

test("Hakedis sekmesi bolum + 'Tum Bolumler' satirlarini basar, baska bolumu DUSURUR", async ({
  page,
}) => {
  await openSection(page, "sec-1", "Kat 6–10 Kaba İnşaat");
  await page.getByRole("tab", { name: "Hakediş" }).click();

  const panel = page.getByTestId("section-payments");
  await expect(panel).toBeVisible();
  await expect(page.getByText("Yükleniyor…")).toHaveCount(0);

  // Görünen küme: `scpp-2` (sec-1) + `scpp-1`, `scpp-4` (null = Tüm Bölümler)
  // + 🔴 HAK-NULL: `scpp-9` — sözleşmesi PROJE GENELİ (`sc-4`, `site_id: null`)
  // olan hakediş. Eskiden bu satır sunucudaki eşitlik süzgeci yüzünden
  // HİÇBİR bölümde görünmüyordu; canlıda sözleşmelerin HEPSİ proje geneli
  // olduğu için bu panel fiilen boştu.
  // `scpp-3` sec-2'dedir → DÜŞER. `scpp-7` `hiddenFromLists`tir.
  await expect(panel.locator(".pp-row")).toHaveCount(4);

  // (a) BU bölümün satırı GERÇEK adı basar — ekran adı zaten biliyor, pending "—" basmaz.
  await expect(panel).toContainText("Aydın Elektrik Taah. #2");
  await expect(panel).toContainText("Elektrik · Kat 6–10 Kaba İnşaat");

  // (b) `null` kapsamlı satırlar "Tüm Bölümler" basar — kapsam iddiası DARALTILMAZ.
  await expect(panel).toContainText("Aydın Elektrik Taah. #1");
  await expect(panel).toContainText("Aydın Elektrik Taah. #4");
  await expect(panel.getByText("Elektrik · Tüm Bölümler")).toHaveCount(2);

  // (b2) 🔴 HAK-NULL BEKÇİSİ: proje geneli sözleşmenin hakedişi BU bölümde
  // görünür ve o da "Tüm Bölümler" kapsamı taşır. Bu satır kaybolursa kusur
  // geri gelmiş demektir.
  await expect(panel).toContainText("Öz Genel Hizmetler #1");
  await expect(panel.getByText("Genel İşler · Tüm Bölümler")).toHaveCount(1);

  // (c) 🔴 KARŞI-KANIT: `scpp-3` (sec-2) GÖSTERİLMEZ.
  await expect(panel).not.toContainText("Aydın Elektrik Taah. #3");
  await expect(panel).not.toContainText("Zemin Kat Kaba İnşaat");

  // (d) Dışarıda kalan SAYILIR.
  await expect(panel.getByTestId("section-payments-note")).toContainText(
    "başka bölüme atanmış 1 hakediş bu listede yok",
  );

  // (e) 🔴 KAPSAM İDDİASI — SATIRLAR VARKEN de görünür. Yalnız boş dala konsaydı
  // dolu listede kullanıcı eksikliği HİÇ öğrenemezdi.
  const scope = panel.getByTestId("section-payments-scope");
  await expect(scope).toBeVisible();
  await expect(scope).toContainText("Yalnız taşeron hakedişleri listelenir");
  await expect(scope).toContainText("İşveren hakedişi bölüme kırılmıyor");
});

// 🔴 STOK-BOLUM (2026-08-29) — BAŞLIK VE İDDİA TERSİNE ÇEVRİLDİ. Eski hâli
// "YER TUTUCU kalir" diyordu; bölüm ↔ stok bağı backend `186ffe9` ile AÇILDI.
test("Malzeme sekmesi GERCEK kirilim basar ve suzgecli cikis yolunu tasir", async ({
  page,
}) => {
  await openSection(page, "sec-1", "Kat 6–10 Kaba İnşaat");
  await page.getByRole("tab", { name: "Malzeme" }).click();

  const panel = page.getByTestId("section-stock");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { level: 2 })).toHaveText(
    "Kat 6–10 Kaba İnşaat · Stok Hareketleri",
  );

  // TERS BEKÇİ — eski pending gerekçesi geri gelirse KIRMIZI.
  await expect(panel).not.toContainText("Stok hareketi bölüm alanı taşımıyor");
  await expect(panel).not.toContainText("için ayrı stok kaydı basılmıyor");

  // 🔴 ATANAN ve SARF AYRI hücrelerdedir — tek toplam basılsaydı 0,6 tonun
  // harcandığı HİÇ görünmezdi.
  const row = panel.getByTestId("section-stock-row-SNK-0421");
  await expect(row).toContainText("3 Ton");
  await expect(panel.getByTestId("section-stock-issued-SNK-0421")).toContainText("0,6 Ton");

  // Poz atfı OLMAYAN satır meşru bir hâl olarak basılır (fail-open).
  await expect(panel.getByTestId("section-stock-noboq-SNK-0108")).toContainText("Poz atanmadı");

  // 🔴 ÇIKIŞ YOLU ARTIK SÜZGECİ TAŞIR: hedef ekran `?section=` OKUYOR
  // (eski gerekçe — "ölü query" — backend süzgeci açılınca çürüdü).
  const hrefs = await panel.evaluate((el) =>
    Array.from(el.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")),
  );
  expect(hrefs).toContain("/projeler/p-1/santiyeler/s-1/stok?section=sec-1");
});

/**
 * 🔴 BU DİLİMİN KALBİ — KULLANICI ŞİKÂYETİNİN DOĞRUDAN BEKÇİSİ.
 *
 * Şikâyet "üç sekme de aynı görünüyor"du: üçü de jenerik
 * `${label} — bu bölümde henüz görüntülenemiyor` cümlesini basıyordu. Tek tek
 * panel testleri bu gerilemeyi YAKALAYAMAZ — her biri kendi metnini doğrular ve
 * üçü AYNI metne dönse bile üçü de yeşil kalır. Ayrım ancak ÜÇÜ BİRDEN
 * karşılaştırılınca ölçülebilir.
 */
test("uc sekmenin paneli birbirinden AYIRT EDILEBILIR", async ({ page }) => {
  await openSection(page, "sec-1", "Kat 6–10 Kaba İnşaat");

  const panelText = async (tab: string) => {
    await page.getByRole("tab", { name: tab }).click();
    // DET-1.2 · sekme URL'dedir (`?sekme=`, `router.replace`) — geçiş ASENKRON.
    // Seçili sekme URL'den türediği için panel aynı render'da gelir; önce onu bekle.
    await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    const body = page.locator(".section-panel__body");
    await expect(body).toBeVisible();
    await expect(page.getByText("Yükleniyor…")).toHaveCount(0);
    return ((await body.innerText()) ?? "").trim();
  };

  const diary = await panelText("Günlük Kayıt");
  const payments = await panelText("Hakediş");
  const stock = await panelText("Malzeme");

  // (a) Üçü de GERÇEKTEN bir şey basıyor (boş metin "farklı" sayılmasın).
  for (const text of [diary, payments, stock]) {
    expect(text.length).toBeGreaterThan(40);
  }

  // (b) İKİŞER İKİŞER FARKLI.
  expect(diary).not.toEqual(payments);
  expect(diary).not.toEqual(stock);
  expect(payments).not.toEqual(stock);

  // (c) Her panel KENDİ konusunu adlandırır — "farklı" olmak yetmez, DOĞRU
  // konuda farklı olmalı (yalnız bölüm adı değişse de (b) geçerdi).
  expect(diary).toContain("Günlük Kayıtlar");
  expect(payments).toContain("Taşeron Hakedişleri");
  expect(stock).toContain("Stok Hareketleri");

  // (d) 🔴 ESKİ JENERİK CÜMLE PANELLERDEN TAMAMEN KALKTI. Görev tanımı "en çok
  // Malzeme panelinde" diyordu; ÖLÇÜM daha güçlü çıktı — T3 sonrası Malzeme
  // paneli de kendi spesifik metnini basıyor, jenerik cümle ÜÇÜNDE DE YOK.
  // (Alt satırdaki "Bölüm Malzeme Durumu" YAN KARTI onu hâlâ basar; bu yüzden
  // iddia `.section-panel__body` ile SEKME PANELİNE kapsanmıştır.)
  const generic = "— bu bölümde henüz görüntülenemiyor";
  expect(diary).not.toContain(generic);
  expect(payments).not.toContain(generic);
  expect(stock).not.toContain(generic);
});
