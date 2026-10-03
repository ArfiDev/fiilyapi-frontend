import { parseEmployerQuantity } from "@/components/contract-item-form/validate";
import { formatQuantity } from "@/lib/format";
import { REF_PRICE_AMBIGUOUS_DOT, decimalDigitCounts, parseQuantityInput } from "@/lib/tr-decimal";

// TKL-F7b/F8 (T30/T42/T43) · İŞVEREN ve TAŞERON hakedişinde miktar ve katsayı TÜRKÇE okunur (nokta
// binlik, virgül ondalık; belirsiz "1.5" reddedilir) — ayrıştırma `lib/tr-decimal.ts` TEK kaynağından,
// iki form da BU modülü kullanır. Hücre/alan state'i EKRAN METNİDİR ("12,5"); gövdeye yalnız buradaki
// ayrıştırıcılar nokta-ondalık METİN olarak çevirir (`Number()` turu YOK).

export type TrFieldParse = { kind: "ok"; value: string } | { kind: "error"; message: string };

/** Yazarken süzgeç: rakam, nokta ve EN FAZLA bir virgül kalır (Türkçe giriş bozulmaz). */
export function sanitizeTrDecimalInput(raw: string): string {
  const kept = raw.replace(/[^0-9.,]/g, "");
  const firstComma = kept.indexOf(",");
  if (firstComma === -1) return kept;
  return kept.slice(0, firstComma + 1) + kept.slice(firstComma + 1).replace(/,/g, "");
}

/**
 * Hakediş miktarı (işveren hücresi / taşeron satırı): boş → "0" (0 hakedişte MEŞRU), aksi halde T30 + `Numeric(14,3)` sınırları (en çok
 * 3 ondalık, 11 basamak; mesajlar `parseEmployerQuantity` ile aynı). Sıfır değeri kabul edilir
 * ("0,000" → "0"); işveren sözleşme kalemi kuralından (sıfırdan büyük) tek farkı budur.
 */
export function parsePaymentQuantity(raw: string): TrFieldParse {
  const text = raw.trim();
  if (text === "") return { kind: "ok", value: "0" };
  const parsed = parseQuantityInput(text);
  if (parsed.kind === "ok" && !/[1-9]/.test(parsed.value)) return { kind: "ok", value: "0" };
  const result = parseEmployerQuantity(text);
  return result.kind === "error"
    ? { kind: "error", message: result.problem.message }
    : { kind: "ok", value: result.value };
}

const COEFFICIENT_TOO_BIG = "Katsayı çok büyük, ondalık için virgül kullanın";
const COEFFICIENT_NOT_POSITIVE = "Katsayı sıfırdan büyük olmalıdır";
const COEFFICIENT_NOT_A_NUMBER = "Katsayı sayı olmalıdır.";
/** Backend `default_coefficient` `Numeric(8,3)`; mesaj miktarla aynı metin. */
const COEFFICIENT_FRACTION_LIMIT = "En fazla 3 ondalık";
const COEFFICIENT_MAX_FRACTION = 3;
/** Dn/D0 katsayısı için kullanıcı onaylı üst sınır (T43): 10 dahil geçerli. */
const COEFFICIENT_MAX = 10;
const COEFFICIENT_MAX_WHOLE_DIGITS = 2;

/**
 * Fiyat farkı katsayısı: boş → "1" (mevcut davranış); T30 okuması (kesir tamamlanmaz); ayrıştırılmış
 * değer 10'dan büyükse ("1.052" binlik tuzağı → 1052) reddedilir.
 */
export function parsePaymentCoefficient(raw: string): TrFieldParse {
  const text = raw.trim();
  if (text === "") return { kind: "ok", value: "1" };
  const isNegative = text.startsWith("-");
  const parsed = parseQuantityInput(isNegative ? text.slice(1) : text);
  if (parsed.kind === "ambiguous") return { kind: "error", message: REF_PRICE_AMBIGUOUS_DOT };
  if (parsed.kind === "invalid") return { kind: "error", message: COEFFICIENT_NOT_A_NUMBER };
  if (isNegative || !/[1-9]/.test(parsed.value)) {
    return { kind: "error", message: COEFFICIENT_NOT_POSITIVE };
  }
  const [whole = "0", fraction = ""] = parsed.value.split(".");
  if (decimalDigitCounts(parsed.value).fraction > COEFFICIENT_MAX_FRACTION) {
    return { kind: "error", message: COEFFICIENT_FRACTION_LIMIT };
  }
  const isOverMax =
    whole.length > COEFFICIENT_MAX_WHOLE_DIGITS ||
    Number(whole) > COEFFICIENT_MAX ||
    (Number(whole) === COEFFICIENT_MAX && /[1-9]/.test(fraction));
  if (isOverMax) return { kind: "error", message: COEFFICIENT_TOO_BIG };
  return { kind: "ok", value: parsed.value };
}

/** Ekran metnini ("1.234,5") salt-okunur gösterim için biçimler; okunamazsa ham metni basar. */
export function formatTrQuantityText(raw: string): string {
  const parsed = parsePaymentQuantity(raw);
  return parsed.kind === "ok" ? formatQuantity(parsed.value) : raw;
}
