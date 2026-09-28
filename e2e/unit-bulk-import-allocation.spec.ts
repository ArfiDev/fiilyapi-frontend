import { test, expect, type Page } from "@playwright/test";

// F-UNIT2 T3 · TU (`/satis/toplu-uretim`) · EI (`/satis/excel-ice-aktar`) ·
// PG (`/satis/paylasim-girisi`) — FONKSİYONEL e2e.
//
// 🔴 BAŞLIK KURALI (ters yön): buradaki hiçbir testin adında "gorsel"
// GEÇMEZ — beşinci kapı `--grep-invert "gorsel"` ile süzer ve bu dosya
// FONKSİYONEL turda koşar. Kadrajlar `unit-bulk-import-allocation-visual.spec.ts`te.
//
// ⚠️ `getByRole("alert")` BU DEPODA YASAKTIR (F-P6 dersi: Next'in
// route-announcer'ı ikinci bir `alert` üretir ve seçici strict-mode ihlaline
// düşer) — iddialar GÖRÜNEN METİN üzerinden kurulur. Sabit `waitForTimeout` de
// yasaktır; beklemeler DURUM tabanlıdır.
//
// 🔒 FİKSTÜR İZOLASYONU — mock backend TÜM spec'lerde TEK paylaşılan süreçtir
// ve DURUM SIFIRLANMAZ:
//   · `p-1` (Kule A) BASELINE KAYNAĞIDIR. Buraya giden İKİ istek vardır ve
//     ikisi de YAZMAZ: `…/units/bulk/preview` (okuma ucu, denetim bile
//     üretmez) ve 409 ile reddedilen `…/units/bulk` (HEP-YA-HİÇ: tek satır
//     bile yazılmaz). İkinci iddia VARSAYILMAZ, uçtan ÖLÇÜLÜR: 409 turundan
//     sonra `p-1`in ünite sayısı yeniden okunur.
//   · `…/units/import*` uçları bu mock'ta DURUMU DEĞİŞTİRMEZ (`.xlsx`
//     ayrıştırılmıyor; sınanan sözleşme raporun ekrandaki yüzeyi), bu yüzden
//     EI akışları da `p-1`de güvenle koşar.
//   · GERÇEK YAZMALAR (`…/units/bulk` 201 · `POST …/blocks` ·
//     `PATCH …/units/allocation`) `p-2` (Villa B) üzerinde ve SERİ koşar.
//     `p-2`nin görsel kadrajı YOKTUR; `sales-form.spec.ts` `u-p2-1`i ADIYLA
//     seçer ve kendi yazmalarını `page.route` ile yakalar, bu dosya onun
//     ünitelerine DOKUNMAZ.

const BULK_URL = "/satis/toplu-uretim";
const IMPORT_URL = "/satis/excel-ice-aktar";
const ALLOCATION_URL = "/satis/paylasim-girisi";

/** Villa B — deponun yerleşik yazma projesi. */
const WRITE_PROJECT = "p-2";
/** `p-2`nin BOŞ üretim bloğu; toplu üretim buraya yazar (`TU-1…` numara uzayı). */
const WRITE_BLOCK = "blk-p2-tu";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/e-posta/i).fill("patron@fiil.com");
  await page.getByLabel(/^şifre$/i).fill("dogruparola");
  await page.getByRole("button", { name: /giriş yap/i }).click();
  await expect(page.getByRole("heading", { name: "Gösterge Paneli" })).toBeVisible();
}

/** `p-1`in ünite sayısını TELDEN okur — "hiçbir şey yazılmadı" iddiasının kanıtı. */
async function projectUnitCount(page: Page, projectId: string): Promise<number> {
  const response = await page.request.get(`/api/backend/projects/${projectId}/units`);
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { totals: { counts: { total: number } } };
  return body.totals.counts.total;
}

