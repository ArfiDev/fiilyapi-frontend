// @vitest-environment node
//
// F-PT2 T1 · KANON BEKÇİSİ (WORKFLOW §4 "GÖRSEL SPEC KURALI" 2.+3. parça).
//
// KÖK OLAY: iki baseline turu arasında (31608574847 ↔ 31609771927)
// `puantaj-hucre-popover.png` 317px/şiddet ~218 farkla ÇİFT-MODLU çıktı
// ("FM rozet kenarlığı" var/yok). Kök neden: `timesheet-visual.spec.ts`teki
// `prepareFrame(page)` çağrısı `toHaveScreenshot`tan HEMEN önce DEĞİLDİ —
// arada bir geometri `evaluate()`si + iki `expect` vardı. Kanon
// (`e2e/visual-scroll.ts` → `prepareFrame`) kaydırmayı VE imleç konumunu
// yalnız KENDİSİNDEN SONRA hiçbir DOM etkileşimi olmadığında garanti eder —
// araya giren her `evaluate`/`expect` (hover durumunu değiştirebilir,
// layout'u yeniden ölçebilir) kareyi DETERMİNİSTİK OLMAKTAN çıkarır.
//
// Bu test `e2e/*.spec.ts` içindeki HER `toHaveScreenshot` çağrısının hemen
// öncesindeki ANLAMLI (boş/satır-yorumu olmayan) satırın `prepareFrame(page)`
// çağrısı olduğunu iddia eder — yalnız `prepareFrame` KULLANAN (yani kadraj
// hazırlığına tabi) dosyalar taranır. `text-inventory.test.ts` /
// `field-adoption.test.ts` deseninin metin-taramalı koruma testi emsali.
//
// e2e/ dizini `vitest.config.ts`te Vitest'ten HARİÇ TUTULUR (Playwright'a
// ait) — bu yüzden bekçi burada, `src/` altında yaşar ve dosyaları OKUR
// (koşturmaz).
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, it, expect } from "vitest";

const e2eDir = fileURLToPath(new URL("../../e2e", import.meta.url));

function isVisualSpecFile(fileName: string): boolean {
  return fileName.endsWith(".spec.ts") && !fileName.includes("-snapshots");
}

/**
 * Yalnız `prepareFrame`ı GERÇEKTEN kullanan dosyalar taranır.
 *
 * 🔴 KAYIT 382: `prepareFrame`i doğrudan `./visual-scroll`ten DEĞİL bir
 * barrel'dan (ör. `e2e/contracts-visual-helpers.ts` → `export { prepareFrame }
 * from "./visual-scroll"`) alan dosyalar eski literal kontrolden geçemiyordu.
 * Çağrının kendisi (`prepareFrame(page)`) tek başına yeterli koşuldur — import
 * kaynağından bağımsızdır.
 */
function usesPrepareFrame(content: string): boolean {
  return content.includes("prepareFrame(page)");
}

// SEKME-F1.7c: preserveScrollLeft yalnız şerit iç kaydırmasını korur, CEO K5 / (d).
//
// DAR GENİŞLETME: tam metin eşleşmesi yerine SIKI bir desen — yalnız İKİ biçim
// kabul edilir: çıplak `prepareFrame(page);` VEYA `preserveScrollLeft` ile
// `prepareFrame(page, { preserveScrollLeft: [...] });`. Başka seçenek adı,
// serbest argüman veya ekstra boşluk/biçim KABUL EDİLMEZ — bekçi `prepareFrame`e
// keyfi bir şey geçirilmesini de yakalamaya devam eder. Kanonun kendisi
// ("hemen önce" kuralı) DEĞİŞMEDİ, yalnız TANINAN çağrı biçimi genişledi.
const PREPARE_FRAME_CALL_RE =
  /^await prepareFrame\(page(?:, \{ preserveScrollLeft: \[[^\]]*\] \})?\);$/;
const SCREENSHOT_CALL_RE = /^await expect\(.+\)\.toHaveScreenshot\(/;

interface Violation {
  file: string;
  line: number;
  precedingLine: string;
}

/**
 * Her `toHaveScreenshot` çağrısı için: geriye doğru boş/satır-yorumu
 * satırları ATLAYARAK ilk ANLAMLI satırı bulur, `prepareFrame(page)` çağrısı
 * DEĞİLSE ihlal olarak kaydeder.
 */
function findViolations(file: string, content: string): Violation[] {
  const lines = content.split("\n");
  const violations: Violation[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!SCREENSHOT_CALL_RE.test(lines[i].trim())) continue;

    let j = i - 1;
    while (j >= 0) {
      const trimmed = lines[j].trim();
      if (trimmed === "" || trimmed.startsWith("//")) {
        j -= 1;
        continue;
      }
      break;
    }

    const precedingLine = j >= 0 ? lines[j].trim() : "";
    if (!PREPARE_FRAME_CALL_RE.test(precedingLine)) {
      violations.push({ file, line: i + 1, precedingLine });
    }
  }

  return violations;
}

