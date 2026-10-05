import type { CashFlowBucket } from "@/lib/api/hooks/useCashFlow";

/**
 * F-HZ T2 · E9:92-101 nakit akışı grafiğinin SAF geometri katmanı.
 *
 * 🔴 GÖRSEL SPEC KURALI 4. PARÇA (F-P8 kanonu, WORKFLOW §4): veriden türeyen
 * HER koordinat `Math.round`lanır. Kesirli koordinat, tarayıcının turdan tura
 * farklı yuvarlamasına ve baseline'ın oynamasına yol açar — `AnchoredPopover`
 * kusurunun SVG kardeşi. Bu dosyadan çıkan her sayı TAM SAYIdır.
 */

/** E9:92 `viewBox="0 0 400 120"`. */
export const CHART_WIDTH = 400;
export const CHART_VIEWBOX_HEIGHT = 120;
/** Eğrilerin üst tavanı — E9:97-100 yolları y≈20'nin altına çıkmaz. */
export const CHART_TOP = 20;
/** Sıfır çizgisi — eğriler bunun altına inmez. */
export const CHART_BASELINE = 100;
/** Dolgunun kapandığı taban — E9:97/99 `L400,110 L0,110Z`. */
export const CHART_FILL_BOTTOM = 110;

export interface ChartPoint {
  x: number;
  y: number;
}

export interface CashFlowGeometry {
  inflowLine: string;
  inflowArea: string;
  outflowLine: string;
  outflowArea: string;
  /** Yalnız SAYISAL (null olmayan) noktalar; gizli (`null`) kova için nokta ÇİZİLMEZ. */
  inflowPoints: readonly ChartPoint[];
  outflowPoints: readonly ChartPoint[];
  /** Kesintisiz parçalar: `null` kova çizgiyi BÖLER (boşluk), 0'a düşürülmez. */
  inflowSegments: readonly (readonly ChartPoint[])[];
  outflowSegments: readonly (readonly ChartPoint[])[];
}

/** `YYYY-MM-DD` → ayın günü. `new Date()` KULLANILMAZ (UTC kayması, TB5 sınıfı). */
export function dayOfMonth(iso: string): number {
  const day = Number(iso.split("-")[2]);
  return Number.isFinite(day) ? day : 0;
}

/** Verilen yıl/ayın gün sayısı — `Date.UTC` ile, yerel saatten bağımsız. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * x ekseni AYIN GÜNLERİ üzerinden ölçeklenir — seri SEYREKTİR (yalnız hareket
 * görmüş günler satır üretir), dizinin indeksi kullanılsaydı üç hareketli bir
 * ay grafiği ayın tamamına yayardı ve tarih ekseni yalan söylerdi.
 */
export function scaleX(day: number, monthLength: number): number {
  if (monthLength <= 1) return 0;
  const clamped = Math.min(Math.max(day, 1), monthLength);
  return Math.round(((clamped - 1) / (monthLength - 1)) * CHART_WIDTH);
}

/**
 * y ekseni İKİ SERİNİN ORTAK tavanına göre ölçeklenir; ayrı ölçeklenseydi
 * "giriş" ve "çıkış" eğrileri karşılaştırılamaz olurdu (küçük çıkış, büyük
 * girişle aynı yüksekliğe çıkardı). Tavan 0 ise her şey taban çizgisindedir.
 */
export function scaleY(value: number, maxValue: number): number {
  if (maxValue <= 0) return CHART_BASELINE;
  const ratio = Math.min(Math.max(value / maxValue, 0), 1);
  return Math.round(CHART_BASELINE - ratio * (CHART_BASELINE - CHART_TOP));
}

/**
 * Seriyi kesintisiz parçalara böler. 🔴 IZN-F4b.2: `pick` `null` döndürürse (rol için gizli) o kova
 * için nokta ÜRETİLMEZ ve çizgi orada kesilir — `Number(null)` = 0 olduğundan nokta "0'a düşerdi"
 * ve eğri sahte bir sıfır hareketi gösterirdi.
 */
