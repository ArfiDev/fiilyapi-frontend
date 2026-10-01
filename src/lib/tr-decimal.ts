/**
 * 🔴 TÜRKÇE ONDALIK OKUMA KURALI — TEK YER (TKL-F2.3 · T30; ürün kararı değişirse yalnız burası çevrilir).
 *
 * Türkçe yazım: nokta = BİNLİK ayıracı, virgül = ondalık. Noktayla ayrılan her grup (ilk grup
 * hariç) TAM 3 hane değilse girdi BELİRSİZDİR ("28.5", "1.50", "28.5000") ve KAYDEDİLMEZ —
 * sessizce 28,50 ya da 2850 okumak yerine kullanıcıdan virgül istenir. Dönen değer kayıpsız
 * ondalık dizedir; `Number()` YOK.
 *
 * Referans/birim fiyat (`parseRefPriceInput`) ve miktar (`parseQuantityInput`) aynı gövdeyi
 * paylaşır; yalnız kesir tamamlama farkı vardır. A-s alanı bu kuralı KULLANMAZ
 * (`normalizeDecimalInput`: nokta ondalıktır).
 */

/** Belirsiz nokta kullanımında satır hatası (kullanıcı onaylı metin). */
export const REF_PRICE_AMBIGUOUS_DOT = "Ondalık için virgül kullanın (ör. 28,50)";

/** Binlik gruplu tamsayı: ilk grup serbest, sonrakiler TAM 3 hane ("28.500"). */
const THOUSANDS_GROUPED = /^\d+(\.\d{3})*$/;
const DIGITS_AND_DOTS = /^[\d.]+$/;
const DIGITS_ONLY = /^\d+$/;
/** Fiyat virgüllü girdide en az bu kadar kesir hanesine tamamlanır ("28,5" → "28.50"). */
const PRICE_MIN_FRACTION = 2;
/** Miktar tamamlanmaz ("1,5" → "1.5"). */
const QUANTITY_MIN_FRACTION = 0;

export type TrDecimalParse =
  | { kind: "ok"; value: string }
  | { kind: "ambiguous" }
  | { kind: "invalid" };

export type RefPriceParse = TrDecimalParse;

/** "1250,5000" → "1250,50": `minFraction`ı aşan SIFIR haneler atılır, anlamlı hane ASLA. */
function trimFraction(fraction: string, minFraction: number): string {
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed.padEnd(minFraction, "0").slice(0, Math.max(trimmed.length, minFraction));
}

function parseTurkishDecimal(raw: string, minFraction: number): TrDecimalParse {
  const text = raw.trim();
  const parts = text.split(",");
  if (parts.length > 2) return { kind: "invalid" };
  const [integerText = "", fractionText] = parts;
  if (fractionText !== undefined && !DIGITS_ONLY.test(fractionText)) return { kind: "invalid" };
  if (!DIGITS_AND_DOTS.test(integerText)) return { kind: "invalid" };
  if (!THOUSANDS_GROUPED.test(integerText)) return { kind: "ambiguous" };
  const whole = integerText.replace(/\./g, "").replace(/^0+(?=\d)/, "");
  if (fractionText === undefined) return { kind: "ok", value: whole };
  const fraction = trimFraction(fractionText, minFraction);
  return { kind: "ok", value: fraction === "" ? whole : `${whole}.${fraction}` };
}

/** Referans / birim fiyat: "28.500,75" → "28500.75"; virgüllü girdi en az 2 kesir haneye tamamlanır. */
export function parseRefPriceInput(raw: string): RefPriceParse {
  return parseTurkishDecimal(raw, PRICE_MIN_FRACTION);
}

/** Miktar: "1.500" → "1500", "1,5" → "1.5", "1.5" → belirsiz. Hane sınırı çağıranda (`splitDecimal`). */
export function parseQuantityInput(raw: string): TrDecimalParse {
  return parseTurkishDecimal(raw, QUANTITY_MIN_FRACTION);
}

/** Kayıpsız ondalık dizenin anlamlı tam ve kesir hane sayıları (sondaki kesir sıfırları sayılmaz). */
export function decimalDigitCounts(value: string): { integer: number; fraction: number } {
  const [whole = "", fraction = ""] = value.split(".");
  return { integer: whole.replace(/^0+/, "").length, fraction: fraction.replace(/0+$/, "").length };
}
