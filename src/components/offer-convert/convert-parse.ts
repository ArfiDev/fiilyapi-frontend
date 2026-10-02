/**
 * TKL-F5.2 · dönüştürme kutularının AYRIŞTIRICISI (SAF). Kural TEK kaynak: `lib/tr-decimal` (T30 — nokta binlik, virgül ondalık,
 * belirsiz "28.5" KAYDEDİLMEZ). Sınırlar backend `Quantity` (>0, ≤3 ondalık, ≤1e9) ve `UnitPrice` (≥0, ≤2 ondalık, ≤1e12);
 * `lib/offer-limits` tek kaynağından — sunucu 422'si GÖNDERİM ÖNCESİ önlenir. Sonuç kayıpsız ondalık METİN (`Number()` YOK).
 */
import { compareDecimalStrings, isZeroDecimalString } from "@/lib/decimal";
import {
  OFFER_PRICE_LIMITS,
  OFFER_QUANTITY_LIMITS,
  fractionLimitMessage,
  maxLimitMessage,
  type DecimalLimits,
} from "@/lib/offer-limits";
import {
  REF_PRICE_AMBIGUOUS_DOT,
  decimalDigitCounts,
  parseQuantityInput,
  parseRefPriceInput,
  type TrDecimalParse,
} from "@/lib/tr-decimal";

export type ParsedField = { ok: true; value: string } | { ok: false; message: string };

const QTY_LABEL = "Miktar";
const PRICE_LABEL = "Birim fiyat";

interface FieldSpec {
  label: string;
  parse: (raw: string) => TrDecimalParse;
  limits: DecimalLimits;
  mustBePositive: boolean;
}

const fail = (message: string): ParsedField => ({ ok: false, message });

function parseField(raw: string, spec: FieldSpec): ParsedField {
  const text = raw.trim();
  if (text === "") return fail(`${spec.label} girin`);
  const isNegative = text.startsWith("-");
  const parsed = spec.parse(isNegative ? text.slice(1) : text);
  if (parsed.kind === "ambiguous") return fail(REF_PRICE_AMBIGUOUS_DOT);
  if (parsed.kind === "invalid") return fail(`${spec.label} sayı olmalıdır.`);
  if (isNegative) return fail(spec.mustBePositive ? `${spec.label} 0'dan büyük olmalı` : `${spec.label} negatif olamaz.`);
  if (decimalDigitCounts(parsed.value).fraction > spec.limits.fraction) return fail(fractionLimitMessage(spec.limits));
  if (compareDecimalStrings(parsed.value, spec.limits.max) > 0) return fail(maxLimitMessage(spec.limits));
  if (spec.mustBePositive && isZeroDecimalString(parsed.value)) return fail(`${spec.label} 0'dan büyük olmalı`);
  return { ok: true, value: parsed.value };
}

const QTY_SPEC: FieldSpec = {
  label: QTY_LABEL,
  parse: parseQuantityInput,
  limits: OFFER_QUANTITY_LIMITS,
  mustBePositive: true,
};
const PRICE_SPEC: FieldSpec = {
  label: PRICE_LABEL,
  parse: parseRefPriceInput,
  limits: OFFER_PRICE_LIMITS,
  mustBePositive: false,
};

/** Miktar kutusu: ZORUNLU, > 0, ≤ 3 ondalık, ≤ 1e9. */
export function parseQty(raw: string): ParsedField {
  return parseField(raw, QTY_SPEC);
}

/** Birim fiyat kutusu: ZORUNLU (fiyatsız kalem boş başlar, ÜS-F5-16), ≥ 0, ≤ 2 ondalık, ≤ 1e12. */
export function parseUnitPrice(raw: string): ParsedField {
  return parseField(raw, PRICE_SPEC);
}
