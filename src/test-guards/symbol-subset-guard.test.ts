// @vitest-environment node
//
// F-SEM T3.2 · ALT-KÜME DIŞI SEMBOL BEKÇİSİ.
//
// KÖK OLGU: yazı tipleri `src/styles/fonts.css` ile self-host edilir (25 alt
// küme kuralı). Bir kod noktası HİÇBİR `unicode-range` içine düşmüyorsa
// tarayıcı onu `Inter Fallback: local("Arial")`e verir; `ubuntu-latest`te
// Arial YOKTUR, fontconfig yerine başka bir aile ikame eder. İkame seçimi
// runner'ın yazı tipi envanterine bağlıdır — yani KOD DEĞİŞMEDEN kare
// oynayabilir.
//
// AMA "kapsam dışı ⇒ oynak" YANLIŞTIR ve ölçümle çürütüldü: son 100 CI
// koşusunun 42'si tam yeşildi ve her yeşil tur 292 karenin hepsini geçti;
// iki kırmızı turda düşen tek kare `makine-yakit`ti (yazı tipiyle ilgisiz).
// Bugün `src/` altında ~77 farklı emoji + iki ok kapsam dışıdır ve ölçülen
// biçimde KARARLIDIR. Bu yüzden bekçi "kapsam dışı olan her şeyi" yasaklamaz.
//
// MEKANİK AYRIM — bekçinin yasakladığı dar sınıf:
//   • `⚠` (U+26A0) çıplak hâli Emoji_Presentation=No ama emoji-YETENEKLİdir:
//     hem metin ailesi hem emoji ailesi aday olur ⇒ ÇİFT ADAY ⇒ ikame flip
//     edebilir. Arkasına VS16 (U+FE0F) gelince emoji sunumu ZORUNLU olur ⇒
//     TEK aday (Noto Color Emoji) ⇒ deterministik. Yani `⚠️` serbest,
//     çıplak `⚠` yasaktır.
//   • `✓` (U+2713) / `✗` (U+2717): T2'de (d96f7a0) 16 render yüzeyi
//     `src/components/ui/icons/` inline SVG'sine çevrildi. Geri dönüş bu
//     dilimin işini boşa çıkarır; bekçi geri dönüşü commit anında yakalar.
//
// TASARIM — tek mekanizma: KOD NOKTASI İZİN LİSTESİ.
//   1. `fonts.css`teki `unicode-range` bildirimleri BURADA parse edilir
//      (sabit liste gömülmez — CSS değişirse kapsam hesabı kendiliğinden
//      değişir).
//   2. `src/**/*.{ts,tsx,css}` taranır; testler, üretilen `schema.d.ts` ve
//      bu dosyanın kendisi hariç.
//   3. Yorumlar soyulur, DİZE SABİTLERİ SOYULMAZ. Bu kritik: UI etiketlerinin
//      çoğu dize sabitidir (`sales-labels.ts`, `document-items.ts`). Dizeleri
//      muaf tutan bir bekçi SAHTE BEKÇİ olurdu.
//   4. Kalan her ASCII-dışı kod noktası kapsam dışıysa izin listesinde
//      olmalıdır; değilse test KIRMIZI.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const srcDir = fileURLToPath(new URL("../", import.meta.url));
const fontsCssPath = fileURLToPath(new URL("../styles/fonts.css", import.meta.url));
const selfPath = fileURLToPath(new URL("./symbol-subset-guard.test.ts", import.meta.url));

/** Değişim seçicisi (VS16): kendinden önceki kod noktasına emoji sunumunu ZORUNLU kılar. */
const VS16 = 0xfe0f;

/** Çıplak hâlde YASAK sınıf — T2'de inline SVG'ye çevrildiler. */
const FORBIDDEN_BARE = new Map<number, string>([
  [0x26a0, "⚠"],
  [0x2713, "✓"],
  [0x2717, "✗"],
]);

/**
 * Yasak sınıftan yalnız BUNLAR arkalarına VS16 gelince serbesttir.
 * `⚠️` = tek aday (Noto Color Emoji) ⇒ deterministik. `✓`/`✗` için emoji
 * sunumu YOKTUR, VS16 onları kurtarmaz — bu yüzden listede değiller.
 */