describe("gorsel kadraj kanonu — prepareFrame HER zaman toHaveScreenshot'tan hemen once", () => {
  const specFiles = readdirSync(e2eDir).filter(isVisualSpecFile);

  it("taranacak en az bir gorsel spec dosyasi bulunur (kapsam bos KALMAZ)", () => {
    expect(specFiles.length).toBeGreaterThan(0);
  });

  it("prepareFrame kullanan HER spec dosyasinda arada iddia/evaluate YOKTUR", () => {
    const allViolations: Violation[] = [];

    for (const fileName of specFiles) {
      const fullPath = path.join(e2eDir, fileName);
      const content = readFileSync(fullPath, "utf8");
      if (!usesPrepareFrame(content)) continue;
      allViolations.push(...findViolations(fileName, content));
    }

    const message = allViolations
      .map(
        (v) =>
          `${v.file}:${v.line} — prepareFrame'den hemen once "${v.precedingLine}" var, ` +
          `bu evaluate/expect kadrajın hover/kaydirma durumunu DEGISTIREBILIR`,
      )
      .join("\n");

    expect(allViolations, message).toEqual([]);
  });
});

// SEKME-F1.7c: preserveScrollLeft yalnız şerit iç kaydırmasını korur, CEO K5 / (d).
//
// `preserveScrollLeft` bir KAÇIŞ KAPISI — kaçış kapıları GEREKÇESİZ çoğalırsa
// kanon sessizce erir (bkz. `escape-hatch-inventory-guard.test.ts` emsali).
// Bu yüzden her kullanım GEREKÇELİ bir izin listesi girdisiyle EŞLEŞMEK
// ZORUNDADIR: listede olmayan dosyada kullanım KIRMIZI, listede olup artık
// KULLANMAYAN dosya da KIRMIZI (bayat/unutulmuş giriş — "sessiz muafiyet yok"
// ilkesi, bkz. dosyanın ilerisindeki "muafiyet gerekcesiz yazilmaz" deseni).
const PRESERVE_SCROLL_LEFT_ALLOWLIST: Record<string, string> = {
  "workspace-tabs-visual.spec.ts":
    "fullPage şerit scrollLeft'ini sıfırlıyor; kaydırılmış kare için şerit korunur (CEO K5/(d))",
  "visual-scroll.spec.ts":
    "prepareFrame'in preserveScrollLeft davranışını doğrudan sınayan birim testi — hiçbir toHaveScreenshot çağrısı YOK, kare bekçisi kapsamı dışında",
};

const PRESERVE_SCROLL_LEFT_RE = /preserveScrollLeft\s*:/;

function usesPreserveScrollLeft(content: string): boolean {
  return PRESERVE_SCROLL_LEFT_RE.test(content);
}

