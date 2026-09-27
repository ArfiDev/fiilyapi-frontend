/**
 * EV (Planlama) sayılarının ORTAK girişi: backend Decimal alanları string,
 * istemci türevleri number gelebilir. İkisi de burada tek bir kayıpsız ondalık
 * string'e indirgenir; bant (`bands.ts`) ve biçim (`format.ts`) AYNI yuvarlamayı
 * buradan alır — K18 "renk ile metin hiç çelişmez" kuralının tek dayanağı budur.
 *
 * 🔴 `Math.round(v * 100) / 100` YASAK: `0.945 * 100 === 94.49999999999999`,
 * yani tam yarım AŞAĞI kayar ve ekran "0,94" yazıp bandı başka yerde "0,95"le
 * kurardı. Yuvarlama `divideDecimalStrings(x, "1", scale)` ile yapılır
 * (ROUND_HALF_UP, sıfırdan uzağa — Python `decimal`la aynı, backend paritesi).
 */
import {
  compareDecimalStrings,
  divideDecimalStrings,
  multiplyDecimalStrings,
  toDecimalString,
  type DecimalLike,
} from "@/lib/decimal";
import { asPercent, type Fraction, type Percent } from "@/lib/api/scale";

export type EvNumber = DecimalLike;

/** Geçerli bir ondalık string ya da `null` — genel `lib/decimal`dan (PLN-F2.1). */
export { toDecimalString };

/**
 * İki geçerli ondalık string'i kayıpsız karşılaştırır: −1 · 0 · 1 — genel
 * `lib/decimal`dan (FIX-F1: site-diary de EV'i import ETMEDEN aynısını kullanır).
 */
export { compareDecimalStrings };

/** ROUND_HALF_UP ile `scale` basamağa yuvarlar: "0.9450" @2 → "0.95". */
export function roundHalfUp(value: EvNumber, scale: number): string | null {
  const decimal = toDecimalString(value);
  return decimal === null ? null : divideDecimalStrings(decimal, "1", scale);
}

/**
 * 0–1 kesri puana/yüzdeye çevirir (×100), kayıpsız.
 *
 * TYPE-F1 SPIKE: imza `Fraction → Percent | null` — FIX-F1 Kusur 1'in
 * (kesir doğrudan yüzde sanılması) derleyici seviyesinde YAKALANMASI için.
 */
export function toPoints(value: Fraction | null | undefined): Percent | null {
  const decimal = toDecimalString(value);
  return decimal === null ? null : asPercent(multiplyDecimalStrings(decimal, "100"));
}