/** TU 70-72 + 79/84 — kat aralığı, kat başına daire, desen ve başlangıç numarası. */
async function fillBulkRules(
  page: Page,
  options: { startFloor: string; endFloor: string; unitsPerFloor: string; numbering: string },
) {
  await page.getByTestId("toplu-form-baslangic-kat").selectOption({ label: options.startFloor });
  await page.getByTestId("toplu-form-bitis-kat").selectOption({ label: options.endFloor });
  await page.getByTestId("toplu-form-kat-basina").fill(options.unitsPerFloor);
  await page.getByTestId("toplu-form-numaralandirma").selectOption(options.numbering);
  await page.getByTestId("toplu-form-baslangic-no").fill("1");
}

/** Kat şablonunun ilk `count` satırını doldurur (TU 108-134 değerleriyle). */
async function fillSlots(page: Page, count: number) {
  const sizes = [
    { layout: "3+1", gross: "148", net: "128", facing: "Güney", price: "1280000" },
    { layout: "2+1", gross: "112", net: "96", facing: "Doğu", price: "940000" },
    { layout: "3+1", gross: "148", net: "128", facing: "Batı", price: "1240000" },
  ];
  for (let index = 0; index < count; index += 1) {
    const slot = sizes[index % sizes.length];
    const sequence = index + 1;
    await page.getByTestId(`toplu-form-oda-tipi-${sequence}`).selectOption({ label: slot.layout });
    await page.getByTestId(`toplu-form-brut-${sequence}`).fill(slot.gross);
    await page.getByTestId(`toplu-form-net-${sequence}`).fill(slot.net);
    await page.getByTestId(`toplu-form-cephe-${sequence}`).selectOption({ label: slot.facing });
    await page.getByTestId(`toplu-form-liste-fiyat-${sequence}`).fill(slot.price);
  }
}

/** 12 başlıklı sahte `.xlsx` — istemci ön kontrolü ADA ve BOYUTA bakar. */
function xlsxFile(name = "uniteler.xlsx") {
  return {
    name,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("PK-fiil-unite-listesi", "utf8"),
  };
}

// ===========================================================================
// TU — toplu üretim
// ===========================================================================

test("toplu uretim onizlemesi cakisan satirlari isaretler ve HICBIR SEY yazmaz", async ({
  page,
}) => {
  await login(page);
  const before = await projectUnitCount(page, "p-1");

  await page.goto(`${BULK_URL}?proje=p-1&blok=blk-1`);
  await expect(page.getByTestId("toplu-form-blok")).toHaveValue("blk-1");

  await fillBulkRules(page, {
    startFloor: "1. Kat",
    endFloor: "8. Kat",
    unitsPerFloor: "3",
    // Şema varsayılanı: düz `{Sıra}` → "1", "2", … `blk-1`de "1"…"6" ZATEN
    // VARDIR, yani ilk altı satır çakışır. Çakışma HATA DEĞİLDİR (TU 177).
    numbering: "sequential",
  });
  await fillSlots(page, 3);
  await page.getByTestId("toplu-form-onizle").click();

  // Uç 200 döner ve tabloyu basar: çakışan satırlar UYARI yüzeyidir.
  await expect(page.getByTestId("toplu-form-onizleme-satir")).toHaveCount(24);
  await expect(page.getByTestId("toplu-form-onizleme-cakisma")).toContainText(
    "6 ünite numarası çakışıyor (1, 2, 3, 4, 5, 6).",
  );
  // Kaydetmenin NE YAPACAĞI da açıkça yazılır — 409 sürpriz olmasın diye.
  await expect(page.getByTestId("toplu-form-onizleme-cakisma")).toContainText("HEP-YA-HİÇ");
  // Toplam SUNUCUDAN gelir; istemci kendi toplamını basmaz.
  await expect(page.getByTestId("toplu-form-onizleme-ozet")).toContainText("₺27.680.000");
  // Çakışmayan satırlar rozetsizdir (hepsi çakıştı hâli DEĞİL).
  await expect(page.getByTestId("toplu-form-onizleme-satir").nth(6)).not.toContainText("Çakışma");

  // 🔴 KURAL DEĞİŞİNCE ÖNİZLEME ATILIR: ekranda BAŞKA bir kural gösterip
  // BAŞKA bir gövde göndermek sessiz hata sınıfıdır (sunucu önizlemeden gelen
  // satırları kabul etmez, aynı girdiden YENİDEN üretir).
  await page.getByTestId("toplu-form-artis-yuzde").fill("1.5");
  await expect(page.getByTestId("toplu-form-onizleme-bos")).toContainText(
    "Kurallar değişti — önizleme temizlendi.",
  );

  // TU 137-138 — kutucuk AÇIK + yüzde dolu ⇒ `floor_price_increase_pct`
  // gövdeye girer. Artış BİLEŞİKTİR ve sonuç EN YAKIN 100 ₺'ye yuvarlanır
  // (karar 6): 8 kat için toplam 27.680.000 → 29.177.500 ₺.
  await page.getByTestId("toplu-form-onizle").click();
  await expect(page.getByTestId("toplu-form-onizleme-ozet")).toContainText("₺29.177.500");

  // 🔴 ÖNİZLEME BİR OKUMA UCUDUR: iki turdan sonra da ünite sayısı DEĞİŞMEDİ.
  expect(await projectUnitCount(page, "p-1")).toBe(before);
});

