import { normalizeDecimalInput } from "@/lib/decimal";

/** openapi `standard_unit_mhr` deseni: ≤ 8 tam + ≤ 4 kesir basamağı. */
const RATE_INTEGER_DIGITS = 8;
const RATE_FRACTION_DIGITS = 4;

/**
 * Standart oran (a-s/birim) doğrulaması — iki katalog ekranının TEK kuralı.
 * `requiredMessage` ekrana göre değişir (KAT "Standart oran zorunlu · …",
 * İş Kalemi Kataloğu "A-s zorunlu · …"); sınır metinleri ortaktır.
 */
export function standardRateError(raw: string, requiredMessage: string): string | undefined {
  const normalized = normalizeDecimalInput(raw);
  if (normalized === null || !(Number(normalized) > 0)) return requiredMessage;
  const [whole = "", fraction = ""] = normalized.replace(/^[-+]/, "").split(".");
  if (fraction.length > RATE_FRACTION_DIGITS) return "En fazla 4 ondalık";
  if (whole.replace(/^0+/, "").length > RATE_INTEGER_DIGITS) return "En fazla 8 basamak";
  return undefined;
}
