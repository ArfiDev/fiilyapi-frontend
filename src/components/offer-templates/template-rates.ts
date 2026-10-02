import { OFFER_FORM_MESSAGES, pctToInputText } from "@/components/offers/offer-form";
import { EMPTY_CELL } from "@/lib/format";
import { compareDecimalStrings } from "@/lib/decimal";
import { REF_PRICE_AMBIGUOUS_DOT, decimalDigitCounts, parseQuantityInput } from "@/lib/tr-decimal";

/**
 * TKL-F4.5 · şablon varsayılan oranları (GG / Kâr) — T30 Türkçe ondalık.
 *
 * F3 `offer-form.ts` aynı doğrulamayı yapar ama tek-alan ayrıştırıcısı (`parsePct`) DIŞA AÇIK DEĞİL ve dosya
 * F4.7'nin; bu modül AYNI ilkelleri (`parseQuantityInput`, `decimalDigitCounts`) ve AYNI metinleri
 * (`OFFER_FORM_MESSAGES`) kullanır. Sınırlar backend `Numeric(5,2)`/`(6,2)` ile aynıdır. Boş metin = oran
 * YOK (teklif ayarı geçerli olur) → `null`.
 */
const MAX_OVERHEAD_PCT = "100";
const MAX_PROFIT_PCT = "999.99";
const MAX_FRACTION_DIGITS = 2;

export type RateField = "overhead" | "profit";

export type RatesParse =
  | { ok: true; overhead: string | null; profit: string | null }
  | { ok: false; errors: Partial<Record<RateField, string>> };

type OneRate = { value: string | null } | { error: string };

function parseOne(text: string, max: string, rangeMessage: string): OneRate {
  if (text.trim() === "") return { value: null };
  const parsed = parseQuantityInput(text);
  if (parsed.kind === "ambiguous") return { error: REF_PRICE_AMBIGUOUS_DOT };
  if (parsed.kind === "invalid") return { error: OFFER_FORM_MESSAGES.pctInvalid };
  if (decimalDigitCounts(parsed.value).fraction > MAX_FRACTION_DIGITS) return { error: OFFER_FORM_MESSAGES.pctFraction };
  if (compareDecimalStrings(parsed.value, max) > 0) return { error: rangeMessage };
  return { value: parsed.value };
}

export function parseTemplateRates(overheadText: string, profitText: string): RatesParse {
  const overhead = parseOne(overheadText, MAX_OVERHEAD_PCT, OFFER_FORM_MESSAGES.pctRange100);
  const profit = parseOne(profitText, MAX_PROFIT_PCT, OFFER_FORM_MESSAGES.pctRangeProfit);
  const errors: Partial<Record<RateField, string>> = {
    ...("error" in overhead ? { overhead: overhead.error } : {}),
    ...("error" in profit ? { profit: profit.error } : {}),
  };
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    overhead: "value" in overhead ? overhead.value : null,
    profit: "value" in profit ? profit.value : null,
  };
}

export interface RateDefaults {
  default_overhead_pct: string;
  default_profit_pct: string;
}

function rateText(own: string | null, fallback: string | undefined): string {
  if (own !== null) return `%${pctToInputText(own)}`;
  return fallback === undefined ? EMPTY_CELL : `%${pctToInputText(fallback)} (ayar)`;
}

/** TS:326 "GG %12 · K %15"; boş oran → teklif ayarı değeri + "(ayar)" (ÜS-F4-6), ayar yoksa "—". */
export function formatTemplateRates(overhead: string | null, profit: string | null, defaults: RateDefaults | null): string {
  return `GG ${rateText(overhead, defaults?.default_overhead_pct)} · K ${rateText(profit, defaults?.default_profit_pct)}`;
}

/** Ondalık eşitlik ("10" = "10.00"); `null` (oran yok) yalnız `null`a eşittir. */
export function ratesDiffer(wanted: string | null, current: string | null): boolean {
  if (wanted === null || current === null) return wanted !== current;
  return compareDecimalStrings(wanted, current) !== 0;
}