describe("preserveScrollLeft kaçış kapısı — yalnız gerekçeli izin listesindeki dosyalarda", () => {
  const specFiles = readdirSync(e2eDir).filter(isVisualSpecFile);

  it("izin listesinde OLMAYAN bir dosya preserveScrollLeft kullanmaz", () => {
    const unlisted: string[] = [];

    for (const fileName of specFiles) {
      const content = readFileSync(path.join(e2eDir, fileName), "utf8");
      if (usesPreserveScrollLeft(content) && !(fileName in PRESERVE_SCROLL_LEFT_ALLOWLIST)) {
        unlisted.push(fileName);
      }
    }

    const message = unlisted
      .map((f) => `${f} — preserveScrollLeft KULLANIYOR ama izin listesinde YOK (gerekçesiz)`)
      .join("\n");

    expect(unlisted, message).toEqual([]);
  });

  it("izin listesindeki HER giriş hâlâ preserveScrollLeft kullanıyor (bayat giriş yok)", () => {
    const stale: string[] = [];

    for (const fileName of Object.keys(PRESERVE_SCROLL_LEFT_ALLOWLIST)) {
      const fullPath = path.join(e2eDir, fileName);
      const content = existsSync(fullPath) ? readFileSync(fullPath, "utf8") : "";
      if (!usesPreserveScrollLeft(content)) stale.push(fileName);
    }

    const message = stale
      .map((f) => `${f} — izin listesinde ama artık preserveScrollLeft KULLANMIYOR (bayat giris)`)
      .join("\n");

    expect(stale, message).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// F-ZAMAN T3 · SAAT BEKÇİSİ — görsel kapının TAKVİM BAĞIMLILIĞI
// ═══════════════════════════════════════════════════════════════════════════
//
// KÖK OLAY (ölçüldü, 2026-09): `new Date()` ile dolan bir alan basan ve saati
// DONDURMAYAN bir kare, **ay/yıl döndüğü gün kod değişmeden** kırmızıya düşer
// ve kimse fark etmez — çünkü yeşil geçen son tur bir önceki aydandır. İki
// hakediş formu karesi 1 Eylül'de tam böyle düştü; `main`'in son yeşil turu
// 31 Ağustos'tu. Bu bir kare tamiri değil, GÖRSEL KAPININ KENDİSİNİN
// bekçisizliğidir: kapı güvenilmez olduğunda her dilim onu görmezden gelir.
//
// ── KURAL: İKİ HÂL VAR, ÜÇÜNCÜSÜ YOK ─────────────────────────────────────
// Kadraj alan her test ya GEÇERLİ bir saat dondurması taşır, ya da
// `KASTEN_DISARIDA` listesinde ADIYLA ve ÖLÇÜLMÜŞ GEREKÇESİYLE yer alır.
// SESSİZ MUAFİYET YOK (`exposure.py::KASTEN_DISARIDA` deseni).
//
// 🔴 "URL'YE DÖNEM ÇAKMA" ARTIK BAŞLI BAŞINA SAVUNMA SAYILMAZ (F-ZAMAN 2.
// tur, yönetim ölçümü Y1). Önceki sürüm `?year=&month=` / `?week=` /
// `?iso_year=&iso_week=` taşıyan kadrajı KOŞULSUZ muaf sayıyordu ve bu
// YANLIŞTI: URL çakması yalnız BASILAN DÖNEMİ sabitler, ekranın bugüne göre
// türettiği BAŞKA yüzeyleri örtmez. Karşı örnek ölçüldü —
// `GeneralTimesheetView.tsx:78` / `SiteTimesheetView.tsx:124`
// `isCurrentWeek={isSameWeek(week, currentIsoWeek())}`; `iso-week.ts:84`
// `currentIsoWeek()` ARGÜMANSIZ, URL'den bağımsız koşar ve
// `TimesheetWeekNav.tsx:63` `disabled={isCurrent}` ile "Bu Hafta" düğmesinin
// GÖRSEL DURUMUNU belirler — `fullPage` kadrajın tam ortasında. Aynı sınıf
// `equipment-rental`da da ölçüldü: `?period_year=&period_month=` taşıyan
// liste kadrajı, yıl seçicisinin `new Date().getFullYear()`den türeyen
// seçenek listesi yüzünden MARUZDU (ileri damgayla 182 piksel oynadı).
// Dönem çakması hâlâ değerlidir ve muafiyet gerekçesi OLABİLİR — ama
// gerekçe, ekranda başka bugün-türevi yüzey olmadığının ÖLÇÜLDÜĞÜNÜ
// söylemek zorundadır.
//
// ── NEDEN AST, NEDEN `grep` DEĞİL (ölçülmüş tuzak) ───────────────────────
// `setFixedTime|page.clock` ve `new Date()` desenleri bu depoda YORUM
// SATIRLARINA isabet eder ve o yorumlar çoğu zaman TERSİNİ söyler
// (`mock-backend.ts`teki dört isabetin dördü de yorumdur: *"`page.clock` bunu
// ETKİLEMEZ"*, *"`page.clock` gerekmez"*). Ham metin taraması bu turda FİİLEN
// ısırdı: "dondurmayan spec" ilk ölçümde 25 sanıldı, AST ile 46 çıktı.
// Yorumlar AST'de DÜĞÜM DEĞİLDİR → ayıklama yöntemin kendisinden gelir.
// Dondurma çoğu zaman spec'te değil `*-helpers.ts`tedir; çağrı grafiği
// ÖZYİNELEMELİ izlenir.
//
// ── BEKÇİNİN ÖLÇÜLMÜŞ SINIRLARI (kapatılmayanlar burada YAZILI) ──────────
// S1 · Bekçi `src/` ürün kodunu OKUMAZ; muafiyet gerekçeleri DONMUŞ METİNDİR.
//      Bir ekrana sonradan `new Date()` eklenmesi bu testi kırmaz. Bu yüzden
//      AŞAĞIDA İKİNCİ BİR BEKÇİ var: ürün kodundaki tarih yerlerinin dosya
//      bazında SAYIMI kayıtlıdır; sayım değişirse matris yeniden ölçülür.
//      (Kapanmayan artık: aynı dosyada bir tarih yeri silinip başka bir yere
//      eklenirse sayım değişmez.)
// S2 · Dondurmanın SIRASI yalnız `goto` çağrılarına göre denetlenir; bir
//      yardımcının İÇİNDE yaptığı gezinme görülmez.
// S3 · Argüman denetimi yalnız APIKAPALI sahte damgaları (`new Date()`,
//      `Date.now()`) eler; sabit bir değişkenin GERÇEKTEN sabit olduğunu
//      doğrulamaz.
import ts from "typescript";

/** Playwright'ın saati donduran API'leri (`fastForward`/`runFor` dondurmaz). */
const CLOCK_FREEZE_RE = /(^|\.)clock\.(setFixedTime|install|setSystemTime|pauseAt)$/;

/** Sahte damga: donduruyor gibi görünüp MAKİNE SAATİNİ yazan argümanlar. */
const FAKE_STAMP_RE = /^\s*(new\s+Date\s*\(\s*\)|Date\.now\s*\(\s*\))\s*$/;

/** Çağrı grafiği izlenirken sonsuz döngüyü kesen tavan. */
const CALL_DEPTH_LIMIT = 8;

/** Muafiyet kaydı — dosya anahtarları KAÇ kadrajı örttüğünü de söyler. */
interface Muafiyet {
  /** Bu anahtarın örttüğü SAVUNMASIZ kadraj sayısı (dosya anahtarları için). */
  kadraj: number;
  gerekce: string;
}

const ROUTE_GRAPH_CLEAN =
  "olculdu (F-ZAMAN, AST rota grafigi): bu spec'in kadraj aldigi ekranlarin " +
  "bilesen grafiginde URUN KODUNDA `new Date()`/`Date.now()` YOK — basilan her " +
  "tarih fikstur/echo alani, yani gun SUNUCUDAN gelir";

const KASTEN_DISARIDA: Record<string, Muafiyet> = {
  "boq-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "bordro-visual.spec.ts": { kadraj: 6, gerekce: ROUTE_GRAPH_CLEAN },
  "contract-distribution-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "contracts-visual.spec.ts": { kadraj: 2, gerekce: ROUTE_GRAPH_CLEAN },
  "dashboard.visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "equipment-detail-visual.spec.ts": { kadraj: 2, gerekce: "OZEL: `/makine/eq-1` + `/makine/eq-3` (yani `makine/[id]`) bilesen grafigi AST ile tarandi, tarih yeri YOK. Uyari: bu spec `equipment-helpers.ts`i ithal eder ve o dosya `EQUIPMENT_PERIOD_QUERY` tasir, ama BU spec o URL'lere hic gitmez" },
  "equipment-visual.spec.ts": { kadraj: 4, gerekce: "OLCULDU (ileri damga kadraj mutasyonu): damga 2031-06-15 yapildiginda dort karenin dordu de BAYT AYNI. `/makine/calisma` ve `/makine/yakit` donemi URL'den okur (`EQUIPMENT_PERIOD_QUERY = year=2026&month=8`); `timesheet/month.ts:27 currentPeriod()` yalniz parametre gecersizken devreye girer. Liste ve form kadrajlarinin rota grafiginde tarih yeri YOK" },
  "financial-instruments-visual.spec.ts": { kadraj: 3, gerekce: ROUTE_GRAPH_CLEAN },
  "hr-documents-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "login-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "onay-kutusu-visual.spec.ts": { kadraj: 4, gerekce: ROUTE_GRAPH_CLEAN },
  "onay-rolleri-visual.spec.ts": { kadraj: 2, gerekce: ROUTE_GRAPH_CLEAN },
  "personnel-detail-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "personnel-form-visual.spec.ts": { kadraj: 1, gerekce: "OZEL: kadraj `/personel/yeni` ekranidir, grafigi TEMIZ. Dosyadaki puantaj URL'i (`?year=&month=`) yalnizca `encodeURIComponent`li bir `donus` DEGERIDIR, gidilen ekran degil" },
  "personnel-list-visual.spec.ts": { kadraj: 2, gerekce: ROUTE_GRAPH_CLEAN },
  "progress-payment-detail-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "progress-payments-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "project-detail-visual.spec.ts": { kadraj: 1, gerekce: "OZEL: kadraj `/projeler/p-1` ekranidir, grafigi TEMIZ. Dosyadaki `/sozlesmeler/isveren/...`, `/hakedisler/taseron?...`, `/belgeler?proje=...` yollari BAGLANTI HEDEFI iddialaridir, gidilen ekran degil" },
  "project-form-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "project-summary-visual.spec.ts": { kadraj: 3, gerekce: ROUTE_GRAPH_CLEAN },
  "projects-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "purchasing-requests-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "quote-comparison-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "sales-form-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "sales-list-empty-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "sales-list-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "section-form-visual.spec.ts": { kadraj: 2, gerekce: ROUTE_GRAPH_CLEAN },
  "settings-visual.spec.ts": { kadraj: 9, gerekce: "OZEL: iki tarih yeri ULASILABILIR ama HICBIRI kadraja BASILMAZ. (a) `src/lib/settings/audit-query.ts` yalnizca ISTEK parametresi (`date_from`) uretir; ikiz onu YOK SAYAR ve satirlar sabittir, ekrandaki saat `occurred_at` fikstur alanindan gelir (`audit-format.ts`, kendi `new Date()`i yok). (b) `RolesScreen.tsx:89` `Date.now()` yalniz 'Kopyala' tiklamasinda kosar, bu dokuz kadrajda tiklanmaz" },
  "shell-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "site-detail-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "site-form-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "site-planning-visual.spec.ts": { kadraj: 4, gerekce: "OLCULDU (ileri damga kadraj mutasyonu): damga 2031-06-15 yapildiginda dort karenin dordu de BAYT AYNI. URL `?week=` ile SABIT ve GECMIS bir haftayi pinler; `site-planning/week.ts:61 currentWeekStart()` yalniz parametre gecersizken devreye girer. KIRILGAN: pin kaldirilirsa ekran ICINDE BULUNULAN haftaya duser" },
  "site-progress-payments-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "site-stock-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "stock-catalog-visual.spec.ts": { kadraj: 2, gerekce: ROUTE_GRAPH_CLEAN },
  "subcontractor-contract-detail-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "subcontractor-contract-form-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "subcontractor-progress-payment-detail-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "subcontractor-progress-payments-visual.spec.ts": { kadraj: 1, gerekce: "OLCULDU: donem suzgecinin SECENEK listesi `recentPeriods(new Date(), 12)` ile dolar ve `.thk-filters .select { width: auto }` oldugu icin `<select>` genisligi en genis SECENEGE baglidir — ama o secenek her pencerede SABIT olan \"Tum Donemler\"dir (12 ardisik ay = on iki ay adinin TAMAMI, hangi gunden baslarsa baslasin). Tarayicida olculdu: genislik 2026-08-15'te de 2044-03-15'te de 136px; damga 2027-09-15 yapildiginda kare oynamadi. KIRILGAN: \"Tum Donemler\" kisalirsa ya da `formatPeriod` uzarsa genislik seceneklere baglanir" },
  "suppliers-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "timesheet-visual.spec.ts": { kadraj: 3, gerekce: "OLCULDU (ileri damga kadraj mutasyonu): damga 2031-06-15 yapildiginda uc karenin ucu de BAYT AYNI. Mekanizma VAR ve dogrulandi — damga pinlenen haftanin ICINE (2026-08-05, 2026-W32) alindiginda `puantaj-genel` ve `puantaj-santiye` OYNUYOR (`iso-week.ts:84` `currentIsoWeek()` argumansiz kosar, `TimesheetWeekNav.tsx:63` `disabled={isCurrent}` ile \"Bu Hafta\" dugmesinin gorsel durumunu belirler). Muaf olmasinin sebebi mekanizmanin yoklugu DEGIL, URL'nin `iso_year=2026&iso_week=32` ile GECMIS ve SABIT bir haftayi pinlemesi: gercek saat oraya bir daha giremez. KIRILGAN: URL'den `iso_year` kaldirilir ya da pin bugune yaklastirilirsa kadraj MARUZ hale gelir" },
  "treasury-visual.spec.ts": { kadraj: 1, gerekce: ROUTE_GRAPH_CLEAN },
  "unit-bulk-import-allocation-visual.spec.ts": { kadraj: 6, gerekce: ROUTE_GRAPH_CLEAN },
  "unit-forms-visual.spec.ts": { kadraj: 3, gerekce: ROUTE_GRAPH_CLEAN },
  "visual.spec.ts": { kadraj: 8, gerekce: "OZEL: sekiz kadraj `/design-system` sayfasinin ELEMAN kareleridir; o rotanin bilesen grafigi AST ile tarandi, tarih yeri YOK. (Bu sekiz kare F-ZAMAN 1. turunda bekciye GORUNMUYORDU — testler `for (const id of sections)` dongusunde uretiliyor; B1 duzeltmesinden sonra gorunur)" },

  // `form-dialogs-visual.spec.ts` TEST duzeyinde listelenir: bes kadrajin
  // gerekcesi AYNI DEGIL, biri (ISV) olculmus bir ORTULME uzerine kurulu.
  "form-dialogs-visual.spec.ts :: poz ekle isveren diyalogu gorsel": { kadraj: 1, gerekce: "OLCULDU: alttaki ekranin \"Bitis Tarihi\" metriginin RENGI bugunden turer (`EmployerContractDetailView.tsx:74` -> `contract-end-tone.ts`) ve DOM'da FIILEN degisir (2026-08-15 `rgb(30,41,59)` -> 2027-01-15 `rgb(239,68,68)`), AMA KAREYE GIRMEZ: diyalog acikken metrik hucresinin merkezinde `elementFromPoint` diyalog panelini (`pif-card`) dondurur — panel metrigi ORTER. Kadraj iki damgayla uretildi, `.png`ler BAYT AYNI cikti; dondurma eklemek OLU koruma olurdu. KIRILGAN: panel kucululur/kayarsa kadraj MARUZ hale gelir" },
  "form-dialogs-visual.spec.ts :: poz ekle taseron diyalogu gorsel": { kadraj: 1, gerekce: "`/sozlesmeler/taseron/sc-1` rota grafigi AST ile tarandi, tarih yeri YOK" },
  "form-dialogs-visual.spec.ts :: ekipman belgesi formu diyalogu gorsel": { kadraj: 1, gerekce: "`/makine` rota grafigi AST ile tarandi, tarih yeri YOK" },
  "form-dialogs-visual.spec.ts :: personel belgesi formu diyalogu gorsel": { kadraj: 1, gerekce: "`/personel/per-1` rota grafigi AST ile tarandi, tarih yeri YOK" },
  "form-dialogs-visual.spec.ts :: depo ekle formu diyalogu gorsel": { kadraj: 1, gerekce: "`/stok` rota grafigi AST ile tarandi, tarih yeri YOK" },
};

interface SpecTest {
  title: string;
  node: ts.Node;
  start: number;
  end: number;
  hookFreeze: string | null;
  /**
   * Bir `test(...)` BİLDİRİMİ kaç kadraj üretir. `for (const id of sections)`
   * döngüsündeki tek bildirim `sections.length` kadar kare basar
   * (`e2e/visual.spec.ts` = 8). Çarpan çözülemezse 1 kabul edilir ve kadraj
   * sayımı iddiası bunu ZATEN yakalar.
   */
  carpan: number;
}

const sourceCache = new Map<string, ts.SourceFile>();
function sourceOf(file: string): ts.SourceFile {
  const cached = sourceCache.get(file);
  if (cached) return cached;
  const parsed = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  sourceCache.set(file, parsed);
  return parsed;
}

function resolveLocal(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** İthal edilen ad → tanımlandığı yerel dosya. */
function importedFrom(file: string): Map<string, string> {
  const map = new Map<string, string>();
  ts.forEachChild(sourceOf(file), (node) => {
    if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return;
    const target = resolveLocal(file, node.moduleSpecifier.text);
    if (target === null || !node.importClause) return;
    const bindings = node.importClause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) map.set(element.name.text, target);
    }
    if (node.importClause.name) map.set(node.importClause.name.text, target);
  });
  return map;
}

/** Üst düzey fonksiyon adı → gövdesi (`function f()` ve `const f = () => {}`). */
function topLevelFunctions(file: string): Map<string, ts.Node> {
  const map = new Map<string, ts.Node>();
  ts.forEachChild(sourceOf(file), (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) map.set(node.name.text, node);
    if (!ts.isVariableStatement(node)) return;
    for (const decl of node.declarationList.declarations) {
      const init = decl.initializer;
      if (!ts.isIdentifier(decl.name) || !init) continue;
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) map.set(decl.name.text, init);
    }
  });
  return map;
}

