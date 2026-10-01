import { test, expect } from "@playwright/test";

// F-P6 T4 · Bölüm Detay e2e — READ-ONLY (hiçbir POST/PATCH tetiklemez).
// `mock-backend.ts` sec-1 (A-Blok Şantiyesi altında, TÜM P6 alanları dolu,
// `is_draft: false`) ve sec-3 (taslak + `on_hold`, çoğu alan null) kayıtlarını
// kullanır — ikisi de `site-detail-visual.spec.ts` ve
// `section-detail-visual.spec.ts` ile PAYLAŞILAN sabit fikstürlerdir ama bu
// dosya hiçbir mutasyon yapmadığı için (yalnız GET) o baseline'larla YARIŞMAZ.
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/**
 * 🔴 F-BLMPUAN — SAATİ SABİTLEMEK ARTIK BİR DOĞRULUK KOŞULUDUR, süs değil.
 *
 * "İşçiler & Puantaj" sekmesi ve alt kart İÇİNDE BULUNULAN ayı gösterir
 * (`currentPeriod()`, ekranda ay gezinmesi yok). Sabitlenmezse spec bir sonraki
 * ay KENDİLİĞİNDEN kırmızıya döner.
 *
 * Ay seçimi de rastgele DEĞİL: `mock-backend.ts` fikstür izolasyonuna göre
 * **2026-08 · s-1 hiçbir spec tarafından DEĞİŞTİRİLMEZ** (görsel kadraj ayı);
 * **2026-09 · s-1 ise `PUT .../timesheet` oyun alanıdır** ve paralel koşan
 * puantaj spec'leri onu mutasyona uğratır. Bu ekranın kareleri/iddiaları
 * 2026-09'a bakarsa BAŞKA BİR SPEC'İN YAZMASINA bağımlı olur.
 */
const FIXED_TODAY = new Date("2026-08-20T12:00:00Z");