const VS16_RESCUES = new Set<number>([0x26a0]);

/**
 * TEK YÜZEY İSTİSNASI — dosya + kod noktası düzeyinde DAR.
 * `<option>` elemanı yalnız METİN alır, içine SVG konamaz (HTML kısıtı), bu
 * yüzden T2'de bilerek geri alındı. `stok-giris-formu` karesi ölçülen 42
 * yeşil turda hiç oynamadı. Tüm dosya muaf DEĞİLDİR: yalnız bu üç kod noktası.
 */
const SURFACE_EXCEPTIONS: readonly {
  readonly file: string;
  readonly codePoints: readonly number[];
}[] = [
  {
    // `STOCK_QUALITY_OPTIONS` — `<option>` etiketleri, mockup 117.
    file: "components/stock-entry-form/constants.ts",
    codePoints: [0x2713, 0x26a0, 0x2717],
  },
];

/**
 * İZİN LİSTESİ — her girdi kapsam DIŞIDIR ve bilerek serbesttir.
 *
 * Ortak gerekçe: hepsi mockup'tan gelir (`../projedesign/`), SVG'ye çevirmek
 * TASARIM DEĞİŞİKLİĞİ olurdu, ve ölçülen 42 yeşil CI turunda tek bir kare
 * bile oynatmadılar. Aşağıda her satırın kendi kullanım gerekçesi vardır.
 */
