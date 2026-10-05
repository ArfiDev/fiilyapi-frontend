import type { Period } from "@/components/accounting/accounting-labels";
import type {
  CashFlowStatementSection,
  MonthlyCashPoint,
} from "@/lib/api/hooks/useCashFlowStatement";
import { isZeroDecimalString, subtractDecimalStrings } from "@/lib/decimal";
import { EMPTY_CELL, formatAmount, formatMonthName, formatPeriod } from "@/lib/format";

/**
 * F-MT T3 · Nakit Akış Tablosu ekranının SAF katmanı. Kanonik mockup
 * `Mali Tablo - Nakit Akışı.dc.html` (NA); yorumlardaki sayılar O dosyanın
 * SATIR numaralarıdır. Bu modülde AĞ ve DOM yoktur; testi
 * `cash-flow-statement.test.ts`te yaşar.
 */

/** NA:37 — `Ocak–Temmuz 2026` aralık ayracı (U+2013, boşluksuz). */
const RANGE_DASH = "–";

/**
 * NA:38 `PDF` düğmesinin devre-dışı gerekçesinin anahtarı.
 *
 * Uçta hiçbir dışa aktarma yolu YOKTUR (şema açıklaması kapsam dışını adıyla
 * sayar: "`PDF` düğmesi (NA:38)"). `balance_sheet_export` PAYLAŞILMAZ: o metin
 * adıyla "bilanço" der ve bu ekranda YANLIŞ yüzeyi işaret ederdi (F-MU2 K6
 * kanonu: EKRAN BAŞINA ayrı anahtar).
 */
export const CASH_FLOW_EXPORT_REASON = "cash_flow_statement_export";

/**
 * 🔴 K8 — NA:143-159 `3 Aylık Projeksiyon` kartının devre-dışı gerekçesi.
 *
 * Uç açıklaması kartı ADIYLA kapsam dışına koyar: "ileriye dönük tahmin,
 * algoritması mockup'ta YOK, açıklama metinleri serbest metin; İCAT EDİLMEZ".
 * Kart SİLİNMEZ (F-TH kanonu: rotası/ucu olmayan mockup öğesi devre dışı
 * basılır) ve üç satırı UYDURULMAZ.
 */
export const CASH_FLOW_PROJECTION_REASON = "cash_flow_projection";

export interface CashFlowPeriodOption {
  /** `GET /cash-flow-statement?year&month` çiftinin taşıyıcı biçimi — `YYYY-MM`. */
  readonly value: string;
  /** NA:37 `<option>` metni — `Ocak–Temmuz 2026` / `2025 Yılı`. */
  readonly label: string;
}

/**
 * NA:37 dönem seçicisinin etiketi. 🔴 **BİRİKİMLİ ARALIK, tek ay DEĞİL**
 * (K10): uç `year`+`month` alır ama pencere "1 Ocak → seçilen ayın son günü"dür
 * — bilançonun NOKTA-ZAMAN seçicisiyle karıştırılmaz.
 *
 * `month === 1` ise aralığın iki ucu AYNI aydır; "Ocak–Ocak 2026" yerine kısa
 * yazım basılır — aynı pencerenin adıdır (`trialBalanceRangeLabel` emsali).
 */
export function cashFlowRangeLabel(period: Period): string {
  const end = formatPeriod(period.year, period.month);
  if (period.month === 1) return end;
  return `Ocak${RANGE_DASH}${end}`;
}

/**
 * NA:37 — mockup'ın İKİ seçeneği:
 *   1. içinde bulunulan yılın Ocak → bu ay aralığı → `Ocak–Temmuz 2026`
 *   2. önceki yılın TAMAMI (Ocak–Aralık)          → `2025 Yılı`
 *
 * 🔴 Mockup'ın sabit tarihleri KOPYALANMAZ: ekran 2027'de de doğru kalmalıdır.
 * İkinci seçeneğin etiketi aralık biçiminde değil "YIL Yılı" biçimindedir —
 * mockup öyle yazıyor ve bir tam yıl için doğru okuma odur.
 */
export function cashFlowPeriodOptions(today: Date): readonly CashFlowPeriodOption[] {
  const current = defaultCashFlowPeriod(today);
  const previousYear: Period = { year: current.year - 1, month: 12 };
  return [
    { value: cashFlowPeriodValue(current), label: cashFlowRangeLabel(current) },
    { value: cashFlowPeriodValue(previousYear), label: `${previousYear.year} Yılı` },
  ];
}

