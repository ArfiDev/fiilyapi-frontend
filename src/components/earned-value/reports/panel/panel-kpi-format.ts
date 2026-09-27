/**
 * PLN-F3.3 · KPI kartlarının SAF biçim yardımcıları (Panel:147-183).
 * Metin/karşılaştırma `lib/earned-value` biçimleyicilerinden geçer; `Number`
 * YALNIZ ilerleme çubuğunun CSS genişliği için (SVG'nin koordinat kuralıyla
 * AYNI gerekçe — görsel geometri, iş kararı DEĞİL).
 */
import { compareDecimalStrings, formatPf, toPoints, type PfBand } from "@/lib/earned-value";
import type { Fraction } from "@/lib/api/scale";

/**
 * Kazanılmış/Bütçe çubuğunun genişliği (%), 0–100 KIRPILIR.
 *
 * 🔴 LİDER DENETİMİ KUSURU (FIX-F1, Kusur 1) — backend `progress_pct_cum`
 * 0–1 KESİRdir (`schemas_reports.py`), bu fonksiyon ÖNCEDEN 0–100 YÜZDE
 * bekliyordu → çubuk hep %0 basıyordu. `toPoints` (×100, kayıpsız) ile
 * kesirden yüzdeye çevrilir; kırpma/karşılaştırma Decimal string üzerinde
 * (`compareDecimalStrings`), `Number` YALNIZ son CSS genişliği için.
 */
export function progressBarWidth(pct: Fraction | null): number {
  const points = toPoints(pct);
  if (points === null) return 0;
  const clampedLow = compareDecimalStrings(points, "0") < 0 ? "0" : points;
  const clampedHigh = compareDecimalStrings(clampedLow, "100") > 0 ? "100" : clampedLow;
  return Math.round(Number(clampedHigh));
}

export interface PfBandRange {
  redBelow: string;
  greenFrom: string;
}

/**
 * 🔴 LİDER DENETİMİ KUSURU (Panel ana kare, 2. tur) — mockup `row()`/`renderVals()`
 * (Panel.dc.html:513/524) TEK bir `devFg` kuralı paylaşır: `dev < -2 ? kırmızı
 * : dev > 2 ? yeşil : gri` — `dev` YÜZDE PUANI birimidir (0-100 ölçek, ör.
 * "-2,6"). Proje çapındaki `variance` alanı 0-1 KESİRdir (`toPoints` ×100
 * çevirir) → eşik burada KESİR biriminde `±0.02`dir. KPI 1 kartı ÖNCEDEN
 * SABİT gri basıyordu (eşik hiç uygulanmamıştı); disiplin tablosunun "Sapma"
 * kolonu (`panel-columns.tsx`) ise SIFIR eşiğiyle (her negatif = kırmızı)
 * YANLIŞ ayrı bir kural kullanıyordu — İKİSİ DE AYNI mockup kaynağından
 * geldiği için TEK yerden (burada) paylaşılır.
 */
const VARIANCE_RED_BELOW = "-0.02";
const VARIANCE_GREEN_ABOVE = "0.02";

export type VarianceTone = "negative" | "positive" | "neutral";

export function varianceTone(variance: string | null): VarianceTone {
  if (variance === null) return "neutral";
  if (compareDecimalStrings(variance, VARIANCE_RED_BELOW) < 0) return "negative";
  if (compareDecimalStrings(variance, VARIANCE_GREEN_ABOVE) > 0) return "positive";
  return "neutral";
}

/**
 * PLN-F3.6b LİDER PLANI §1.1 · "KPI 2 Küm. PF (kart zemini bant) + 'Sarı
 * bant · 0,95–1,00'" — KPI 2/3'ün ALT satırı, mockup `pfc()`nin metniyle
 * BİREBİR. Eşikler `pf_bands`ten gelir (uydurma sabit YOK); `band==="none"`
 * (veri yok) ya da `"high"` (küm./hafta PF ayarında üst kademe TANIMSIZ —
 * `PfBandSettings.weekly` `highAbove` TAŞIMAZ) → `null`, alt satır basılmaz.
 *
 * 🔴 LİDER DÜZELTMESİ: "≥" (U+2265) `symbol-subset-guard`ın İZİN
 * LİSTESİNDE DEĞİL (§3.6) — QURR'un kendi lejantındaki ("PF bantları <0,95
 * kırmızı · 0,95–1,00 sarı · 1,00 ve üstü yeşil", `QurrPrintView.tsx`/
 * `WeeklyQurrScreen.tsx`) "1,00 ve üstü" ifadesiyle BİREBİR eşlendi. ASCII
 * "<" glif alt kümesi taramasının KAPSAMI DIŞINDA (yalnız U+00A0 üstü
 * kod noktaları taranır) — `symbol-subset-guard.test.ts` ile ÖLÇÜLDÜ.
 */
export function pfBandDescription(band: PfBand, range: PfBandRange): string | null {
  if (band === "red") return `Kırmızı bant · < ${formatPf(range.redBelow)}`;
  if (band === "amber") return `Sarı bant · ${formatPf(range.redBelow)}–${formatPf(range.greenFrom)}`;
  if (band === "green") return `Yeşil bant · ${formatPf(range.greenFrom)} ve üstü`;
  return null;
}