test("toplu uretim 409'da HEP-YA-HIC anlamini basar ve tek satir bile yazmaz", async ({ page }) => {
  await login(page);
  const before = await projectUnitCount(page, "p-1");

  await page.goto(`${BULK_URL}?proje=p-1&blok=blk-1`);
  await expect(page.getByTestId("toplu-form-blok")).toHaveValue("blk-1");
  await fillBulkRules(page, {
    startFloor: "1. Kat",
    endFloor: "8. Kat",
    unitsPerFloor: "3",
    numbering: "sequential",
  });

  await page.getByTestId("toplu-form-olustur").click();

  // Sunucunun gövdesi YALNIZ hangi numaraların dolu olduğunu söyler…
  await expect(page.getByTestId("toplu-form-hata")).toContainText(
    "Üretilecek ünite numaralarından bazıları blokta zaten var",
  );
  // …🔴 "hiçbiri yazılmadı" cümlesi İSTEMCİDE tamamlanır. Bu cümle olmasaydı
  // kullanıcı KISMİ yazma sanır ve bloktaki ünite listesini yanlış okurdu.
  await expect(page.getByTestId("toplu-form-hata")).toContainText(
    "Hiçbir ünite yazılmadı (hep-ya-hiç)",
  );
  // Ekran listeye GİTMEZ: başarılı kayıt gibi gösterilmez.
  await expect(page).toHaveURL(/\/satis\/toplu-uretim/);

  // 🔴 İDDİA VARSAYILMAZ, ÖLÇÜLÜR: parti bütün hâlde reddedildi.
  expect(await projectUnitCount(page, "p-1")).toBe(before);
});

// ===========================================================================
// EI — Excel içe aktarma (bu uçlar mock'ta DURUM DEĞİŞTİRMEZ)
// ===========================================================================

test("excel: .csv ISTEMCIDE reddedilir ve sunucunun cumlesi basilir", async ({ page }) => {
  await login(page);
  await page.goto(`${IMPORT_URL}?proje=p-1`);
  const content = page.locator("main");
  await expect(page.getByTestId("excel-form-proje")).toHaveValue("p-1");

  // Mockup EI 76 `.xls`/`.csv` de çizer; sunucu YALNIZ `.xlsx` okur
  // (`ensure_xlsx`). Ön kontrol sunucunun KENDİ mesajını basar — iki metin
  // ayrışmasın diye cümle oradan kopyadır.
  await page.getByTestId("excel-form-dosya").setInputFiles({
    name: "uniteler.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Blok,Kat,Ünite No\n", "utf8"),
  });

  await expect(content.getByText("Yalnızca .xlsx dosyası yüklenebilir")).toBeVisible();
  // Reddedilen dosya için HİÇBİR istek kurulmaz → doğrulama kartı boş kalır.
  await expect(page.getByTestId("excel-form-dogrulama-bos")).toBeVisible();
  await expect(page.getByTestId("excel-form-dosya-ozet")).toHaveCount(0);
});