const ALLOWED: readonly (readonly [number, string])[] = [
  // — Yön okları: metin sunumu, ölçülen biçimde kararlı —
  [0x2190, "← geri/dönüş bağlantısı (Ayarlar sidebar başı); `makine-calisma` karesinde hiç oynamadı"],
  [0x2192, "→ ilerleme/akış oku (durum geçişi, kırılım yolu); en yaygın ok, 27 dosyada kararlı"],

  // — Değişim seçicisi —
  [VS16, "U+FE0F (VS16) emoji sunumunu ZORUNLU kılar ⇒ tek aday ⇒ determinizmi ARTIRIR"],

  // — Emoji=No dingbat/geometri: tek yazı tipi adayı, emoji ikamesi imkânsız —
  [0x22ef, "⋯ satır menüsü tetikleyicisi (PlanRowMenu); Emoji=No ⇒ tek aday"],
  [0x270e, "✎ sprint düzenleme kalemi (PlanSprintEditor); Emoji=No ⇒ tek aday"],

  // — Hava durumu rozetleri (şantiye günlüğü, mockup GK264) —
  [0x2600, "☀ açık hava seçeneği (diary-labels)"],
  [0x2601, "☁ bulutlu hava seçeneği (diary-labels) + entegrasyon kartı ikonu"],
  [0x26c5, "⛅ parçalı bulutlu hava seçeneği (diary-labels)"],
  [0x2744, "❄ karlı hava seçeneği (diary-labels)"],
  [0x1f327, "🌧 yağmurlu hava seçeneği (diary-labels)"],

  // — Modül/ekran ikonları (sidebar, drill gezinme, ayarlar navigasyonu) —
  [0x2699, "⚙ ayarlar/teknik modül ikonu (Sidebar, RolesScreen, ekipman kategorisi)"],
  [0x1f3a8, "🎨 Görünüm ayarları sekmesi ikonu (settings-nav-config)"],
  [0x1f510, "🔐 Güvenlik ayarları sekmesi ikonu (settings-nav-config)"],
  [0x1f514, "🔔 Bildirim ayarları sekmesi ikonu (settings-nav-config)"],
  [0x1f517, "🔗 Entegrasyon sekmesi + sözleşme bağ ikonu"],
  [0x1f50d, "🔍 kullanıcı arama alanı ikonu (UsersScreen)"],
  [0x1f6aa, "🚪 çıkış (logout) ikonu — hem uygulama hem Ayarlar sidebar'ı"],
  [0x1f465, "👥 roller ekranı kullanıcı grubu ikonu"],
  [0x1f464, "👤 personel/kullanıcı tekil ikonu (5 yüzey)"],
  [0x1f454, "👔 demo hesap rozeti — yönetici (DemoAccounts)"],
  [0x1f477, "👷 personel/işçi ikonu (8 yüzey: puantaj, İK, günlük)"],
  [0x1f4bc, "💼 iş/görev modülü ikonu (JobCard, roller, drill gezinme)"],
  [0x1f91d, "🤝 taşeron/ortaklık proje tipi kartı ikonu"],
  [0x1f44d, "👍 Onay Eşiği sekmesi ikonu (settings-nav-config) — mockup ✅ ikamesi"],

  // — Yapı/tesis ikonları —
  [0x1f3d7, "🏗 şantiye ikonu — en yaygın modül simgesi (10 yüzey)"],
  [0x1f3db, "🏛 resmi kurum/ruhsat belgesi ikonu"],
  [0x1f3e0, "🏠 konut/ünite ikonu (5 yüzey)"],
  [0x1f3e2, "🏢 işveren/tedarikçi firma ikonu"],
  [0x1f3e5, "🏥 sağlık raporu/hastane belgesi ikonu"],
  [0x1f3e6, "🏦 banka/hazine ikonu (satış, entegrasyon, drill gezinme)"],
  [0x1f3ed, "🏭 üretim tesisi ekipman kategorisi ikonu"],
  [0x1f5fa, "🗺 harita/konum kartı ikonu (site-form LocationCard)"],
  [0x1f4cd, "📍 adres/konum işareti (7 yüzey)"],

  // — Belge & arşiv ikonları —
  [0x1f4c4, "📄 genel belge ikonu (9 yüzey)"],
  [0x1f4c1, "📁 klasör ikonu (belge arşivi, proje tipi kartı)"],
  [0x1f4c2, "📂 açık klasör — seçili klasör durumu (DocumentFolderPanel)"],
  [0x1f4cb, "📋 liste/form ikonu — en yaygın ikinci simge (15 yüzey)"],
  [0x1f4ce, "📎 ek dosya ikonu (9 yüzey)"],
  [0x1f4dc, "📜 tapu/sözleşme parşömen ikonu (satış, ayarlar)"],
  [0x1f4dd, "📝 not/açıklama ikonu (5 yüzey)"],
  [0x1f4d2, "📒 defter/kayıt ikonu (demo hesap, roller, drill gezinme)"],
  [0x1f5bc, "🖼 görsel dosya biçimi rozeti (document-format)"],
  [0x1f5c2, "🗂 arşiv dosya biçimi rozeti (document-format)"],
  [0x1f4f7, "📷 fotoğraf ikonu — şantiye günlüğü foto eki (6 yüzey)"],
  [0x1f9fe, "🧾 fiş/irsaliye ikonu (satış, stok girişi)"],
  [0x1faaa, "🪪 kimlik belgesi ikonu (personel, satış)"],
  [0x1f393, "🎓 diploma/öğrenim belgesi ikonu (personel-form)"],

  // — Mali & ölçüm ikonları —
  [0x1f4b0, "💰 para/tutar ikonu (9 yüzey)"],
  [0x1f4b3, "💳 ödeme planı kartı ikonu (sales-form)"],
  [0x1f4c8, "📈 ilerleme grafiği rozeti (ProjectCard)"],
  [0x1f4ca, "📊 rapor/gösterge ikonu (5 yüzey)"],
  [0x1f4d0, "📐 metraj/ölçü ikonu (5 yüzey)"],
  [0x1f4c5, "📅 tarih/takvim ikonu (6 yüzey)"],
  [0x1f512, "🔒 kilitli hakediş hücresi göstergesi (PaymentFormPivotTable)"],
  [0x1f511, "🔑 anahtar teslim/ruhsat ikonu (ekipman, satış)"],

  // — Lojistik & saha ikonları —
  [0x1f4e6, "📦 stok/malzeme ikonu (7 yüzey)"],
  [0x1f4e5, "📥 stok giriş işlem tipi etiketi (stock-entry-form)"],
  [0x1f504, "🔄 transfer/iade işlem tipi etiketi (stock-entry-form)"],
  [0x1f6d2, "🛒 satınalma modülü ikonu (roller, drill gezinme)"],
  [0x1f69b, "🚛 kamyon ekipman kategorisi ikonu"],
  [0x1f69c, "🚜 iş makinesi kategorisi + operatör belgesi ikonu"],
  [0x1f527, "🔧 bakım/onarım ekipman kategorisi ikonu"],
  // — F-MKD · Ekipman Detay kart başlıkları (`Makine - Ekipman Detay.dc.html`
  //   MD:201 · MD:231). Mockup'tan gelirler; SVG'ye çevirmek TASARIM
  //   DEĞİŞİKLİĞİ olurdu. İkisi de Emoji_Presentation=Yes ⇒ tek aday
  //   (Noto Color Emoji), `⚠`in çift-aday sınıfında DEĞİLLER. —
  [0x23f1, "⏱ çalışma kaydı özeti kart başlığı (equipment-detail)"],
  [0x26fd, "⛽ yakıt takibi özeti kart başlığı (equipment-detail)"],
  [0x1f52c, "🔬 laboratuvar/deney raporu belgesi ikonu"],
  [0x1f4de, "📞 telefon/iletişim ikonu (personel kartı ve formu)"],
  [0x1f4f1, "📱 mobil entegrasyon kartı ikonu (IntegrationsScreen)"],
  [0x2709, "✉ e-posta ikonu (PersonnelHeaderCard) — VS16 ile yazılır"],
  [0x270f, "✏ elle giriş işlem tipi etiketi (stock-entry-form) — VS16 ile yazılır"],

  // — İSG & uyarı (yasak sınıfın DIŞINDA kalanlar) —
  [0x26d1, "⛑ İSG/baret belgesi ikonu (personel, bölüm, şantiye, günlük)"],
  [0x1f6e1, "🛡 sigorta/teminat belgesi ikonu"],
  [0x1f6a8, "🚨 İK belge uyarı bandı ikonu (HrDocumentsView)"],
  [0x2705, "✅ tamamlandı rozeti — U+2713'ün AKSİNE emoji sunumlu, çift adaylık yok"],

  // — Diğer —
  [0x1f3af, "🎯 sprint hedef kartı ikonu (PlanGoalsCard)"],
  [0x2b50, "⭐ birim fiyat/öne çıkan kalem işareti (taşeron sözleşmesi)"],
  [0x1f1e7, "🇧 GB bayrak dizisi bileşeni (AppearanceScreen dil seçici)"],
  [0x1f1ec, "🇬 GB bayrak dizisi bileşeni (AppearanceScreen dil seçici)"],
  [0x1f1f7, "🇷 TR bayrak dizisi bileşeni (AppearanceScreen dil seçici)"],
  [0x1f1f9, "🇹 TR bayrak dizisi bileşeni (AppearanceScreen dil seçici)"],
];

