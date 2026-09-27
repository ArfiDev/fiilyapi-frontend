// TEST-F2 Ajan B — alan başına ölçek iddiaları (emir §Katman 2, madde 4;
// lider güncellemesi: bayrağa göre sınırlar).
//
// Gözlenen değerler string Decimal olabilir (backend Decimal'i JSON'a string
// basabilir) — karşılaştırma bir ARALIK kontrolü olduğu için `Number(...)`
// burada kabul edilir (kesinlik kaybı önemsiz, yalnız kaba ölçek hatası
// yakalanır — ör. ×100 hatası 0.75 → 75).
import type { Scale, ScaleFlag, ScaleRow } from "@/lib/api/scale-table";

export interface ScaleViolation {
  schema: string;
  field: string;
  scale: Scale;
  value: unknown;
  url: string;
  message: string;
}

// fraction sınırları
const FRACTION_MAX_DEFAULT = 1;
const FRACTION_MAX_ABOVE_ONE_OK = 5;
const FRACTION_MIN_DEFAULT = 0;
const FRACTION_MIN_NEGATIVE_OK = -5;

// percent sınırları
const PERCENT_MAX_DEFAULT = 100;
const PERCENT_MAX_ABOVE_100_OK = 10_000;
const PERCENT_MIN_DEFAULT = 0;
const PERCENT_MIN_NEGATIVE_OK = -10_000;

// factor sınırları (bayraklardan etkilenmez — emirde değişmedi)
const FACTOR_MAX = 10;

function hasFlag(row: ScaleRow, flag: ScaleFlag): boolean {
  return (row.flags ?? []).includes(flag);
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Bir (satır, gözlenen-değerler, url) üçlüsünü satırın `scale`ine göre
 * doğrular. Değeri sayıya çevrilemeyen (null/undefined/string-olmayan)
 * gözlemler SESSİZCE atlanır — bunlar zaten "değer yok" durumudur, ölçek
 * ihlali değildir.
 */
export function checkScaleRow(
  row: ScaleRow,
  values: readonly unknown[],
  url: string,
  allowedEnumValues?: readonly unknown[],
): ScaleViolation[] {
  switch (row.scale) {
    case "fraction":
      return checkFraction(row, values, url);
    case "percent":
      return checkPercent(row, values, url);
    case "factor":
      return checkFactor(row, values, url);
    case "enum":
      return checkEnum(row, values, url, allowedEnumValues);
    case "not-scale":
      return [];
    default: {
      const exhaustive: never = row.scale;
      throw new Error(`bilinmeyen scale: ${String(exhaustive)}`);
    }
  }
}

function checkFraction(row: ScaleRow, values: readonly unknown[], url: string): ScaleViolation[] {
  const max = hasFlag(row, "fractionAboveOneOk") ? FRACTION_MAX_ABOVE_ONE_OK : FRACTION_MAX_DEFAULT;
  const min = hasFlag(row, "negativeOk") ? FRACTION_MIN_NEGATIVE_OK : FRACTION_MIN_DEFAULT;
  const violations: ScaleViolation[] = [];
  for (const raw of values) {
    const n = toNumber(raw);
    if (n === null) continue;
    if (n < min || n > max) {
      violations.push({
        schema: row.schema,
        field: row.field,
        scale: row.scale,
        value: raw,
        url,
        message: `${row.schema}.${row.field} · fraction · ${n} aralık dışı (${min} <= v <= ${max}, bayraklar: ${(row.flags ?? []).join(",") || "yok"}) · (×100 ölçek hatası olabilir) · ${url}`,
      });
    }
  }
  return violations;
}

function checkPercent(row: ScaleRow, values: readonly unknown[], url: string): ScaleViolation[] {
  const max = hasFlag(row, "percentAbove100Ok") ? PERCENT_MAX_ABOVE_100_OK : PERCENT_MAX_DEFAULT;
  const min = hasFlag(row, "negativeOk") ? PERCENT_MIN_NEGATIVE_OK : PERCENT_MIN_DEFAULT;
  const violations: ScaleViolation[] = [];
  const numbers: number[] = [];
  for (const raw of values) {
    const n = toNumber(raw);
    if (n === null) continue;
    numbers.push(n);
    if (n < min || n > max) {
      violations.push({
        schema: row.schema,
        field: row.field,
        scale: row.scale,
        value: raw,
        url,
        message: `${row.schema}.${row.field} · percent · ${n} aralık dışı (${min} <= v <= ${max}, bayraklar: ${(row.flags ?? []).join(",") || "yok"}) · ${url}`,
      });
    }
  }

  // Ek kural: en az bir değer |v| > 1 olmalı (÷100 ters ölçek hatasını yakalar) —
  // percentBelowOneOk bayrağı bu kuralı atlatır.
  if (!hasFlag(row, "percentBelowOneOk") && numbers.length > 0) {
    const hasAboveOne = numbers.some((n) => Math.abs(n) > 1);
    if (!hasAboveOne) {
      violations.push({
        schema: row.schema,
        field: row.field,
        scale: row.scale,
        value: numbers,
        url,
        message: `${row.schema}.${row.field} · percent · gözlenen tüm değerler |v| <= 1 (÷100 ters ölçek hatası olabilir) · ${url}`,
      });
    }
  }
  return violations;
}

function checkFactor(row: ScaleRow, values: readonly unknown[], url: string): ScaleViolation[] {
  const violations: ScaleViolation[] = [];
  for (const raw of values) {
    const n = toNumber(raw);
    if (n === null) continue;
    if (!(n > 0 && n <= FACTOR_MAX)) {
      violations.push({
        schema: row.schema,
        field: row.field,
        scale: row.scale,
        value: raw,
        url,
        message: `${row.schema}.${row.field} · factor · ${n} aralık dışı (0 < v <= ${FACTOR_MAX}) · ${url}`,
      });
    }
  }
  return violations;
}

function checkEnum(row: ScaleRow, values: readonly unknown[], url: string, allowed?: readonly unknown[]): ScaleViolation[] {
  if (!allowed) return [];
  const violations: ScaleViolation[] = [];
  for (const raw of values) {
    if (raw === null || raw === undefined) continue;
    if (!allowed.includes(raw)) {
      violations.push({
        schema: row.schema,
        field: row.field,
        scale: row.scale,
        value: raw,
        url,
        message: `${row.schema}.${row.field} · enum · "${String(raw)}" openapi enum üyesi değil (izinli: ${allowed.join(", ")}) · ${url}`,
      });
    }
  }
  return violations;
}

/** enum iddiası için openapi `enum` listesi dışarıdan verilir (schema-walker açığa çıkarmaz). */
export function checkEnumRow(
  row: ScaleRow,
  values: readonly unknown[],
  url: string,
  allowed: readonly unknown[],
): ScaleViolation[] {
  return checkEnum(row, values, url, allowed);
}
