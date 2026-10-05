import { parseOverheadPct, parseProfitPct, pctToInputText, type PctParse } from "@/components/offers/offer-form";
import { EMPTY_CELL } from "@/lib/format";
import { compareDecimalStrings } from "@/lib/decimal";

/**
 * TKL-F4.5 · şablon varsayılan oranları (GG / Kâr) — T30 Türkçe ondalık.
 *
 * TKL-F4.8: doğrulama `offer-form.ts`teki TEK ayrıştırıcıdan gelir (`parseOverheadPct`/`parseProfitPct`);
 * burada yalnız "boş metin = oran YOK (teklif ayarı geçerli olur) → `null`" kuralı vardır.
 */
export type RateField = "overhead" | "profit";

export type RatesParse =
  | { ok: true; overhead: string | null; profit: string | null }
  | { ok: false; errors: Partial<Record<RateField, string>> };

type OneRate = { value: string | null } | { error: string };

function parseOne(text: string, parse: (text: string) => PctParse): OneRate {
  return text.trim() === "" ? { value: null } : parse(text);
}

export function parseTemplateRates(overheadText: string, profitText: string): RatesParse {
  const overhead = parseOne(overheadText, parseOverheadPct);
  const profit = parseOne(profitText, parseProfitPct);
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

/** IZN-F4.3: ayar oranları `maliyet_kar` gizli rolde `null` döner → "—" (uydurma/sıfır YOK). */
export interface RateDefaults {
  default_overhead_pct: string | null;
  default_profit_pct: string | null;
}

function rateText(own: string | null, fallback: string | null | undefined): string {
  if (own !== null) return `%${pctToInputText(own)}`;
  return fallback === undefined || fallback === null ? EMPTY_CELL : `%${pctToInputText(fallback)} (ayar)`;
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
