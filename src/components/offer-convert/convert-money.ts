/**
 * TKL-F5.2 · dönüştürme PARA türevleri (SAF, Decimal metin — `Number()` YOK).
 *
 * 🔴 Sözleşme bedeli: istemci `amount` GÖNDERMEZ (ÜS-F5-12); sunucu `Σ ROUND_HALF_UP(miktar × B.F., 0,01)` yazar
 * (`convert_service._item_total`/`_money`, SATIR BAŞI yuvarlama). Burada gösterilen Σ ile yazılan Σ BİREBİR aynı olmalı —
 * `convert-total.golden.json` (gerçek backend kodundan üretilmiş) bunu kanıtlar.
 */
import { divideDecimalStrings, compareDecimalStrings, multiplyDecimalStrings, sumDecimalStrings } from "@/lib/decimal";

/** `convert_service._AMOUNT_LIMIT` = 10^16 (`project_contracts.amount` Numeric(18,2)); Σ ≥ sınır → sunucu 422. */
export const CONVERT_AMOUNT_LIMIT = "10000000000000000";

const MONEY_SCALE = 2;
const PCT_SCALE = 1;
const HUNDRED = "100";
const ONE = "1";

/** Satır tutarı = ROUND_HALF_UP(miktar × B.F., 0,01). Girdiler kayıpsız ondalık metin. */
export function lineAmount(qty: string, unitPrice: string): string {
  const exact = multiplyDecimalStrings(qty, unitPrice);
  return divideDecimalStrings(exact, ONE, MONEY_SCALE) ?? "0.00";
}

/** Satır tutarlarının Σ'sı (her biri ZATEN satır başı yuvarlanmış). */
export function sumAmounts(amounts: readonly string[]): string {
  return sumDecimalStrings(amounts);
}

/** Σ ≥ 10^16 → sunucu "Kalem toplamı sözleşme bedeli sınırını aşıyor" der. */
export function isOverAmountLimit(total: string): boolean {
  return compareDecimalStrings(total, CONVERT_AMOUNT_LIMIT) >= 0;
}

/**
 * Fark % = (sözleşme − teklif) ÷ teklif × 100, 1 kesir ROUND_HALF_UP, işaretli ("-3.5"). Teklif 0 ise `null`
 * ("—": 0'a bölünemez; "0,0" basmak yalan olurdu).
 */
export function diffPercent(offerTotal: string, contractTotal: string): string | null {
  const difference = sumDecimalStrings([contractTotal, negate(offerTotal)]);
  const scaled = multiplyDecimalStrings(difference, HUNDRED);
  return divideDecimalStrings(scaled, offerTotal, PCT_SCALE);
}

/** KDV dahil = Σ + ROUND(Σ × KDV%) (= ROUND(Σ × (1 + KDV)): Σ kuruş hassasiyetli). */
export function grossWithVat(net: string, vatPct: string): string {
  const vat = divideDecimalStrings(multiplyDecimalStrings(net, vatPct), HUNDRED, MONEY_SCALE) ?? "0.00";
  return sumDecimalStrings([net, vat]);
}

function negate(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("-") ? trimmed.slice(1) : `-${trimmed}`;
}