test("santiye detayindan bolum detayina link, hero + KPI + sekmeler + Hakedis Olustur linki", async ({
  page,
}) => {
  await page.clock.setFixedTime(FIXED_TODAY);
  await login(page);

  // 1) Zincirin ilk halkası: Şantiye Detay'daki SectionCard "Detay →" linkinden
  // GERÇEK navigasyonla bölüm detayına gidilir (page.goto DEĞİL) — SectionCard →
  // Bölüm Detay bağlantısının kopuk olmadığının kanıtı.
  await page.goto("/projeler/p-1/santiyeler/s-1");
  await expect(page.getByRole("heading", { level: 1, name: "A-Blok Şantiyesi" })).toBeVisible();
  const secCard = page.getByTestId("section-list").locator("li", { hasText: "Kat 6–10 Kaba İnşaat" });
  await secCard.getByRole("link", { name: "Detay →" }).click();
  // 🔴 URL-3 — bolume GIRIS baglantisi artik BOLUMUN OKUNUR ANAHTARINI tasir
  // (`sec-1`in slug'i `kat-6-10-kaba-insaat`). Beklenen deger BILEREK ELLE
  // yazilmaya devam ediyor: `routes.*`e baglanan bir iddia ureticiyle BIRLIKTE
  // kayar ve gocun tek dis tanigi kaybolurdu.
  await expect(page).toHaveURL(/\/santiyeler\/s-1\/bolumler\/kat-6-10-kaba-insaat$/);

  // 2) Hero alanları (D54-96): başlık, durum rozeti, meta satırı.
  await expect(page.getByRole("heading", { level: 1, name: "Kat 6–10 Kaba İnşaat" })).toBeVisible();
  await expect(page.getByText("Aktif", { exact: true })).toBeVisible();
  // Düzeltme turu 2 (final review C1): "A-Blok Şantiyesi" hem hero meta
  // satırında (D62) HEM DE drill kenar çubuğunun grup başlığında basılıyordu;
  // kapsamsız `getByText` strict-mode ihlali veriyordu. 🔴 DRILL-KALDIR
  // (2026-08-29) çubuğu sildi, yani ÇAKIŞMA KALKTI — ama assert kapsamlı
  // KALIR: hero meta satırını ölçmek zaten daha dar ve daha doğru iddiadır.
  await expect(page.locator(".section-hero__meta")).toContainText("A-Blok Şantiyesi");
  await expect(page.getByText("Sorumlu: Sercan Öztürk")).toBeVisible();

  // 3) KPI ayrımı — Bölüm Bedeli (türev `budget`, BLF-F1) VE Kalan Gün (end_date türevi)
  // GERÇEK; İlerleme/İşçi yer tutucu (task-2-brief §KPI).
  //
  // 🔴 F-BLMKART (2026-08-27) GÜNCELLEMESİ: "İş Kalemleri" ARTIK YER TUTUCU
  // DEĞİLDİR. Backend BLM-SAY (`1def2b9`) `boq_item_count`u BOQ tahsislerinden
  // türetti ve `to_section_detail` zarfları `to_section`ten AYNEN devraldığı
  // için DETAY ekranı da gerçek sayıyı alır. Eski satır ("boq hâlâ pending")
  // artık CANLIYI YALANLAYAN bir bekçiydi; ikiz düzeltildi ve bu satır onunla
  // birlikte güncellendi. sec-1'e üç poz tahsis edilmiştir (bkz. `BOQ_FIXTURE`).
  await expect(page.getByTestId("section-hero-kpi-budget")).toContainText("₺");
  await expect(page.getByTestId("section-hero-kpi-progress").locator(".section-hero__kpi-value--pending")).toHaveCount(1);
  await expect(page.getByTestId("section-hero-kpi-worker").locator(".section-hero__kpi-value--pending")).toHaveCount(1);
  await expect(page.getByTestId("section-hero-kpi-boq").locator(".section-hero__kpi-value--pending")).toHaveCount(0);
  await expect(page.getByTestId("section-hero-kpi-boq")).toContainText("3");
  await expect(page.getByTestId("section-hero-kpi-days").locator(".section-hero__kpi-value--pending")).toHaveCount(0);

  // 4) Eylemler: "Düzenle" doğru rotaya, "Hakediş Oluştur" P7 ekranına gider.
  // 🔴 URL-3 — "Duzenle" ADRESI izler: test bolume SLUG'li baglantidan girdigi
  // icin (yukarida) adres `.../bolumler/kat-6-10-kaba-insaat`tir ve duzenleme
  // baglantisi da o bicimi KORUR. Kaydin slug'ini degil ADRESI izlemesi
  // bilincli bir karardir (yonlendirme YOK: kullanicinin geldigi bicim yasar).
  await expect(page.getByRole("link", { name: "Düzenle" })).toHaveAttribute(
    "href",
    "/projeler/p-1/santiyeler/s-1/bolumler/kat-6-10-kaba-insaat/duzenle",
  );
  await expect(page.getByRole("link", { name: "Hakediş Oluştur" })).toHaveAttribute(
    "href",
    "/hakedisler/yeni?project=p-1",
  );

  // 5) Sekme geçişi (D99-105): 🔴 BOQ-SEC-F'ten sonra varsayılan "İş Kalemleri"
  // sekmesi GERÇEK tablodur, pending kartı değil; öbür sekmeler pending kalır.
  await expect(page.getByText("İş Kalemleri — Kat 6–10 Kaba İnşaat")).toBeVisible();
  // 🔴 F-BLMPUAN: "İşçiler & Puantaj" da artık YER TUTUCU DEĞİL, gerçek matris.
  await page.getByRole("tab", { name: "İşçiler & Puantaj" }).click();
  await expect(page.getByTestId("section-timesheet")).toBeVisible();
  await expect(page.getByText("İşçiler & Puantaj — bu bölümde henüz görüntülenemiyor")).toHaveCount(0);
  // 🔴 ŞEF DENETİMİ (F-BLMPUAN sonrası): regex PUANTAJA ÖZGÜ olmalıdır.
  // "bu bölüme henüz kırılmıyor" DÖRT pending anahtarının ORTAK kalıbıdır ve
  // alt sağdaki "Bölüm Malzeme Durumu" kartı onu HÂLÂ basar — stok bağı bu
  // dilimde AÇILMADI, yani o metin DOĞRUDUR. Geniş regex ürünü değil KENDİNİ
  // yanlışlıyordu (iki e2e kırmızısının tek sebebi buydu).
  await expect(page.getByText(/[Pp]uantaj bu bölüme henüz kırılmıyor/)).toHaveCount(0);
  // 🔴 STOK-BOLUM (2026-08-29) — POZİTİF KONTROLÜN ÇAPASI DEĞİŞTİ.
  //
  // Eski çapa "hâlâ pending olan stok kartının gerekçesi" idi; stok bağı
  // backend `186ffe9` ile AÇILDI ve o metin artık HİÇBİR YERDE basılmıyor —
  // çapa olarak bırakılsaydı test KIRMIZI olurdu (ve haklı olarak).
  //
  // Pozitif kontrolün AMACI korunur: yukarıdaki dar regex bir gerilemeyi
  // GİZLEMİYOR. Yeni çapa, alt kartın artık GERÇEK veri bastığıdır.
  await expect(page.getByText(/Stok hareketi bölüm alanı taşımıyor/)).toHaveCount(0);
  await expect(page.getByTestId("section-stock-card-list")).toBeVisible();
  // ŞP 117-119 karşılığı: bölüm adı + dönem, ve GÖRÜNEN kümenin türevleri.
  // sec-1'in 2026-08 kümesi: per-1 (3 saatli/izinli gün), per-2 (3 gün),
  // per-3 (2 saatli gün + 1 geçici görev) ⇒ 3 işçi.
  await expect(page.locator(".ts-summary__title")).toHaveText(
    "Kat 6–10 Kaba İnşaat · Ağustos 2026",
  );
  await expect(page.locator(".ts-summary__count")).toHaveText("3 işçi");
  // 🔴 POZİTİF KONTROL — seçici GERÇEKTİR: dolu bölümde SAAT hücresi basılır.
  // Bu iddia olmadan, boş bölümdeki `toHaveCount(0)` bekçisi yanlış yazılmış
  // bir seçiciyle de yeşil kalırdı (boş küme her zaman 0'dır).
  // (PUAN-SAAT: hücre artık kod rozeti `.ts-cell` DEĞİL, saat `.ts-hours`tur.)
  const panel = page.getByTestId("section-timesheet");
  expect(await panel.locator(".ts-hours").count()).toBeGreaterThan(0);
  // Kod rozeti de basılır — kayıt gizlenmez.
  expect(await panel.locator(".ts-tag").count()).toBeGreaterThan(0);
  // 🔴 SALT OKUNUR ve öyle KALIR: bu ekranda saat KUTUSU, kod çapası ve
  // kaydetme düğmesi HİÇ basılmaz (yazma yolu HAFTALIK ekrandadır).
  await expect(panel.locator(".ts-hin")).toHaveCount(0);
  await expect(panel.locator(".ts-week-cell__code-anchor")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Haftayı Kaydet" })).toHaveCount(0);
  await page.getByRole("tab", { name: "İş Kalemleri" }).click();
  await expect(page.getByTestId("section-boq-row")).toHaveCount(3);

  // 6) Alt satır kartları (D215-272) — pending, ama gerçek navigasyona açık.
  // 🔴 F-BOLLINK: "Puantaj →" artık BÖLÜM SÜZGECİNİ taşır (hedef ekran
  // `?section=` okur); "Tümü →" taşımaz (stok ekranı okumuyor — ölü parametre).
  await expect(page.getByText("Bu Bölümdeki İşçiler", { exact: false })).toBeVisible();
  // 🔴 F-BLMPUAN: kart artık GERÇEK gruplanmış satırlar basıyor (D219-246).
  // sec-1 · 2026-08: per-2 Demirci (Şirket) · per-1 Kalıpçı (Şirket) ·
  // per-3 Elektrikçi (Taşeron, sub-1). Eşit sayıda gruplar etikete göre (tr).
  await expect(page.getByTestId("section-workers-row")).toHaveCount(3);
  await expect(page.getByTestId("section-workers-row").nth(0)).toHaveText("ŞirketDemirci1 kişi");
  await expect(page.getByTestId("section-workers-row").nth(1)).toHaveText("ŞirketKalıpçı1 kişi");
  await expect(page.getByTestId("section-workers-row").nth(2)).toHaveText(
    "TaşeronElektrikçi — Aydın Elektrik Taah.1 kişi",
  );
  // sec-2'nin işçileri (per-4 Duvarcı · per-5 Düz İşçi) BU KARTA SIZMAZ.
  await expect(page.getByText("Duvarcı")).toHaveCount(0);
  await expect(page.getByText("Düz İşçi")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Puantaj →" })).toHaveAttribute(
    "href",
    "/projeler/p-1/santiyeler/s-1/puantaj?section=sec-1",
  );
  await expect(page.getByText("Bölüm Malzeme Durumu")).toBeVisible();
  await expect(page.getByRole("link", { name: "Tümü →" })).toHaveAttribute(
    "href",
    "/projeler/p-1/santiyeler/s-1/stok",
  );
});

test("bolum detayindaki 'Puantaj →' baglantisi bolum suzgecli puantaj ekranini acar", async ({
  page,
}) => {
  await login(page);
  await page.goto("/projeler/p-1/santiyeler/s-1/bolumler/sec-1");
  await page.getByRole("link", { name: "Puantaj →" }).click();
  // Bağlantı bölümü UNUTMUYOR: URL süzgeci taşır ve hedef ekran onu OKUR.
  await expect(page).toHaveURL(/\/santiyeler\/s-1\/puantaj\?section=sec-1$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Puantaj");
});

test("taslak + beklemede bolum: durum rozeti ve bos alanlarda durust yer tutucu", async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TODAY);
  await login(page);

  // sec-3: taslak + on_hold, section_type/manager/tarih hepsi null —
  // §4 zorunluluk kuralinin YALNIZ is_draft:false iken uygulandigini kanitlayan
  // kayit (bkz. e2e/mock-backend.ts). Dogrudan URL ile gidiliyor (READ-ONLY).
  await page.goto("/projeler/p-1/santiyeler/s-1/bolumler/sec-3");
  await expect(page.getByRole("heading", { level: 1, name: "Peyzaj Düzenlemesi (Taslak)" })).toBeVisible();
  await expect(page.getByText("Beklemede", { exact: true })).toBeVisible();

  // Bölüm Bedeli: tahsisi yok → türev `budget` `available: true` + "0.00" →
  // GERÇEK sıfır "₺ 0" (BLF-F1: elle kolon kalktı; "—" yalnız zarf yer tutucuysa).
  await expect(page.getByTestId("section-hero-kpi-budget")).toContainText("₺ 0");
  // Kalan Gün: end_date null → durust "—".
  await expect(page.getByTestId("section-hero-kpi-days")).toContainText("—");
});


