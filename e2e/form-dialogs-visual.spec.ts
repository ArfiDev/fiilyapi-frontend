import { test, expect, type Page } from "@playwright/test";

import { pinEmployerContractItems } from "./contracts-visual-helpers";
import { openManualItemForm } from "./employer-catalog-picker-helpers";
import { prepareFrame } from "./visual-scroll";

// F-BLG T3 · Altı FORM diyaloğunun görsel kadrajları.
//
// Kanon mockup'lar: `Form - Poz Ekle Taseron.dc.html` · `Form - Poz Ekle
// Isveren.dc.html` · `Form - Ekipman Belgesi.dc.html` · `Form - Belge
// Ekle.dc.html` · `Form - Personel Belgesi.dc.html` · `Form - Depo
// Ekle.dc.html`. Altısı da onaylı sapma S-FRM gereği DİYALOG olarak açılır;
// kadraj `fullPage`dir ki örtü (overlay) katmanı ve altındaki ekran da kareye
// girsin (`belge-yukle-diyalog` emsali — eleman kadrajı örtüyü göstermez).
//
// 🔒 SALT-OKUR: altı kadrajın HİÇBİRİ "Kaydet"e basmaz. Diyaloglar YALNIZ
// açılır. Bu ZORUNLU: `POST /projects/p-1/contract/items` `p-1`in kalem
// listesini, dağıtım ızgarasını ve sözleşme metriklerini büyütürdü;
// `POST /personnel/per-1/documents` PD baseline'ının belge kartını
// değiştirirdi; `POST /equipment/eq-1/documents` bağlam bandının sayacını
// kaydırırdı. Yazma akışları mock'ta AYRI kayıtlara sürgündür (bkz.
// `mock-backend.ts` fikstür notları) ve `fullyParallel` altında bu dosyayla
// yarışmaz.
//
// 🔴 "YÜKLENDİ" İDDİASI HER BAĞIMSIZ VERİ KAYNAĞINI KAPSAR (WORKFLOW §4, 5.
// parça). Bu dilimde kritik: diyaloglar ÇOK KAYNAKLIDIR ve kaynaklarının
// bir kısmı ALTTAKİ ekrandan, bir kısmı diyaloğun KENDİ hook'larından gelir.
// Kaç sorgu olduğu tahmin EDİLMEDİ, hook katmanına bakıldı:
//   • TAŞ  → sözleşme detayı + taşeron listesi (VKN) + N hakediş detayı;
//            diyalog KENDİ sorgusu yoktur (props).
//   • İŞV  → sözleşme (fiyat farkı) + kalem/grup listesi.
//   • EKP  → ekipman listesi + özet + şantiye seçenekleri + personel
//            (ekran) · belge türleri + ekipmanın belge sayacı (diyalog).
//   • ARŞ  → proje listesi + klasörler + belgeler (ekran) · proje listesi
//            (diyalog); şantiye/klasör seçicileri proje seçilene kadar
//            KAPALIdır, o yüzden bu kadrajda o iki sorgu HİÇ uçmaz.
//   • PB   → personel detayı + projeler (alt başlık) + personelin belgeleri
//            (kart + sayaç) · İK belge özeti (tip kataloğu).
//   • DP   → stok özeti (ekran) · projeler + HER projenin şantiyeleri
//            (diyalog, kayar pencereli FAN-OUT).
// Fan-out'un bitişi ekranda görünmediği için `whf-sites-loaded` işareti
// (hidden) okunur — yarım pencerede kare almak yasaktır.
//
// 📅 TARİH — F-ZAMAN'da ÖLÇÜLDÜ (paragraf yeniden yazıldı; eskisi doğru
// sonuca YANLIŞ gerekçeyle varıyordu).
//
//   • ARŞ · `/belgeler` "Bugün"/"Dün" etiketi basar → `ARCHIVE_FIXED_NOW`.
//   • İŞV · alttaki ekran (`EmployerContractDetailView.tsx:74`
//     `useState(() => new Date())` → `contract-end-tone.ts`) "Bitiş Tarihi"
//     metriğinin RENGİNİ bugünden türetir ve fikstür `end_date` 2026-12-01
//     olduğu için ton 2026-11-01'de warning'e, 2026-12-02'de danger'a
//     GEÇER — DOM'da ölçüldü: `rgb(30,41,59)` → `rgb(239,68,68)`.
//     ⚠️ AMA KAREYE GİRMEZ: diyalog açıkken metrik hücresinin merkezinde
//     `elementFromPoint` diyalog panelini (`pif-card`) döndürür, yani panel
//     metriği ÖRTER. Ölçümle doğrulandı: aynı kadraj 2026-08-15 ve
//     2027-01-15 damgalarıyla üretildiğinde iki `.png` BAYT AYNIdır.
//     Bu yüzden buraya `page.clock` KONULMADI — koysaydık hiçbir şey
//     bekçilemeyen ölü koruma olurdu (F-ZAMAN'ın kendi mutasyon kuralı).
//     🔴 Muafiyet ÖRTÜLMEYE dayanır: diyalog paneli küçülür/kayarsa ya da
//     metrik şeridi yer değiştirirse kadraj MARUZ hâle gelir. O gün
//     `KASTEN_DISARIDA` girdisi silinip dondurma eklenir.
//   • Kalan dört kadrajın (TAŞ · EKP · PB · DP) alttaki ekranlarının
//     bileşen grafiğinde ürün kodunda `new Date()`/`Date.now()` YOKTUR
//     (AST ile ölçüldü).
//
// İŞV dâhil beş kadraj `src/test-guards/visual-frame-guard.test.ts`
// içindeki `KASTEN_DISARIDA` listesinde gerekçeleriyle yaşar.
//
// ⚠️ Sabit `waitForTimeout` YOKTUR; her bekleme durum tabanlıdır.
//
// Baseline `.png` YALNIZ Linux CI'da üretilir (visual-baselines.yml →
// workflow_dispatch → artifact → `e2e/`); macOS'ta koşturulup commit edilmez.