/** Üst düzey `const X = [...]` dizilerinin ELEMAN SAYISI (döngü çarpanı). */
function topLevelArrayLengths(file: string): Map<string, number> {
  const map = new Map<string, number>();
  ts.forEachChild(sourceOf(file), (node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const decl of node.declarationList.declarations) {
      const init = decl.initializer;
      if (!ts.isIdentifier(decl.name) || !init) continue;
      if (ts.isArrayLiteralExpression(init)) map.set(decl.name.text, init.elements.length);
      if (ts.isAsExpression(init) && ts.isArrayLiteralExpression(init.expression)) {
        map.set(decl.name.text, init.expression.elements.length);
      }
    }
  });
  return map;
}

interface FreezeHit {
  /** `dosya:satır` — dondurmanın GERÇEKTE yaşadığı yer. */
  site: string;
  /** Argüman sahte damga DEĞİL mi (S3). */
  argOk: boolean;
  /** Argümanın kaynak metni (hata mesajı için). */
  arg: string;
}

/** `node` içinde DOĞRUDAN duran saat dondurma çağrısı (özyineleme yok). */
function directFreeze(node: ts.Node, file: string): FreezeHit | null {
  const source = sourceOf(file);
  let hit: FreezeHit | null = null;
  function walk(current: ts.Node) {
    if (hit !== null) return;
    if (ts.isCallExpression(current) && CLOCK_FREEZE_RE.test(current.expression.getText(source))) {
      const arg = current.arguments.map((a) => a.getText(source)).join(", ");
      hit = {
        site: `${path.basename(file)}:${source.getLineAndCharacterOfPosition(current.getStart(source)).line + 1}`,
        argOk: arg.trim() !== "" && !FAKE_STAMP_RE.test(arg),
        arg: arg || "(argumansiz)",
      };
      return;
    }
    ts.forEachChild(current, walk);
  }
  walk(node);
  return hit;
}