/**
 * BOQ-SEC-F T7 — bölüm detayı · İş Kalemleri sekmesi (bölüm süzgeçli BOQ).
 *
 * 🔴 Bu spec'in ASIL işi, ucun "200 + DOLU gövde" döndüğünü DOĞRUDAN ölçmektir.
 * Sahte backend'de `?section_id=` okunmasaydı ekran şantiyenin BÜTÜN pozlarını
 * basardı ve naif bir test yine yeşil geçerdi (F-TKV M11 kanonu).
 */
test("bolum detayi Is Kalemleri sekmesi BOLUM SUZGECLI veriyi basar", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();

  await page.goto("/projeler/p-1/santiyeler/s-1/bolumler/sec-1");
  await expect(page.getByRole("heading", { level: 1, name: "Kat 6–10 Kaba İnşaat" })).toBeVisible();

  // (a) SÜZGEÇ İŞLİYOR: şantiyede 6 poz var, bu bölüme yalnız 3'ü tahsisli.
  await expect(page.getByTestId("section-boq-row")).toHaveCount(3);
  // Tahsisi olmayan poz EKRANDA OLMAMALI — süzgeç okunmasaydı görünürdü.
  await expect(page.getByText("Geri Dolgu ve Sıkıştırma")).toHaveCount(0);
  await expect(page.getByText("Tuğla Duvar (19cm)")).toHaveCount(0);

  // (b) BOŞALAN GRUP DÜŞER: "DUVAR VE KAPLAMA İŞLERİ" grubunun bu bölümde hiç
  // kalemi yok → başlığı da basılmaz (boş başlık dizisi yazılmaz).
  await expect(page.getByTestId("section-boq-group")).toHaveCount(2);
  await expect(page.getByTestId("section-boq-group").first()).toHaveText(
    "A. TOPRAK VE TEMEL İŞLERİ",
  );

  // (c) 🔴 K2 — MİKTAR SÜTUNU BÖLÜM PAYIDIR, poz kotası DEĞİL.
  // "C25/30 Beton (Döşeme)" şantiye kotası 3.200; bu bölümün payı 1.200.
  const quantities = page.getByTestId("section-boq-quantity");
  await expect(quantities.nth(1)).toHaveText("1.200");
  await expect(page.getByText("3.200", { exact: true })).toHaveCount(0);

  // (d) Toplam da maskelenmiş miktardan türer: 112.000 + 2.220.000 + 1.572.500.
  await expect(page.getByTestId("section-boq-total-amount")).toContainText("3.904.500");
  await expect(page.getByText("BÖLÜM TOPLAM (3 kalem)")).toBeVisible();

  // (e) K1 — poz seçici YOK: "+ Kalem Ekle" silinmedi, GEREKÇELİ devre dışı.
  await expect(page.getByRole("button", { name: "+ Kalem Ekle" })).toBeDisabled();
  await expect(page.getByText(/Poz seçme ekranı henüz tasarlanmadı/)).toBeVisible();

  // (f) Backend'de karşılığı olmayan iki sütun sahte veriyle DOLDURULMAZ.
  await expect(page.getByTestId("section-boq-status").first()).toHaveText(/^—/);
  await expect(page.getByTestId("section-boq-pct").first()).toHaveText(/^—/);
});