test("excel: .xlsx dogrulanir, aktarilir ve created/skipped ACIKCA basilir", async ({ page }) => {
  await login(page);
  await page.goto(`${IMPORT_URL}?proje=p-1`);
  await expect(page.getByTestId("excel-form-proje")).toHaveValue("p-1");

  // Dosya seçimi doğrulamayı KENDİLİĞİNDEN tetikler.
  await page.getByTestId("excel-form-dosya").setInputFiles(xlsxFile());
  await expect(page.getByTestId("excel-form-sayac-toplam")).toContainText("24");
  await expect(page.getByTestId("excel-form-satir")).toHaveCount(24);
  // Dosya künyesi okunan satır sayısını da gösterir (EI 69).
  await expect(page.getByTestId("excel-form-dosya-ozet")).toContainText("24 satır okundu");

  // EI 202'nin sayısı TÜREVDİR: 22 geçerli + 1 uyarılı (kutucuk işaretli) = 23.
  await expect(page.getByTestId("excel-form-aktar")).toHaveText("23 Geçerli Satırı Aktar");
  // Kutucuk kapatılınca sayı 22'ye düşer — mockup'ın "22"si YALNIZ o hâlde doğrudur.
  await page.getByTestId("excel-form-uyarili-dahil").uncheck();
  await expect(page.getByTestId("excel-form-aktar")).toHaveText("22 Geçerli Satırı Aktar");
  // Kutucuk `blocks_to_create`i BAYATLATIR (sayaçları değil) — söylenir.
  await expect(page.getByTestId("excel-form-yeni-bloklar-bayat")).toBeVisible();
  await page.getByTestId("excel-form-uyarili-dahil").check();

  // 🔴 AYNI `File` İKİNCİ KEZ yüklenir (sunucu dosyayı saklamaz).
  await page.getByTestId("excel-form-aktar").click();

  // 🔴 KISMİ AKTARIM SUNUCUNUN BİLİNÇLİ DAVRANIŞIDIR: `created`/`skipped`
  // AÇIKÇA basılır ve ekran listeye GİTMEZ (gezinmek üç sayıyı yok ederdi).
  await expect(page.getByTestId("excel-form-sonuc-olusan")).toContainText("23");
  await expect(page.getByTestId("excel-form-sonuc-atlanan")).toContainText("1");
  await expect(page.getByTestId("excel-form-sonuc-blok")).toContainText("1");
  await expect(page.getByTestId("excel-form-sonuc-mesaj")).toContainText("Kısmi aktarım");
  await expect(page).toHaveURL(/\/satis\/excel-ice-aktar/);
});

// ===========================================================================
// PG — paylaşım girişi (okuma)
// ===========================================================================

test("paylasim: kat karsiligi OLMAYAN proje ACIKLAYICI BOS HAL basar", async ({ page }) => {
  await login(page);
  await page.goto(`${ALLOCATION_URL}?proje=p-1`);

  // 🔴 404 bir HATA gibi değil, AÇIKLAYICI BOŞ HÂL gibi basılır: boş özet
  // "%0/%0 paylaşım" yazdırır ve kullanıcı veriyi kaybettiğini sanardı.
  await expect(page.getByTestId("paylasim-form-ozet-uyari")).toContainText(
    "Bu projede kat karşılığı sözleşmesi tanımlı değil",
  );
  // Oran/denge kutuları HİÇ çizilmez — uydurma sayı basılmaz.
  await expect(page.getByTestId("paylasim-form-oran-kutusu")).toHaveCount(0);
  await expect(page.getByTestId("paylasim-form-denge-kart")).toHaveCount(0);
  // Liste ucu AYNI 404'ü verir; mesaj TEKRARLANMAZ (hedef kartında zaten var).
  await expect(page.getByTestId("paylasim-form-liste-hata")).toHaveCount(0);
});