/** Çağrılan yerel/ithal fonksiyonun içinde dondurma var mı (ÖZYİNELEMELİ). */
function freezeViaCall(name: string, file: string, depth: number, seen: Set<string>): FreezeHit | null {
  if (depth > CALL_DEPTH_LIMIT) return null;
  const key = `${file}#${name}`;
  if (seen.has(key)) return null;
  seen.add(key);

  const localBody = topLevelFunctions(file).get(name);
  if (localBody) {
    const direct = directFreeze(localBody, file);
    if (direct) return direct;
    return freezeInside(localBody, file, depth + 1, seen);
  }
  const target = importedFrom(file).get(name);
  if (!target) return null;
  const importedBody = topLevelFunctions(target).get(name);
  if (!importedBody) return null;
  const direct = directFreeze(importedBody, target);
  if (direct) return direct;
  return freezeInside(importedBody, target, depth + 1, seen);
}

function freezeInside(node: ts.Node, file: string, depth: number, seen: Set<string>): FreezeHit | null {
  let hit: FreezeHit | null = null;
  function walk(current: ts.Node) {
    if (hit !== null) return;
    if (ts.isCallExpression(current) && ts.isIdentifier(current.expression)) {
      const found = freezeViaCall(current.expression.text, file, depth, seen);
      if (found) {
        hit = found;
        return;
      }
    }
    ts.forEachChild(current, walk);
  }
  walk(node);
  return hit;
}