test("hic tahsisi olmayan bolumde durust bos durum basilir", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();

  // sec-3 ("Peyzaj Düzenlemesi") hiçbir pozdan pay almadı.
  await page.goto("/projeler/p-1/santiyeler/s-1/bolumler/sec-3");
  await expect(page.getByTestId("section-boq-empty")).toBeVisible();
  await expect(page.getByText("Bu bölüme henüz iş kalemi atanmadı.")).toBeVisible();
  await expect(page.getByText(/^0 kalem ·/)).toBeVisible();
});


/**
 * F-BLMPUAN — BOŞ VERİ ≠ MODÜL YOK.
 *
 * sec-3 ("Peyzaj Düzenlemesi") hiç puantaj hücresi taşımaz. Ekran boş kalır ama
 * "bu bölüme kırılmıyor" DEMEZ — kusuru kapatmak yerine kılık değiştirmiş olurdu.
 */
test("puantaji olmayan bolumde 'bu ay kayit yok' der, 'modul yok' DEMEZ", async ({ page }) => {
  await page.clock.setFixedTime(FIXED_TODAY);
  await login(page);
  await page.goto("/projeler/p-1/santiyeler/s-1/bolumler/sec-3");
  await expect(page.getByRole("heading", { level: 1, name: "Peyzaj Düzenlemesi (Taslak)" })).toBeVisible();

  const empty = page.getByTestId("section-workers-empty");
  await expect(empty).toHaveText("Ağustos 2026 döneminde bu bölümde puantaj kaydı yok.");
  // 🔴 ŞEF DENETİMİ (F-BLMPUAN sonrası): regex PUANTAJA ÖZGÜ olmalıdır.
  // "bu bölüme henüz kırılmıyor" DÖRT pending anahtarının ORTAK kalıbıdır ve
  // alt sağdaki "Bölüm Malzeme Durumu" kartı onu HÂLÂ basar — stok bağı bu
  // dilimde AÇILMADI, yani o metin DOĞRUDUR. Geniş regex ürünü değil KENDİNİ
  // yanlışlıyordu (iki e2e kırmızısının tek sebebi buydu).
  await expect(page.getByText(/[Pp]uantaj bu bölüme henüz kırılmıyor/)).toHaveCount(0);
  // 🔴 STOK-BOLUM (2026-08-29) — POZİTİF KONTROLÜN ÇAPASI DEĞİŞTİ.
  //
  // Eski çapa "hâlâ pending olan stok kartının gerekçesi" idi; stok bağı
  // backend `186ffe9` ile AÇILDI ve o metin artık HİÇBİR YERDE basılmıyor —
  // çapa olarak bırakılsaydı test KIRMIZI olurdu (ve haklı olarak).
  //
  // Pozitif kontrolün AMACI korunur: yukarıdaki dar regex bir gerilemeyi
  // GİZLEMİYOR. Yeni çapa, alt kartın artık GERÇEK veri bastığıdır.
  await expect(page.getByText(/Stok hareketi bölüm alanı taşımıyor/)).toHaveCount(0);
  // ⚠️ `sec-3`e atfedilmiş malzeme YOKTUR — kart BOŞ dalını basar. Bu bir
  // "pending" DEĞİLDİR: gerçek bir sorgunun gerçek boş cevabıdır ve cümlesi
  // de öyle kurulur.
  await expect(page.getByTestId("section-stock-card-empty")).toBeVisible();
  await expect(page.getByText(/modülle birlikte gelir/)).toHaveCount(0);
  // Kart yine de "Puantaj →" yolunu KORUR — sekme onun yerine geçmez.
  await expect(page.getByRole("link", { name: "Puantaj →" })).toHaveAttribute(
    "href",
    "/projeler/p-1/santiyeler/s-1/puantaj?section=sec-3",
  );

  // Sekme de boş ama CANLI: yer tutucu kart değil, gerçek (boş) matris basar.
  await page.getByRole("tab", { name: "İşçiler & Puantaj" }).click();
  await expect(page.getByTestId("section-timesheet")).toBeVisible();
  await expect(page.locator(".ts-summary__count")).toHaveText("0 işçi");
  await expect(page.getByText("İşçiler & Puantaj — bu bölümde henüz görüntülenemiyor")).toHaveCount(0);

  // 🔴 ŞEF ÖLÇÜMÜ (canlının İLK göreceği hâl budur — hiç puantaj kaydı yok).
  // Panelin kendisi bir CÜMLE basmaz: K1 gereği satırlar AKTİF PERSONEL
  // KARTOTEKSİNDEN kurulur, yani boş ayda bile 6 satır çizilir ve hepsi
  // BOŞTUR ("0 işçi", "0 adam/gün"). Bu, şantiye ekranının `?section=`
  // görünümüyle BİREBİR aynı davranıştır ve ŞP mockup'ının çizdiği hâldir —
  // mockup'ta olmayan bir uyarı şeridi İCAT EDİLMEZ.
  //
  // Hâli DÜRÜST kılan şey, alt kartın AYNI ANDA ekranda durup dönemi açıkça
  // söylemesidir. Bu yüzden BURASI bekçilenir: kart sekme açıkken gizlenirse
  // kullanıcı çıplak bir boş ızgarayla kalır ve "modül çalışmıyor" sanır —
  // yani kusur kapanmış değil KILIK DEĞİŞTİRMİŞ olurdu.
  await expect(empty).toBeVisible();
  await expect(empty).toHaveText("Ağustos 2026 döneminde bu bölümde puantaj kaydı yok.");
  // Boş ızgaranın satırları GERÇEKTEN boş: tek bir hücre rozeti bile yok.
  await expect(page.getByTestId("section-timesheet").locator(".ts-cell")).toHaveCount(0);
});