function toSegments(
  series: readonly CashFlowBucket[],
  pick: (bucket: CashFlowBucket) => string | null,
  monthLength: number,
  maxValue: number,
): ChartPoint[][] {
  const segments: ChartPoint[][] = [];
  let current: ChartPoint[] | null = null;
  for (const bucket of series) {
    const raw = pick(bucket);
    if (raw === null) {
      current = null;
      continue;
    }
    // M5_3 #363 — `Number()` sayıya çevrilemeyen bir değerde `NaN` üretirdi
    // ve SVG path dizesine "NaN" yazılırdı; `maxValue` hesabı zaten `amount()`
    // ile korunuyordu, y-koordinatı KORUNMUYORDU. Aynı savunmacı yardımcı.
    const point = {
      x: scaleX(dayOfMonth(bucket.day), monthLength),
      y: scaleY(amount(raw), maxValue),
    };
    if (current === null) {
      current = [point];
      segments.push(current);
    } else {
      current.push(point);
    }
  }
  return segments;
}

/**
 * DÜZ segment yolu (mockup E9:97-100 kübik `C` eğrileri çizer — ONAYLI SAPMA):
 * mockup'ın eğrisi UYDURMA veri üzerine çizilmiş dekoratif bir yumuşatmadır.
 * Seyrek gerçek veriyi yumuşatmak, olmayan günlere OLMAYAN değerler çizerdi —
 * bir para yüzeyinde kabul edilemez. Kalınlık/renk/dolgu/kesik desen E9'a
 * birebir uyar, yalnız ara nokta enterpolasyonu düzdür.
 */
export function toLinePath(points: readonly ChartPoint[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  if (first === undefined) return "";
  // Tek noktalı seri: `stroke-linecap="round"` sayesinde nokta olarak basılır.
  if (rest.length === 0) return `M${first.x},${first.y}L${first.x},${first.y}`;
  return `M${first.x},${first.y}` + rest.map((point) => `L${point.x},${point.y}`).join("");
}

/** E9:97/99 — çizgiyi taban çizgisine kapatan dolgu yolu. */
export function toAreaPath(points: readonly ChartPoint[]): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return "";
  return (
    `M${first.x},${CHART_FILL_BOTTOM}` +
    points.map((point) => `L${point.x},${point.y}`).join("") +
    `L${last.x},${CHART_FILL_BOTTOM}Z`
  );
}

/** Sunucu `Decimal`i string gönderir; sayıya çevrilemeyen değer 0 sayılır. */
function amount(raw: string | null): number {
  if (raw === null) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildCashFlowGeometry(
  series: readonly CashFlowBucket[],
  year: number,
  month: number,
): CashFlowGeometry {
  const monthLength = daysInMonth(year, month);
  // Eksen ölçeği YALNIZ sayısal değerlerden kurulur (gizli `null` tavanı etkilemez).
  const maxValue = series.reduce((max, bucket) => {
    const inflow = bucket.inflow === null ? 0 : amount(bucket.inflow);
    const outflow = bucket.outflow === null ? 0 : amount(bucket.outflow);
    return Math.max(max, inflow, outflow);
  }, 0);
  const inflowSegments = toSegments(series, (bucket) => bucket.inflow, monthLength, maxValue);
  const outflowSegments = toSegments(series, (bucket) => bucket.outflow, monthLength, maxValue);

  return {
    inflowPoints: inflowSegments.flat(),
    outflowPoints: outflowSegments.flat(),
    inflowSegments,
    outflowSegments,
    inflowLine: inflowSegments.map(toLinePath).join(""),
    inflowArea: inflowSegments.map(toAreaPath).join(""),
    outflowLine: outflowSegments.map(toLinePath).join(""),
    outflowArea: outflowSegments.map(toAreaPath).join(""),
  };
}