interface Defense {
  hit: FreezeHit;
  /** Dondurmayı KURAN ifadenin test gövdesindeki konumu (SIRA denetimi, S2). */
  pos: number;
}

/** Test gövdesindeki EN ERKEN geçerli dondurma kurulumu. */
function freezeSetupIn(body: ts.Node, file: string): Defense | null {
  const source = sourceOf(file);
  const candidates: Defense[] = [];
  function walk(current: ts.Node) {
    if (ts.isCallExpression(current)) {
      const callee = current.expression.getText(source);
      if (CLOCK_FREEZE_RE.test(callee)) {
        const direct = directFreeze(current, file);
        if (direct) candidates.push({ hit: direct, pos: current.getStart(source) });
      } else if (ts.isIdentifier(current.expression)) {
        const viaCall = freezeViaCall(current.expression.text, file, 0, new Set());
        if (viaCall) candidates.push({ hit: viaCall, pos: current.getStart(source) });
      }
    }
    ts.forEachChild(current, walk);
  }
  walk(body);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.pos <= b.pos ? a : b));
}

/** Test gövdesindeki SON `goto` çağrısının konumu (yoksa -1). */
function lastGotoPos(body: ts.Node, file: string): number {
  const source = sourceOf(file);
  let last = -1;
  function walk(current: ts.Node) {
    if (ts.isCallExpression(current) && /\.goto$/.test(current.expression.getText(source))) {
      last = Math.max(last, current.getStart(source));
    }
    ts.forEachChild(current, walk);
  }
  walk(body);
  return last;
}

function countScreenshotsIn(node: ts.Node, file: string): number {
  const source = sourceOf(file);
  let count = 0;
  function walk(current: ts.Node) {
    if (ts.isCallExpression(current) && /\.toHaveScreenshot$/.test(current.expression.getText(source))) {
      count += 1;
    }
    ts.forEachChild(current, walk);
  }
  walk(node);
  return count;
}

const TEST_CALL_RE = /^test(\.(only|skip|fixme|fail|slow))?$/;