/**
 * 🔴 K10 — VARSAYILAN DÖNEM FRONTEND'İN KARARIDIR: sunucu "bugün"ü hiç okumaz,
 * `year`/`month` zorunludur.
 *
 * 🔴 YEREL takvim (`getFullYear()/getMonth()`); `toISOString()` UTC'ye çevirir
 * ve TR saatinde ayın son gününde dönemi bir ay ileri kaydırırdı (TB5 dersi).
 */
export function defaultCashFlowPeriod(today: Date): Period {
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

/** Dönem çifti → `<option value>` (`YYYY-MM`). */
export function cashFlowPeriodValue(period: Period): string {
  return `${period.year}-${String(period.month).padStart(2, "0")}`;
}

/**
 * `<option value>` → dönem çifti. Çözülemeyen değer SESSİZCE `NaN` üretmez:
 * `fallback` döner — `NaN` sorgu dizesine sızsaydı uç 422 verirdi.
 */
export function parseCashFlowPeriod(value: string, fallback: Period): Period {
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (match === null) return fallback;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return fallback;
  return { year, month };
}

/* ------------------------------------------------------------------ */
/* İŞARETLİ TUTAR — NA:71-75                                           */
/* ------------------------------------------------------------------ */

/** `in` = nakit GİRİŞİ (NA:71 yeşil `+`) · `out` = ÇIKIŞ (NA:72 kırmızı `-`). */
export type CashFlowDirection = "in" | "out" | "zero" | "hidden";

/**
 * Ondalık string'in MUTLAK değeri — işaret STRING düzeyinde atılır.
 *
 * 🔴 `Math.abs(Number(value))` YASAK: nakit tutarları kurumsal ölçekte 2⁵³'ü
 * (9.007.199.254.740.992) aşabilir ve IEEE-754 çift duyarlık orada TAMSAYI
 * çözünürlüğünü kaybeder — hem son basamak hem kuruş yutulur. Ayrışma noktası
 * testi `cash-flow-statement.test.ts`tedir.
 */
export function absDecimalString(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("-") || trimmed.startsWith("+") ? trimmed.slice(1) : trimmed;
}

/**
 * Tutarın YÖNÜ — sunucunun İŞARETLİ `amount`undan türer (şema: "+ giriş,
 * − çıkış"). İşaret STRING'den okunur; `Number()` gidiş-dönüşü büyük
 * tutarlarda bilgi kaybeder ve sıfıra yakın değerlerde `-0` üretirdi.
 *
 * SIFIR bir yön DEĞİLDİR: `+ 0` ya da `- 0` basmak, olmayan bir hareket
 * yönü iddia etmek olurdu.
 */
export function cashFlowDirection(amount: string | null): CashFlowDirection {
  // IZN-F4b.2 — `null` (rol için gizli) yön DEĞİLDİR: ne giriş ne çıkış ne sıfır.
  if (amount === null) return "hidden";
  if (isZeroDecimalString(amount)) return "zero";
  return amount.trim().startsWith("-") ? "out" : "in";
}

/**
 * NA:71-75 biçimi: `+ 24.994.700` / `- 12.480.000` — işaret, BOŞLUK, sonra
 * mutlak tutar. `₺` YOK, ondalık YOK (mockup öyle yazıyor) ⇒ `formatCurrency`
 * değil `formatAmount` kullanılır.
 */
export function formatSignedAmount(amount: string | null): string {
  if (amount === null) return EMPTY_CELL;
  const direction = cashFlowDirection(amount);
  const magnitude = formatAmount(absDecimalString(amount));
  if (direction === "zero") return magnitude;
  return direction === "in" ? `+ ${magnitude}` : `- ${magnitude}`;
}

/**
 * İki ondalık string'i KAYIPSIZ karşılaştırır: `a > b` ⇒ `1`, `a < b` ⇒ `-1`,
 * eşit ⇒ `0`.
 *
 * 🔴 `Number(a) - Number(b)` YASAK (aynı 2⁵³ gerekçesi): grafiğin tavanı/tabanı
 * bu karşılaştırmadan çıkar, yanlış ay tavana oturursa eğri YALAN söyler.
 * Fark `subtractDecimalStrings` ile `BigInt` üzerinde alınır.
 */
export function compareDecimalStrings(a: string, b: string): number {
  const difference = subtractDecimalStrings(a, b);
  if (isZeroDecimalString(difference)) return 0;
  return difference.trim().startsWith("-") ? -1 : 1;
}

/**
 * NA:45 — KPI kartının etiketi. Kart mockup'ta kod harfi TAŞIMAZ
 * (`İşletme Faaliyetleri`), NA:69 tablo bandı ise TAŞIR
 * (`A. İŞLETME FAALİYETLERİNDEN NAKITLER`).
 *
 * 🔴 Metin SUNUCUDAN gelir, sabitlenmez (`BalanceSheetSideCard` kanonu): uç bir
 * bölüm adını değiştirdiğinde ekran sessizce yalancı olmamalıdır. Önek kesimi
 * bölümün KENDİ `code` alanıyla yapılır — başlığın içinde desen ARANMAZ,
 * böylece "BB. Bir Şey" gibi bir başlık yanlışlıkla kırpılmaz.
 */
export function sectionKpiLabel(section: CashFlowStatementSection): string {
  const prefix = `${section.code}.`;
  return section.title.startsWith(prefix) ? section.title.slice(prefix.length).trim() : section.title;
}

/** NA:44/48/52 — bölüm vurgu tonu. `neutral` = renk İDDİA EDİLMEYEN dal. */
export type CashFlowTone = "in" | "out" | "finance" | "neutral";

/**
 * NA:44/48/52 (KPI sol kenarı) · NA:68/81/90 (tablo bandı) — ton bölümün KENDİ
 * `code` harfinden türer: A yeşil (giriş), B kırmızı (çıkış), C kehribar
 * (finansman).
 *
 * 🔴 SIRAYA (index) BAĞLANMAZ: sunucu bir bölüm eklerse index kayar ve renkler
 * yanlış bölüme geçerdi. Tanınmayan kod NÖTR tona düşer — uydurma bir renk,
 * olmayan bir anlam iddia ederdi.
 */
export function sectionTone(code: string): CashFlowTone {
  if (code === "A") return "in";
  if (code === "B") return "out";
  if (code === "C") return "finance";
  return "neutral";
}

/* ------------------------------------------------------------------ */
/* NA:119-140 · `Aylık Nakit Pozisyonu` grafiğinin SAF geometrisi       */
/* ------------------------------------------------------------------ */

/**
 * 🔴 GÖRSEL SPEC KURALI 4. PARÇA (F-P8 kanonu): veriden türeyen HER koordinat
 * `Math.round`lanır. Kesirli koordinat tarayıcının turdan tura farklı
 * yuvarlamasına ve baseline'ın oynamasına yol açar — repoda ÜÇ KEZ ısırdı.
 * `treasury/cash-flow-geometry.ts` bu işin emsalidir ve şekli oradan alınmıştır.
 */

/** NA:119 `viewBox="0 0 320 150"`. */
export const CHART_WIDTH = 320;
export const CHART_HEIGHT = 150;
/** NA:127/129 — eğrinin tepesi. */
export const CHART_TOP = 15;
/** NA:127 — eğrinin ilk (en düşük) noktası; taban çizgisi. */
export const CHART_BASELINE = 120;
/** NA:127 — dolgunun kapandığı taban (`L320,140 L0,140Z`). */
export const CHART_FILL_BOTTOM = 140;
/** NA:131-137 — ay etiketlerinin taban çizgisi. */
export const CHART_LABEL_Y = 148;
/**
 * NA:137 — SON ay etiketinin x'i. 🔴 Etiket rayı ÇİZGİ rayından (320) DARdır:
 * son etiket x=320'de basılsaydı metin kadrajın dışına taşardı.
 */
export const CHART_LABEL_TRACK = 262;
/** NA:139 — uç noktanın yarıçapı. */
export const CHART_END_DOT_RADIUS = 4;

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

export interface MonthlyCashLabel {
  /** `YYYY-MM` — React anahtarı; ay adı tek başına TEKRAR edebilir. */
  readonly key: string;
  readonly x: number;
  readonly text: string;
}

export interface MonthlyCashChartGeometry {
  /** Yalnız SAYISAL (null olmayan) aylar; `null` ay için nokta ÇİZİLMEZ. */
  readonly points: readonly ChartPoint[];
  /** Ardışık sayısal ayların kesintisiz parçaları; `null` ay parçayı BÖLER (çizgide boşluk). */
  readonly segments: readonly (readonly ChartPoint[])[];
  readonly linePath: string;
  readonly areaPath: string;
  /** NA:139 uç nokta; seri boşsa `null` (uydurma bir nokta basılmaz). */
  readonly endDot: ChartPoint | null;
  readonly labels: readonly MonthlyCashLabel[];
}

/**
 * `monthly_cash[]` → NA:119-140'ın geometrisi.
 *
 * 🔴 ÖLÇEK SERİNİN KENDİ min/max'ıdır, sıfır DEĞİL: mockup'ın eğrisi de
 * tabandan (y=120) başlar, kadrajın dibinden (y=140) değil. Bakiye serisi bir
 * AKIŞ değil SEVİYEdir ve seviyeler birbirine yakın olduğunda sıfır tabanlı bir
 * ölçek eğriyi düz bir çizgiye ezerdi. min/max karşılaştırması KAYIPSIZ
 * (`compareDecimalStrings`) yapılır.
 *
 * 🔴 DÜZ segmentler (mockup NA:127/129 kübik `C` eğrileri çizer — ONAYLI
 * SAPMA, `treasury/cash-flow-geometry.ts` ile AYNI gerekçe): mockup'ın eğrisi
 * uydurma veri üzerine çizilmiş dekoratif bir yumuşatmadır; gerçek ay sonu
 * bakiyelerini yumuşatmak, olmayan ara değerler çizerdi.
 */
export function buildMonthlyCashGeometry(
  series: readonly MonthlyCashPoint[],
): MonthlyCashChartGeometry {
  if (series.length === 0) {
    return { points: [], segments: [], linePath: "", areaPath: "", endDot: null, labels: [] };
  }

  const labels = series.map((entry, index) => ({
    key: `${entry.year}-${String(entry.month).padStart(2, "0")}`,
    x: trackX(index, series.length, CHART_LABEL_TRACK),
    // NA:131-137 `Oca`/`Şub`/… — `formatMonthName`in KISALTMASI; ay adları
    // burada KOPYALANMAZ, tek kaynaktan türer.
    text: formatMonthName(entry.month).slice(0, 3),
  }));

  // 🔴 IZN-F4b.2 — `closing_cash === null` (rol için gizli) ay: nokta ÇİZİLMEZ, 0'a düşürülmez ve
  // eksen ölçeği YALNIZ sayısal değerlerden kurulur. Etiketler tüm aylar için basılır (zaman ekseni bozulmaz).
  const known = series.flatMap((entry, index) =>
    entry.closing_cash === null ? [] : [{ index, value: entry.closing_cash }],
  );
  if (known.length === 0) {
    return { points: [], segments: [], linePath: "", areaPath: "", endDot: null, labels };
  }

  const values = known.map((entry) => entry.value);
  const min = values.reduce((low, value) => (compareDecimalStrings(value, low) < 0 ? value : low));
  const max = values.reduce((high, value) => (compareDecimalStrings(value, high) > 0 ? value : high));
  // Fark KAYIPSIZ alınır; float yalnız PİKSEL oranında devreye girer (ekran
  // çözünürlüğü zaten tamsayıdır, orada kuruş hassasiyetinin anlamı yoktur).
  const span = Number(subtractDecimalStrings(max, min));

  const segments: ChartPoint[][] = [];
  let previousIndex: number | null = null;
  for (const entry of known) {
    const point = {
      x: trackX(entry.index, series.length, CHART_WIDTH),
      y: scaleY(Number(subtractDecimalStrings(entry.value, min)), span),
    };
    const current = segments[segments.length - 1];
    if (current !== undefined && previousIndex === entry.index - 1) current.push(point);
    else segments.push([point]);
    previousIndex = entry.index;
  }
  const points = segments.flat();

  return {
    points,
    segments,
    linePath: segments.map(toLinePath).join(""),
    areaPath: segments.map(toAreaPath).join(""),
    endDot: points[points.length - 1] ?? null,
    labels,
  };
}

/**
 * Noktayı verilen raya eşit aralıklarla yayar. TEK noktalı seri rayın BAŞINDA
 * durur — `count - 1` sıfır olduğunda bölme yapılmaz.
 */
function trackX(index: number, count: number, track: number): number {
  if (count <= 1) return 0;
  return Math.round((index / (count - 1)) * track);
}

/** Serinin min'i tabana, max'ı tavana oturur; DÜZ seride her şey tabandadır. */
function scaleY(offset: number, span: number): number {
  if (!(span > 0)) return CHART_BASELINE;
  const ratio = Math.min(Math.max(offset / span, 0), 1);
  return Math.round(CHART_BASELINE - ratio * (CHART_BASELINE - CHART_TOP));
}

function toLinePath(points: readonly ChartPoint[]): string {
  const [first, ...rest] = points;
  if (first === undefined) return "";
  // Tek noktalı seri: `stroke-linecap="round"` sayesinde nokta olarak basılır.
  if (rest.length === 0) return `M${first.x},${first.y}L${first.x},${first.y}`;
  return `M${first.x},${first.y}` + rest.map((point) => `L${point.x},${point.y}`).join("");
}

/** NA:127 — çizgiyi taban çizgisine kapatan dolgu yolu. */
function toAreaPath(points: readonly ChartPoint[]): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return "";
  return (
    `M${first.x},${CHART_FILL_BOTTOM}` +
    points.map((point) => `L${point.x},${point.y}`).join("") +
    `L${last.x},${CHART_FILL_BOTTOM}Z`
  );
}