const ALLOWED_CODE_POINTS = new Set(ALLOWED.map(([cp]) => cp));

/* ------------------------------------------------------------------ */
/* fonts.css `unicode-range` → kapsam hesabı                           */
/* ------------------------------------------------------------------ */

type Range = readonly [number, number];

/**
 * `u+00??` (joker), `u+xxxx-yyyy` (aralık) ve `u+xxxx` (tekil) biçimlerini
 * çözer. T1'in elle yaptığı kapsam hesabının KOD hâli — sabit liste gömmek
 * `fonts.css` değişince sessizce çürürdü.
 */
function parseUnicodeRanges(css: string): Range[] {
  const ranges: Range[] = [];
  for (const declaration of css.matchAll(/unicode-range:\s*([^;]+);/g)) {
    for (const rawToken of declaration[1].split(",")) {
      const token = rawToken.trim().toLowerCase().replace(/^u\+/, "");
      if (token === "") continue;
      if (token.includes("?")) {
        ranges.push([
          parseInt(token.replace(/\?/g, "0"), 16),
          parseInt(token.replace(/\?/g, "f"), 16),
        ]);
      } else if (token.includes("-")) {
        const [start, end] = token.split("-");
        ranges.push([parseInt(start, 16), parseInt(end, 16)]);
      } else {
        const single = parseInt(token, 16);
        ranges.push([single, single]);
      }
    }
  }
  return ranges;
}