/**
 * Dosyadaki KADRAJ ALAN testler.
 *
 * 🔴 GEZİNME DÜĞÜM TABANLIDIR, "üst düzey ifade" tabanlı DEĞİL (F-ZAMAN 2.
 * tur, yönetim ölçümü B1): `e2e/visual.spec.ts` sekiz kadrajını
 * `for (const id of sections) { test(...) }` DÖNGÜSÜNDE üretir. Önceki sürüm
 * yalnız `ExpressionStatement` çocuklarını geziyordu → o sekiz kare bekçiye
 * YAPISAL OLARAK GÖRÜNMÜYORDU ve "sessiz muafiyet yok" iddiası YANLIŞTI.
 * Şimdi tüm AST gezilir; bir `test(...)` bulununca gövdesine test aramak
 * için İNİLMEZ (iç içe `test` yasak zaten).
 */
function screenshotTestsOf(file: string): SpecTest[] {
  const source = sourceOf(file);
  const tests: SpecTest[] = [];
  const hooks: { freeze: string; from: number; to: number }[] = [];

  // 1) Tüm `test.beforeEach`ler + kapsadıkları aralık (en yakın describe gövdesi).
  function collectHooks(node: ts.Node, scope: { from: number; to: number }) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(source);
      if (callee === "test.beforeEach" && node.arguments.length) {
        const setup = freezeSetupIn(node.arguments[node.arguments.length - 1], file);
        if (setup && setup.hit.argOk) hooks.push({ freeze: setup.hit.site, ...scope });
      }
      if (/^test\.describe(\.\w+)?$/.test(callee) && node.arguments.length >= 2) {
        const body = node.arguments[node.arguments.length - 1];
        const inner = { from: body.getStart(source), to: body.getEnd() };
        ts.forEachChild(body, (child) => collectHooks(child, inner));
        return;
      }
    }
    ts.forEachChild(node, (child) => collectHooks(child, scope));
  }
  collectHooks(source, { from: 0, to: source.getEnd() });

  // 2) Tüm `test(...)` çağrıları — DÖNGÜ/BLOK içindekiler DÂHİL.
  const arrayLengths = topLevelArrayLengths(file);
  function collectTests(node: ts.Node, carpan: number) {
    if (ts.isForOfStatement(node)) {
      const iterated = node.expression;
      let n = 1;
      if (ts.isIdentifier(iterated)) n = arrayLengths.get(iterated.text) ?? 1;
      else if (ts.isArrayLiteralExpression(iterated)) n = iterated.elements.length;
      ts.forEachChild(node, (child) => collectTests(child, carpan * n));
      return;
    }
    if (ts.isCallExpression(node) && TEST_CALL_RE.test(node.expression.getText(source)) && node.arguments.length >= 2) {
      const body = node.arguments[node.arguments.length - 1];
      if (countScreenshotsIn(body, file) > 0) {
        const start = node.getStart(source);
        const covering = hooks.filter((h) => h.from <= start && start <= h.to);
        tests.push({
          title: node.arguments[0].getText(source).replace(/^[`'"]|[`'"]$/g, ""),
          node: body,
          start,
          end: node.getEnd(),
          hookFreeze: covering.length ? covering[0].freeze : null,
          carpan,
        });
      }
      return; // test gövdesine test aramak için İNİLMEZ
    }
    ts.forEachChild(node, (child) => collectTests(child, carpan));
  }
  collectTests(source, 1);
  return tests;
}

interface Verdict {
  file: string;
  title: string;
  shots: number;
  defense: string | null;
  /** Savunma DENENDİ ama GEÇERSİZ (sahte damga / gezinmeden sonra) ise sebep. */
  bozuk: string | null;
}

function verdictsOf(specFiles: string[], e2eRoot: string): Verdict[] {
  const out: Verdict[] = [];
  for (const fileName of specFiles) {
    const full = path.join(e2eRoot, fileName);
    for (const specTest of screenshotTestsOf(full)) {
      const shots = countScreenshotsIn(specTest.node, full) * specTest.carpan;
      if (specTest.hookFreeze !== null) {
        out.push({
          file: fileName,
          title: specTest.title,
          shots,
          defense: `beforeEach dondurmasi (${specTest.hookFreeze})`,
          bozuk: null,
        });
        continue;
      }
      const setup = freezeSetupIn(specTest.node, full);
      if (setup === null) {
        out.push({ file: fileName, title: specTest.title, shots, defense: null, bozuk: null });
        continue;
      }
      if (!setup.hit.argOk) {
        out.push({
          file: fileName,
          title: specTest.title,
          shots,
          defense: null,
          bozuk: `SAHTE DAMGA: ${setup.hit.site} argumani "${setup.hit.arg}" MAKINE SAATIDIR`,
        });
        continue;
      }
      const nav = lastGotoPos(specTest.node, full);
      if (nav >= 0 && setup.pos > nav) {
        out.push({
          file: fileName,
          title: specTest.title,
          shots,
          defense: null,
          bozuk: `SIRA HATASI: dondurma (${setup.hit.site}) son gezinmeden SONRA — ilk render makine saatiyle olusur`,
        });
        continue;
      }
      out.push({
        file: fileName,
        title: specTest.title,
        shots,
        defense: `saat donduruldu (${setup.hit.site})`,
        bozuk: null,
      });
    }
  }
  return out;
}

describe("gorsel kare takvim bagimsizligi — her kadraj DONDURULUR ya da GEREKCELI muaf", () => {
  const specFiles = readdirSync(e2eDir).filter(isVisualSpecFile);
  const verdicts = verdictsOf(specFiles, e2eDir);
  const keyOf = (v: Verdict) => `${v.file} :: ${v.title}`;

  it("TARANAN KADRAJ SAYISI diskteki baseline sayisiyla ORTUSUR (kapsam bos ya da EKSIK kalmaz)", () => {
    // 🔴 B1 dersi: bekçinin "gördüğü" kadraj sayısı ile diskteki `.png`
    // sayısı ÖLÇÜLMEDEN eşit sanılırsa, döngüde üretilen kareler sessizce
    // kapsam dışında kalır (fiilen 8 kare böyle kaçtı). Bu iddia o boşluğu
    // her koşuda yeniden ölçer.
    const scanned = verdicts.reduce((sum, v) => sum + v.shots, 0);
    const onDisk = readdirSync(e2eDir)
      .filter((name) => name.endsWith("-snapshots"))
      .reduce((sum, dir) => sum + readdirSync(path.join(e2eDir, dir)).filter((f) => f.endsWith(".png")).length, 0);
    expect(verdicts.length).toBeGreaterThan(0);
    expect(scanned, `bekci ${scanned} kadraj goruyor ama diskte ${onDisk} baseline var`).toBe(onDisk);
  });

  it("BOZUK savunma YOK (sahte damga / gezinmeden sonra dondurma)", () => {
    const broken = verdicts.filter((v) => v.bozuk !== null).map((v) => `${keyOf(v)} — ${v.bozuk}`);
    expect(broken, broken.join("\n")).toEqual([]);
  });

  it("savunmasiz HER kadraj KASTEN_DISARIDA'da OLCULMUS gerekcesiyle yer alir", () => {
    const missing = verdicts
      .filter((v) => v.defense === null && v.bozuk === null)
      .filter((v) => !(v.file in KASTEN_DISARIDA) && !(keyOf(v) in KASTEN_DISARIDA))
      .map(
        (v) =>
          `${keyOf(v)} [${v.shots} kadraj] — saat DONDURULMUYOR. Ya page.clock.setFixedTime(...) ekle ` +
          "ya da KASTEN_DISARIDA'ya OLCULMUS gerekce yaz (ileri damgayla kadrajin " +
          "oynamadigini KANITLA, 'gerek yok' YETMEZ).",
      );
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("KASTEN_DISARIDA CURUYEMEZ — olu anahtar, savunmali anahtar ve KAYAN KADRAJ SAYISI yakalanir", () => {
    const fileKeys = new Set(verdicts.map((v) => v.file));
    const testKeys = new Set(verdicts.map(keyOf));
    const rot: string[] = [];

    for (const [key, kayit] of Object.entries(KASTEN_DISARIDA)) {
      if (kayit.gerekce.trim() === "") {
        rot.push(`${key} — GEREKCE BOS; muafiyet gerekcesiz YAZILMAZ`);
        continue;
      }
      if (key.includes(" :: ")) {
        if (!testKeys.has(key)) {
          rot.push(`${key} — boyle bir kadrajli test YOK (yeniden adlandirildi/silindi mi?)`);
          continue;
        }
        const verdict = verdicts.find((v) => keyOf(v) === key);
        if (verdict?.defense) rot.push(`${key} — artik savunmali (${verdict.defense}); listeden CIKAR`);
        continue;
      }
      if (!fileKeys.has(key)) {
        rot.push(`${key} — boyle bir kadrajli gorsel spec YOK`);
        continue;
      }
      const own = verdicts.filter((v) => v.file === key);
      const undefended = own.filter((v) => v.defense === null);
      if (undefended.length === 0) {
        rot.push(`${key} — dosyanin TUM kadrajlari artik savunmali; listeden CIKAR`);
        continue;
      }
      // 🔴 B3 dersi: DOSYA anahtari battaniyedir — o dosyaya SONRADAN eklenen
      // savunmasiz bir kadraj sessizce muaf olurdu. Ortulen kadraj sayisi
      // kayitlidir; kaydigi an karar YENIDEN alinir.
      const covered = undefended.reduce((sum, v) => sum + v.shots, 0);
      if (covered !== kayit.kadraj) {
        rot.push(
          `${key} — muafiyet ${kayit.kadraj} kadraj icin yazilmisti, simdi ${covered} savunmasiz kadraj var; ` +
            `YENI KADRAJ SESSIZCE MUAF OLMAZ: matrisi yeniden olc, sayiyi guncelle ya da dondurma ekle`,
        );
      }
    }
    expect(rot, rot.join("\n")).toEqual([]);
  });
});

describe("usesPrepareFrame · barrel'dan re-export edilen prepareFrame de tanınmalı (kayıt 382)", () => {
  it("`contracts-visual-helpers.ts` gibi bir barrel'dan içe aktarılan dosyalarda da tanınır", () => {
    const barrelImportContent = [
      'import { prepareFrame } from "./contracts-visual-helpers";',
      "test('kare', async ({ page }) => {",
      "  await prepareFrame(page);",
      "  await expect(page).toHaveScreenshot('foo.png');",
      "});",
    ].join("\n");

    expect(usesPrepareFrame(barrelImportContent)).toBe(true);
  });
});
