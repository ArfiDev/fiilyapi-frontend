/**
 * EV (Planlama) sayı biçimleri — mockup'ların `nf`/`sgn`/`dec` yardımcılarının
 * ürün karşılığı. Hepsi `decimal-input.ts`in ROUND_HALF_UP yuvarlamasından
 * geçer; `pfBand()` da aynı yuvarlamayı kullandığı için metin ile renk
 * çelişmez (spec §3.8 K18). Boş değer ürün kanonu `EMPTY_CELL` (K20).
 *
 * Genel `lib/format.ts` biçimleyicileri burada YETMEZ: `formatDecimal` yalnız
 * `maximumFractionDigits` kullanır ("1,00" → "1"), `formatPercent` girdiyi
 * zaten yüzde sayar ve sondaki sıfırı atar ("%52,0" → "%52").
 */
import { divideDecimalStrings } from "@/lib/decimal";
import { EMPTY_CELL } from "@/lib/format";

import { roundHalfUp, toDecimalString, toPoints, type EvNumber } from "./decimal-input";
import { asFractionOrNull, type Fraction } from "@/lib/api/scale";

const LOCALE = "tr-TR";
const MINUS_SIGN = "−";
const PF_DIGITS = 2;
const PERCENT_DEFAULT_DIGITS = 1;
const VARIANCE_DIGITS = 1;
/** Birim oran: bu değer ve üstü 1 ondalık, altı 2 (KAT:410 `dec` · Q:318-321). */
const UNIT_RATE_WIDE_FROM = 10;
const UNIT_RATE_WIDE_DIGITS = 1;
const UNIT_RATE_NARROW_DIGITS = 2;

/** Zaten yuvarlanmış ondalık string'i sabit basamakla tr-TR basar. */
function formatFixed(rounded: string, digits: number): string {
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(rounded));
}

/**
 * LİDER TALEBİ (ORTAK, 2026-09-26) — sabit basamaklı ondalık biçimleyici,
 * `formatPf`in AYNI `roundHalfUp` + `formatFixed` deseni genel `digits`
 * parametresiyle: "2.0" (digits=1) → "2,0" · "520" (digits=1) → "520,0".
 * `Number()` YOK (yalnız `formatFixed` içindeki `Intl.NumberFormat.format`
 * ÇAĞRISI — o da zaten ROUND_HALF_UP'tan geçmiş bir STRING alır, yeniden
 * yuvarlamaz). B'nin `qurr formatFixedQuantity`si ve C'nin tolerans
 * etiketi BURADAN çağıracak (kopya YOK).
 */
export function formatFixedDecimal(value: EvNumber, digits: number): string {
  const rounded = roundHalfUp(value, digits);
  return rounded === null ? EMPTY_CELL : formatFixed(rounded, digits);
}

/** PF: sabit 2 ondalık — "0,97" · "1,00". */
export function formatPf(value: EvNumber): string {
  const rounded = roundHalfUp(value, PF_DIGITS);
  return rounded === null ? EMPTY_CELL : formatFixed(rounded, PF_DIGITS);
}

/**
 * 0–1 kesir → "%45,9" (sabit `digits` ondalık, sondaki sıfır korunur).
 *
 * TYPE-F1 SPIKE: imza `Fraction → string` — FIX-F1 Kusur 1'in (bir yüzdenin
 * yanlışlıkla buraya verilmesi) derleyici seviyesinde YAKALANMASI için.
 */
export function formatPercent01(
  value: Fraction | null | undefined,
  digits: number = PERCENT_DEFAULT_DIGITS,
): string {
  const rounded = roundHalfUp(toPoints(value), digits);
  return rounded === null ? EMPTY_CELL : `%${formatFixed(rounded, digits)}`;
}

/** 0–1 sapma → işaretli puan "−2,6" · "+1,6"; yuvarlanınca sıfırsa "0,0". */
/**
 * `digits` VARSAYILANI `VARIANCE_DIGITS` (1) — geriye uyumlu, mevcut
 * çağıranlar (Panel/QURR) davranışı DEĞİŞMEZ. PLN-F3.6b lider talebi: GİR
 * trend "Fark (puan)" satırı 2 hane istiyor (`formatVariancePoints(v, 2)`).
 */
export function formatVariancePoints(value: EvNumber, digits: number = VARIANCE_DIGITS): string {
  const rounded = roundHalfUp(toPoints(asFractionOrNull(value)), digits);
  if (rounded === null) return EMPTY_CELL;
  const magnitude = formatFixed(rounded.replace(/^-/, ""), digits);
  if (Number(rounded) === 0) return magnitude;
  return `${rounded.startsWith("-") ? MINUS_SIGN : "+"}${magnitude}`;
}

/** Birim oran (a-s/birim): ≥ 10 → 1 ondalık, aksi 2. Eşik HAM değere bakar. */
export function formatUnitRate(value: EvNumber): string {
  const decimal = toDecimalString(value);
  if (decimal === null) return EMPTY_CELL;
  const isWide = Math.abs(Number(decimal)) >= UNIT_RATE_WIDE_FROM;
  const digits = isWide ? UNIT_RATE_WIDE_DIGITS : UNIT_RATE_NARROW_DIGITS;
  return formatFixed(divideDecimalStrings(decimal, "1", digits) ?? decimal, digits);
}

/** Rüzgâr m/s → "18 km/sa" — genel `lib/format`a taşındı (PLN-F2.1, §2.7); EV çağıranları için yeniden ihraç. */
export { formatWindKmh } from "@/lib/format";