/* ------------------------------------------------------------------ */
/* Yorum soyma — dizeler KORUNUR                                        */
/* ------------------------------------------------------------------ */

/**
 * Satır yorumlarını, blok yorumlarını ve JSX blok yorumlarını siler; tek/çift
 * tırnak ve şablon dizelerinin İÇİNİ AYNEN korur. Dizeleri de soyan bir sürüm
 * bu bekçiyi sahte yapardı — UI etiketlerinin neredeyse tamamı dize sabitidir.
 *
 * Blok yorumu içindeki satır sonları KORUNUR ki ihlal satır numaraları
 * özgün dosyayla birebir örtüşsün.
 */
function stripComments(source: string, isCss: boolean): string {
  let out = "";
  let state: "code" | "line" | "block" | '"' | "'" | "`" = "code";
  let i = 0;

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    if (state === "code") {
      if (char === "/" && next === "*") {
        state = "block";
        i += 2;
        continue;
      }
      // CSS'te `//` yorum DEĞİLDİR (protokolsüz url() olabilir).
      if (!isCss && char === "/" && next === "/") {
        state = "line";
        i += 2;
        continue;
      }
      if (char === '"' || char === "'" || char === "`") {
        state = char;
        out += char;
        i += 1;
        continue;
      }
      out += char;
      i += 1;
      continue;
    }

    if (state === "block") {
      if (char === "*" && next === "/") {
        state = "code";
        i += 2;
      } else {
        if (char === "\n") out += "\n";
        i += 1;
      }
      continue;
    }

    if (state === "line") {
      if (char === "\n") {
        state = "code";
        out += "\n";
      }
      i += 1;
      continue;
    }

    // Dize durumları: içerik AYNEN kopyalanır.
    if (char === "\\") {
      out += char + (next ?? "");
      i += 2;
      continue;
    }
    if (char === state) {
      state = "code";
      out += char;
      i += 1;
      continue;
    }
    out += char;
    i += 1;
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Tarama                                                              */
/* ------------------------------------------------------------------ */

const SCANNED_EXTENSIONS = [".ts", ".tsx", ".css"];

/** Üretilen dosyalar: içerikleri openapi'den gelir, elle düzeltilmez. */
const GENERATED_FILES = ["schema.d.ts"];

function isScannable(fileName: string, fullPath: string): boolean {
  if (!SCANNED_EXTENSIONS.some((ext) => fileName.endsWith(ext))) return false;
  if (/\.(test|spec)\./.test(fileName)) return false;
  if (GENERATED_FILES.includes(fileName)) return false;
  if (fullPath === selfPath) return false;
  return true;
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    return isScannable(entry.name, fullPath) ? [fullPath] : [];
  });
}

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly codePoint: number;
  readonly glyph: string;
  readonly reason: string;
}

function relative(fullPath: string): string {
  return fullPath.startsWith(srcDir) ? fullPath.slice(srcDir.length) : fullPath;
}

function exceptionFor(relPath: string): readonly number[] {
  return SURFACE_EXCEPTIONS.find((e) => e.file === relPath)?.codePoints ?? [];
}