// ===========================================================================
// YAZMA AKIŞLARI — hepsi `p-2`de ve SERİ (paylaşılan durumu sırayla değiştirir)
// ===========================================================================

test.describe("F-UNIT2 yazma akışları (p-2)", () => {
  test.describe.configure({ mode: "serial" });

  test("toplu uretim: onizle → olustur → satis listesine doner ve uniteler yazilir", async ({
    page,
  }) => {
    await login(page);
    const before = await projectUnitCount(page, WRITE_PROJECT);

    await page.goto(`${BULK_URL}?proje=${WRITE_PROJECT}&blok=${WRITE_BLOCK}`);
    await expect(page.getByTestId("toplu-form-blok")).toHaveValue(WRITE_BLOCK);

    await fillBulkRules(page, {
      startFloor: "1. Kat",
      endFloor: "3. Kat",
      unitsPerFloor: "2",
      // `{Blok}-{Sıra}` → blok KODU `TU` ⇒ "TU-1"… `p-2`nin "V1/V2/V3"
      // numaralarıyla çakışamaz.
      numbering: "block_sequence",
    });
    await fillSlots(page, 2);

    await page.getByTestId("toplu-form-onizle").click();
    await expect(page.getByTestId("toplu-form-onizleme-satir")).toHaveCount(6);
    // BOŞ blokta çakışma YOKTUR — uyarı şeridi hiç basılmaz.
    await expect(page.getByTestId("toplu-form-onizleme-cakisma")).toHaveCount(0);
    await expect(page.getByTestId("toplu-form-onizleme-satir").first()).toContainText("TU-1");

    await page.getByTestId("toplu-form-olustur").click();

    // 🔴 Başarıda ekran SATIŞ LİSTESİNE döner (TU'nun EI'den farkı budur).
    await expect(page).toHaveURL(/\/satis$/);
    // Yazma TELDEN doğrulanır: altı ünite gerçekten eklendi.
    expect(await projectUnitCount(page, WRITE_PROJECT)).toBe(before + 6);
  });

  test("BE 109: blok kaydedilince toplu uretime YENI BLOK SECILI gidilir", async ({ page }) => {
    await login(page);
    await page.goto(`/satis/blok-ekle?proje=${WRITE_PROJECT}`);
    await expect(page.getByTestId("blok-form-proje")).toHaveValue(WRITE_PROJECT);

    // 🔴 ŞANTİYE SEÇİLMEZ ve bu BİLEREKtir: `p-2`nin `state.sites`te şantiyesi
    // YOKTUR. T3 buraya bir şantiye eklemişti; şantiye seçicileri KÜRESELdir
    // (proje bağımsız) ve `Yeni Depo Ekle` diyaloğunun seçenek sayısını
    // 3→4 yaparak `form-dialogs-visual.spec.ts:282`yi KIRMIZI etti. Şantiye
    // geri alındı; bu zincirin iddiası zaten şantiye DEĞİL, gezinmedir.
    // `site_id` gövdeye girmez — BE formunda alan boş kalır (KARAR 11: istemci
    // zorunlu alan diye kaydı ENGELLEMEZ).
    await page.getByTestId("blok-form-ad").fill("T3 Zincir Bloğu");
    await page.getByTestId("blok-form-kat").fill("4");
    await page.getByTestId("blok-form-kat-basina-daire").fill("2");

    // BE 109 — 🔴 GEZİNME BAYRAĞI. Kutucuk gövdeye HİÇBİR anahtar eklemez;
    // yalnız kaydetmeden sonraki hedefi değiştirir.
    await page.getByTestId("blok-form-toplu-uretim").check();
    await page.getByTestId("blok-form-kaydet").click();

    // Yeni bloğun kimliği KAYIT CEVABINDAN gelir ve URL'e yazılır.
    await expect(page).toHaveURL(
      new RegExp(`/satis/toplu-uretim\\?proje=${WRITE_PROJECT}&blok=blk-new-`),
    );
    // 🔴 ZİNCİRİN ASIL İDDİASI: blok seçicisi YENİ BLOĞA OTURDU. Yalnız
    // `?proje=` taşınsaydı kullanıcı boş seçicili bir ekrana düşerdi ve
    // kutucuk süsten ibaret kalırdı — seçili SEÇENEĞİN ADI ölçülür.
    await expect(page.getByTestId("toplu-form-blok")).toHaveValue(/^blk-new-/);
    await expect(page.getByTestId("toplu-form-blok").locator("option:checked")).toHaveText(
      "T3 Zincir Bloğu",
    );
    // Kat listesi de YENİ bloğun yapısından türedi (4 kat girildi).
    await expect(page.getByTestId("toplu-form-baslangic-kat").locator("option")).toContainText([
      "Zemin",
      "4. Kat",
    ]);
  });

  test("paylasim: satirlar atanir, kaydedilir ve tablo KAYITLI hali gosterir", async ({ page }) => {
    await login(page);
    await page.goto(`${ALLOCATION_URL}?proje=${WRITE_PROJECT}`);
    await expect(page.getByTestId("paylasim-form-sozlesme-no")).toHaveText("KKS-2026-777");

    // Varsayılan süzgeç "Atanmayan" (PG 112 mockup'ta AKTİF çizilir).
    await expect(page.getByTestId("paylasim-form-satir-PB-1")).toBeVisible();
    await expect(page.getByTestId("paylasim-form-satir-PB-2")).toBeVisible();

    // Kaydedilecek bir şey yokken düğme KAPALI ve sebebi görünür.
    await expect(page.getByTestId("paylasim-form-kaydet")).toBeDisabled();
    await expect(page.getByTestId("paylasim-form-degisiklik-yok")).toBeVisible();

    // PG 140/141 — satır başına ikili düğme.
    await page.getByTestId("paylasim-form-biz-PB-1").click();
    await page.getByTestId("paylasim-form-arsa-PB-2").click();
    // Hissedar sütunu YALNIZ arsa payı satırında açılır (PG 221).
    await page.getByTestId("paylasim-form-hissedar-PB-2").selectOption({ label: "Zeynep Arsa (%70)" });

    await expect(page.getByTestId("paylasim-form-kaydet")).toBeEnabled();
    await page.getByTestId("paylasim-form-kaydet").click();

    // 🔴 Yanıt GÜNCEL TAM LİSTEDİR: tablo ONDAN tazelenir, ikinci GET atılmaz.
    // Kaydetme başarılıysa bekleyen katman boşalır ve düğme yeniden kapanır.
    await expect(page.getByTestId("paylasim-form-degisiklik-yok")).toBeVisible();
    await expect(page.getByTestId("paylasim-form-kaydet")).toBeDisabled();
    await expect(page.getByTestId("paylasim-form-hata")).toHaveCount(0);
    // Satırlar SUNUCUDAKİ hâli gösterir.
    await expect(page.getByTestId("paylasim-form-biz-PB-1")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("paylasim-form-arsa-PB-2")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("paylasim-form-hissedar-PB-2")).toHaveValue("sh-v1");
    // Dokunulmayan satır DEĞİŞMEDİ (gövde yalnız değişen satırları taşır).
    await expect(page.getByTestId("paylasim-form-biz-PB-3")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    // Yazma TELDEN doğrulanır — ekranın kendi çizdiğine değil, sunucuya bakılır.
    const response = await page.request.get(
      `/api/backend/projects/${WRITE_PROJECT}/land-share/units?limit=50&offset=0`,
    );
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as {
      items: { unit_no: string; owner_side: string | null; shareholder_name: string | null }[];
    };
    const saved = new Map(body.items.map((row) => [row.unit_no, row]));
    expect(saved.get("PB-1")?.owner_side).toBe("contractor");
    expect(saved.get("PB-2")?.owner_side).toBe("landowner");
    expect(saved.get("PB-2")?.shareholder_name).toBe("Zeynep Arsa");
    expect(saved.get("PB-3")?.owner_side).toBe(null);
  });
});