const VISUAL_VIEWPORT = { width: 1440, height: 900 } as const;

/** `/belgeler` fikstürlerinin "bugünü" — arşiv görsel spec'iyle AYNI an. */
const ARCHIVE_FIXED_NOW = "2026-07-17T13:00:00Z";

async function login(page: Page) {
  await page.setViewportSize({ ...VISUAL_VIEWPORT });
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

// ---------------------------------------------------------------------------
// 1) TAŞ · Taşeron Sözleşmesine Poz Ekle
// ---------------------------------------------------------------------------
test("poz ekle taseron diyalogu gorsel", async ({ page }) => {
  await login(page);
  await page.goto("/sozlesmeler/taseron/sc-1");

  // YÜKLENDİ (a) sözleşme detayı — başlık + zincir + poz toplamı basıldı.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Aydın Elektrik Taah.");
  await expect(page.getByTestId("tsd-chain")).toBeVisible();
  await expect(page.getByTestId("tsd-items-total")).toContainText("371.400");
  // YÜKLENDİ (b) taşeron listesi — VKN sözleşme şemasında YOKTUR, AYRI uçtan
  // süzülür; gelmezse hücre boş kalır ve kadraja donmuş hâliyle girerdi.
  await expect(page.getByTestId("tsd-tax-number")).toHaveText("1234567890");
  // YÜKLENDİ (c) N paralel hakediş detay sorgusu — "Hakediş %" kolonu artık
  // "—" değil (`subcontractor-contract-detail-visual` ile aynı gerekçe).
  await expect(page.getByTestId("tsd-progress-E.01")).toContainText("%");
  await expect(page.getByTestId("tsd-progress-E.02")).toContainText("%");
  await expect(page.getByTestId("tsd-progress-E.03")).toContainText("%");

  await page.getByTestId("tsd-add-item").click();
  const dialog = page.getByRole("dialog", { name: "Taşeron Sözleşmesine Poz Ekle" });
  await expect(dialog).toBeVisible();
  // Diyalog OTURDU: boş formun iki türev yüzeyi de basılı — satır bedeli
  // yer tutucusu ve mockup 143-147'nin turuncu FİYATSIZ POZ uyarısı
  // (`unit_price` boş başlar). Özet rayındaki rozet de kadrajda.
  await expect(dialog.getByTestId("tsi-line-total")).toBeVisible();
  await expect(dialog.getByTestId("tsi-unpriced-warning")).toBeVisible();
  await expect(dialog.getByTestId("tsi-summary-status")).toBeVisible();
  // Sözleşme durumu kartı sunucu türevini basar (istemci toplamı DEĞİL).
  await expect(dialog.getByTestId("tsi-error")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("poz-ekle-taseron.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 2) İŞV · İşveren Sözleşmesine Poz Ekle
// ---------------------------------------------------------------------------
test("poz ekle isveren diyalogu gorsel", async ({ page }) => {
  await login(page);
  // `contract-distribution.spec.ts`in geçici kota penceresiyle yarışmamak
  // için kalem GET'i tohum değerlerine sabitlenir (E14 kadrajıyla aynı
  // gerekçe) — paylaşılan mock durumu DEĞİŞMEZ.
  await pinEmployerContractItems(page);
  await page.goto("/sozlesmeler/isveren/p-1?tab=items");

  await expect(page.getByRole("heading", { level: 1, name: "Kule A" })).toBeVisible();
  // YÜKLENDİ (a) kalem/grup listesi — türev kolonlar ve toplam satırı basıldı.
  await expect(page.getByTestId("ecd-item-distributed").first()).toBeVisible();
  await expect(page.getByTestId("ecd-items-total")).toBeVisible();

  // "+ Poz Ekle" katalog seçicisini açar; kadraj eski tekli formdur → "Elle poz ekle" köprüsü.
  const dialog = await openManualItemForm(page);
  // YÜKLENDİ (a') grup listesi diyaloğa AKTARILDI — seçici gerçek grubu
  // taşıyor (boş bir seçici kadraja girmesin).
  await expect(
    dialog.getByLabel("Poz Grubu").locator("option", { hasText: "Betonarme İşleri" }),
  ).toHaveCount(1);
  // YÜKLENDİ (b) SÖZLEŞME — fiyat farkı iki seçicisi salt-okunurdur ve
  // değerlerini sözleşmeden okur; sözleşme sorgusu bitmeden bu iki alan boş
  // basılır ve kare bozulurdu.
  await expect(dialog.getByTestId("eci-escalation")).not.toHaveValue("");
  await expect(dialog.getByTestId("eci-index-type")).not.toHaveValue("");
  await expect(dialog.getByTestId("eci-escalation-reason")).toBeVisible();
  // Diyalog OTURDU: türev bedel ve sözleşme toplamı basılı, hata satırı yok.
  await expect(dialog.getByTestId("eci-line-total")).toBeVisible();
  await expect(dialog.getByTestId("eci-contract-total")).toBeVisible();
  await expect(dialog.getByTestId("eci-error")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("poz-ekle-isveren.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 3) EKP · Ekipman Belgesi Ekle
// ---------------------------------------------------------------------------
test("ekipman belgesi formu diyalogu gorsel", async ({ page }) => {
  await login(page);
  await page.goto("/makine");
  await expect(page.getByRole("heading", { level: 1, name: "Makine & Ekipman" })).toBeVisible();

  // YÜKLENDİ (a-d) — ekranın DÖRT bağımsız kaynağı (`equipment-visual` ile
  // aynı işaretler): liste · özet · şantiye seçenekleri · personel.
  await expect(page.getByTestId("makine-loaded-equipment")).toHaveCount(1);
  await expect(page.getByTestId("makine-loaded-summary")).toHaveCount(1);
  await expect(page.getByTestId("makine-loaded-sites")).toHaveCount(1);
  await expect(page.getByTestId("makine-loaded-personnel")).toHaveCount(1);

  const card = page.locator('[data-equipment-id="eq-1"]');
  await card.getByTestId("makine-card-document-button").click();
  const dialog = page.getByRole("dialog", { name: "Ekipman Belgesi Ekle" });
  await expect(dialog).toBeVisible();
  // YÜKLENDİ (e) belge TÜRLERİ (`GET /equipment/document-types`) — altı sabit
  // slot + yer tutucu; boş seçici kadraja giremez.
  await expect(dialog.getByTestId("edf-type").locator("option")).toHaveCount(7);
  // YÜKLENDİ (f) ekipmanın BELGE SAYACI (`GET /equipment/{id}/documents`) —
  // bant sayacı yalnız veri geldiğinde basılır, yani varlığı iddianın ta
  // kendisidir; içeriği de sunucu sayısını taşır.
  await expect(dialog.getByTestId("edf-document-count")).toHaveText("2 belge kayıtlı");
  // YÜKLENDİ (g) bağlam bandının şantiye adı — AYRI kaynaktan (`useSiteOptions`)
  // çözülür ve gelmeden "Yükleniyor…" basar; o hâl kadraja DONMAMALIDIR.
  await expect(dialog.getByTestId("edf-context")).not.toContainText("Yükleniyor…");
  await expect(dialog.getByTestId("edf-types-error")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("ekipman-belgesi-formu.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 4) ARŞ · Belge Ekle (genel arşiv)
// ---------------------------------------------------------------------------
test("belge ekle formu diyalogu gorsel", async ({ page }) => {
  await page.clock.setFixedTime(new Date(ARCHIVE_FIXED_NOW));
  await login(page);
  await page.goto("/belgeler?proje=p-1&folder=df-p1-2");

  // YÜKLENDİ (a) klasör paneli (proje listesi + seçili projenin klasörleri)
  await expect(page.getByRole("heading", { level: 1, name: "Hakedişler" })).toBeVisible();
  const panel = page.getByRole("navigation", { name: "Belge klasörleri" });
  await expect(panel.getByRole("link", { name: /Sözleşmeler/ }).first()).toBeVisible();
  // YÜKLENDİ (b) belge ızgarası — kart meta satırıyla birlikte basılı.
  await expect(
    page.getByRole("button", { name: /Hakediş_47_Güneşkent\.pdf/ }).first(),
  ).toContainText("1,2 MB · Bugün");
  // YÜKLENDİ (c) "Son Eklenenler" listesi (ızgaradan AYRI türev).
  await expect(
    page.getByRole("list", { name: "Son eklenen belgeler" }).getByRole("listitem"),
  ).not.toHaveCount(0);

  await page.getByTestId("e12-belge-ekle").click();
  const dialog = page.getByRole("dialog", { name: "Belge Ekle" });
  await expect(dialog).toBeVisible();
  // YÜKLENDİ (d) diyaloğun KENDİ proje listesi — seçenekler geldi. Sayı
  // İDDİA EDİLMEZ (native `<select>` kapalıyken seçenekleri kareye girmez);
  // bilinen projenin varlığı sorgunun bittiğini kanıtlar.
  await expect(dialog.getByTestId("adf-project").locator('option[value="p-1"]')).toHaveCount(1);
  // 🔴 Ekranda proje SEÇİLİ olduğu için diyalog o projeyle açılır (mockup 90)
  // ⇒ boş-id kapısı açılır ve İKİ SORGU DAHA uçar. İkisi de AYRI kaynaktır ve
  // ikisi de kadrajda görünür bir seçiciyi doldurur — biri gecikirse kare
  // boş seçiciyle donardı, o yüzden ayrı ayrı iddia edilir.
  await expect(dialog.getByTestId("adf-project")).toHaveValue("p-1");
  // YÜKLENDİ (e) projenin şantiyeleri (`GET /projects/p-1/sites`)
  await expect(
    dialog.getByTestId("adf-site").locator("option", { hasText: "A-Blok Şantiyesi" }),
  ).toHaveCount(1);
  // YÜKLENDİ (f) projenin klasörleri (`GET /document-folders`) — şantiye
  // GEÇİLMEZ, proje DÜZEYİ klasörler gelir (BC kapsam kuralı).
  await expect(
    dialog.getByTestId("adf-folder").locator("option", { hasText: "Hakedişler" }),
  ).toHaveCount(1);
  await expect(dialog.getByTestId("adf-document-name-reason")).toBeVisible();
  await expect(dialog.getByTestId("adf-error")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("belge-ekle-formu.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 5) PB · Personel Belgesi Ekle
// ---------------------------------------------------------------------------
test("personel belgesi formu diyalogu gorsel", async ({ page }) => {
  await login(page);
  await page.goto("/personel/per-1");

  // YÜKLENDİ (a) personel detayı + (b) alt başlığın proje adı (AYRI sorgu)
  const header = page.getByTestId("personnel-header-card");
  await expect(header.getByRole("heading", { level: 1, name: "Mehmet Kılıç" })).toBeVisible();
  await expect(header.getByText("Kule A")).toBeVisible();
  // YÜKLENDİ (c) personelin belgeleri — kart "Yükleniyor…" dalını geçti.
  const documentsCard = page.getByTestId("personnel-documents-card");
  await expect(documentsCard).toBeVisible();
  await expect(documentsCard.getByTestId("personnel-document-pdoc-1")).toBeVisible();

  await documentsCard.getByRole("button", { name: "+ Ekle" }).click();
  const dialog = page.getByRole("dialog", { name: "Personel Belgesi Ekle" });
  await expect(dialog).toBeVisible();
  // YÜKLENDİ (c') aynı listenin SAYACI diyaloğun bağlam bandında.
  await expect(dialog.getByTestId("pdf-document-count")).toHaveText("2 belge kayıtlı");
  // YÜKLENDİ (d) tip kataloğu (`GET /hr/documents/summary` → `by_type[]`) —
  // dört tip + yer tutucu + "Diğer…" = altı seçenek.
  await expect(dialog.getByTestId("pdf-type").locator("option")).toHaveCount(6);
  // Serbest etiket "Diğer…" seçilmeden KAPALIdır (mockup 142); devre-dışı
  // arşiv seçicisinin gerekçesi de ekranda okunur.
  await expect(dialog.getByTestId("pdf-free-label")).toBeDisabled();
  await expect(dialog.getByTestId("pdf-archive-pick-reason")).toBeVisible();
  await expect(dialog.getByTestId("pdf-types-error")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("personel-belgesi-formu.png", { fullPage: true });
});

// ---------------------------------------------------------------------------
// 6) DP · Yeni Depo Ekle
// ---------------------------------------------------------------------------
test("depo ekle formu diyalogu gorsel", async ({ page }) => {
  await login(page);
  await page.goto("/stok");
  await expect(page.getByRole("heading", { level: 1, name: "Stok & Depo" })).toBeVisible();

  // YÜKLENDİ (a) stok özeti — KPI şeridi GERÇEK sayıyı basıyor ve tablo doldu.
  await expect(page.getByTestId("stok-kpi-strip")).toContainText("8 Kalem");
  await expect(page.getByTestId("stok-row-SNK-0421")).toBeVisible();

  await page.getByRole("button", { name: "+ Depo Ekle" }).click();
  const dialog = page.getByRole("dialog", { name: "Yeni Depo Ekle" });
  await expect(dialog).toBeVisible();
  // YÜKLENDİ (b) ŞANTİYE FAN-OUT'u BİTTİ. Bu kaynak TEK sorgu değildir:
  // `GET /projects` + her proje için `GET /projects/{id}/sites` (kayar
  // pencere). Bitişi ekranda görünmez, o yüzden `hidden` işaret okunur —
  // yarım pencerede kare almak, seçeneği eksik bir seçiciyi baseline'a
  // yazmak demektir.
  await expect(dialog.getByTestId("whf-sites-loaded")).toHaveCount(1);
  // ...ve seçenekler GERÇEKTEN geldi: yer tutucu + iki şantiye.
  await expect(dialog.getByTestId("whf-site").locator("option")).toHaveCount(3);
  // Alt istek düşmedi (bant basılmaz) ve kırpılma iddiası yok.
  await expect(dialog.getByTestId("whf-site-fanout-error")).toHaveCount(0);
  await expect(dialog.getByTestId("whf-site-truncation")).toHaveCount(0);
  // Şantiye SEÇİLMEDİ ⇒ önizleme MERKEZ DEPO kipindedir: rozet ve alt
  // onay kutusunun gerekçesi kadrajda.
  await expect(dialog.getByTestId("whf-central-badge")).toBeVisible();
  await expect(dialog.getByTestId("whf-keep-flow-reason")).toBeVisible();
  await expect(dialog.getByTestId("whf-error")).toHaveCount(0);

  await prepareFrame(page);
  await expect(page).toHaveScreenshot("depo-ekle-formu.png", { fullPage: true });
});
