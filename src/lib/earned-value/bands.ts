/**
 * EV (Planlama) renk bantları — saf fonksiyonlar, ekranlardan bağımsız.
 *
 * Kaynaklar: `PLANLAMA-SPEC.md` §3.5 (durum), §3.6 (PF bantları), §3.7 S6
 * (günlük şüpheli-yüksek bandı), §3.8 K6 (tolerans 2,0), K18 (bant GÖSTERİLEN
 * değere uygulanır), K19 (kümülatif PF haftalık bantları kullanır), K27 (sapma
 * durumu da GÖSTERİLEN değerle).
 * Mockup'lardaki `pfc()` (Planlama - Panel.dc.html:457-463, QURR:267,
 * Günlük İlerleme Raporu:433, Günlük Kayıt (İlerleme):587) bandı HAM değerle,
 * metni yuvarlanmış değerle kuruyordu → "0,95" yazıp kırmızı boyuyordu.
 * Burada bant, `formatPf` ile AYNI yuvarlamadan geçen değere uygulanır.
 */
import {
  compareDecimalStrings,
  roundHalfUp,
  toDecimalString,
  toPoints,
  type EvNumber,
} from "./decimal-input";
import { asFractionOrNull } from "@/lib/api/scale";

/** Karşılaştırma basamağı = PF'nin gösterim basamağı (K18). */
const PF_DISPLAY_SCALE = 2;

export type PfBandKind = "daily" | "weekly" | "cumulative";
export type PfBand = "red" | "amber" | "green" | "high" | "none";

export interface PfThresholds {
  /** Bu değerin ALTI kırmızı. */
  redBelow: string;
  /** Bu değer ve ÜSTÜ yeşil; arası sarı. */
  greenFrom: string;
}

export interface DailyPfThresholds extends PfThresholds {
  /**
   * Bu değerin ÜSTÜ "şüpheli yüksek" (bilgi tonu, K19). `null` → "high" bandı
   * HİÇ üretilmez (PLN-F3.1: rapor `pf_bands.daily.high_above` backend'de
   * nullable — ayar ekranındaki gibi HER ZAMAN dolu değildir).
   */
  highAbove: string | null;
}

export interface PfBandSettings {
  daily: DailyPfThresholds;
  /** Haftalık ve kümülatif PF (K19). */
  weekly: PfThresholds;
}

/**
 * Günlük varsayılan §3.7 S6 lafzıdır (§3.10 F0-1): 0,95–1,05 yeşil, üstü
 * "şüpheli yüksek" — varsayılanda SARI YOK. Ayarda `greenFrom` yükseltilirse
 * sarı bölge doğar. Haftalık/kümülatif §3.6'daki gibi 0,95 / 1,00.
 */
export const DEFAULT_PF_BANDS: PfBandSettings = {
  daily: { redBelow: "0.95", greenFrom: "0.95", highAbove: "1.05" },
  weekly: { redBelow: "0.95", greenFrom: "1.00" },
};

export function pfBand(value: EvNumber, bands: PfBandSettings, kind: PfBandKind): PfBand {
  const shown = roundHalfUp(value, PF_DISPLAY_SCALE);
  if (shown === null) return "none";

  const thresholds = kind === "daily" ? bands.daily : bands.weekly;
  if (compareDecimalStrings(shown, thresholds.redBelow) < 0) return "red";
  if (compareDecimalStrings(shown, thresholds.greenFrom) < 0) return "amber";
  if (
    kind === "daily" &&
    bands.daily.highAbove !== null &&
    compareDecimalStrings(shown, bands.daily.highAbove) > 0
  )
    return "high";
  return "green";
}

export type VarianceStatus = "ahead" | "normal" | "late" | "none";

/** Sapmanın gösterim basamağı (puan, `formatVariancePoints`) — K27. */
const VARIANCE_DISPLAY_SCALE = 1;

/**
 * `variance` 0–1 kesir (spec §3.6), `tolerancePoints` PUAN (ayar, K6).
 * K27: sapma puana çevrilip 1 ondalığa ROUND_HALF_UP yuvarlanır (ekranda
 * basılan değer), SONRA tolerans karşılaştırılır — "−2,0" yazıp Geride
 * boyamaz. Sınır dahil Normal: |gösterilen sapma| ≤ tolerans.
 */
export function varianceStatus(variance: EvNumber, tolerancePoints: EvNumber): VarianceStatus {
  const shown = roundHalfUp(toPoints(asFractionOrNull(variance)), VARIANCE_DISPLAY_SCALE);
  const tolerance = toDecimalString(tolerancePoints)?.replace(/^[-+]/, "") ?? null;
  if (shown === null || tolerance === null) return "none";

  if (compareDecimalStrings(shown, tolerance) > 0) return "ahead";
  if (compareDecimalStrings(shown, `-${tolerance}`) < 0) return "late";
  return "normal";
}