function hex(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function findViolations(
  fullPath: string,
  content: string,
  isInSubset: (codePoint: number) => boolean,
): Violation[] {
  const relPath = relative(fullPath);
  const exempted = exceptionFor(relPath);
  const cleaned = stripComments(content, fullPath.endsWith(".css"));
  const codePoints = [...cleaned].map((char) => char.codePointAt(0) ?? 0);
  const violations: Violation[] = [];
  let line = 1;

  for (let i = 0; i < codePoints.length; i += 1) {
    const codePoint = codePoints[i];
    if (codePoint === 0x0a) {
      line += 1;
      continue;
    }
    if (codePoint < 0x80) continue;
    if (isInSubset(codePoint)) continue;
    if (exempted.includes(codePoint)) continue;

    const glyph = String.fromCodePoint(codePoint);
    const followedByVs16 = codePoints[i + 1] === VS16;

    if (FORBIDDEN_BARE.has(codePoint)) {
      if (followedByVs16 && VS16_RESCUES.has(codePoint)) continue;
      violations.push({
        file: relPath,
        line,
        codePoint,
        glyph,
        reason: VS16_RESCUES.has(codePoint)
          ? "ciplak hali CIFT ADAY yazi tipi uretir (emoji-yetenekli) — VS16 (U+FE0F) ekle ya da src/components/ui/icons/ SVG'sini kullan"
          : "T2'de inline SVG'ye cevrildi (d96f7a0) — geri donus yasak, src/components/ui/icons/ kullan",
      });
      continue;
    }

    if (!ALLOWED_CODE_POINTS.has(codePoint)) {
      violations.push({
        file: relPath,
        line,
        codePoint,
        glyph,
        reason:
          "alt kume DISI ve izin listesinde YOK — ubuntu-latest'te fontconfig ikamesine dusrer; " +
          "SVG ikona cevir ya da gerekce yazarak ALLOWED listesine ekle",
      });
    }
  }

  return violations;
}

/* ------------------------------------------------------------------ */

const fontsCss = readFileSync(fontsCssPath, "utf8");
const subsetRanges = parseUnicodeRanges(fontsCss.replace(/\/\*[\s\S]*?\*\//g, ""));
const isInSubset = (codePoint: number): boolean =>
  subsetRanges.some(([start, end]) => codePoint >= start && codePoint <= end);

describe("alt-kume disi sembol bekcisi (F-SEM T3.2)", () => {
  const files = listSourceFiles(srcDir);

  it("fonts.css'ten gercek unicode-range kapsami cozulur (sabit liste GOMULMEZ)", () => {
    // 25 alt kume kurali, her biri birden cok token tasir.
    expect(subsetRanges.length).toBeGreaterThan(100);
    // Turkce `ğ` (U+011F) ve `İ` (U+0130) latin-ext icindedir: kapsam DAHIL.
    expect(isInSubset(0x011f)).toBe(true);
    expect(isInSubset(0x0130)).toBe(true);
    // Yasak uclu ise 13 woff2'nin HICBIRINDE yok (fonttools olcumu, T1).
    expect(isInSubset(0x26a0)).toBe(false);
    expect(isInSubset(0x2713)).toBe(false);
    expect(isInSubset(0x2717)).toBe(false);
  });

  it("taranacak kaynak dosyalar bulunur (kapsam BOS kalmaz)", () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it("yorum soyucu dizeleri KORUR, yorumlari siler", () => {
    expect(stripComments('const a = "✓"; // ⚠\n', false)).toBe('const a = "✓"; \n');
    expect(stripComments("/* ⚠ */ const a = `✗`;", false)).toBe(" const a = `✗`;");
    expect(stripComments("{/* ⚠ */}", false)).toBe("{}");
  });

  it("izin listesi yasak ucluyu ICERMEZ (kendi kendine tutarli)", () => {
    for (const codePoint of FORBIDDEN_BARE.keys()) {
      expect(ALLOWED_CODE_POINTS.has(codePoint)).toBe(false);
    }
  });

  it("dar yuzey istisnasi OLU DEGILDIR — dosya hala o glifleri tasir", () => {
    for (const exception of SURFACE_EXCEPTIONS) {
      const content = readFileSync(join(srcDir, exception.file), "utf8");
      for (const codePoint of exception.codePoints) {
        expect(
          content.includes(String.fromCodePoint(codePoint)),
          `${exception.file} artik ${hex(codePoint)} tasimiyor — istisna kaldirilmali`,
        ).toBe(true);
      }
    }
  });

  it("src/ altinda alt-kume disi izinsiz sembol YOKTUR", () => {
    const violations = files.flatMap((fullPath) =>
      findViolations(fullPath, readFileSync(fullPath, "utf8"), isInSubset),
    );

    const message = violations
      .map((v) => `src/${v.file}:${v.line} — ${hex(v.codePoint)} "${v.glyph}" · ${v.reason}`)
      .join("\n");

    expect(violations, `\n${message}\n`).toEqual([]);
  });
});
