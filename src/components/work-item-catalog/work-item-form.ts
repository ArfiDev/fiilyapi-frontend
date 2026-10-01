/**
 * TKL-F1.3 · İş Kalemi Kataloğu satır içi formunun saf durumu (KIK:149-176, :260-275).
 *
 * Fiyat ve A-s METİN olarak taşınır (TR virgülü); gövdeye `normalizeDecimalInput`
 * ile KAYIPSIZ ondalık string gider — `Number()`'a çevrilip geri yazılmaz.
 * 🔴 `poz_no` gövdede ASLA yoktur (sunucu üretir; `extra="forbid"` → 422) ve mevcut
 * kalemin disiplini bu ekrandan değişmez (ÜS-5) → PATCH'te `discipline_id` de yok.
 * PATCH yalnız DEĞİŞEN alanları taşır (backend `ref_price` değişmezse
 * `price_updated_at`i yenilemez).
 */
import { standardRateError } from "@/components/catalog-shared/standard-rate";
import { compareDecimalStrings, normalizeDecimalInput } from "@/lib/decimal";
import type { WorkItemCreate, WorkItemRead, WorkItemUpdate } from "@/lib/api/models";

export type ContractorType = WorkItemRead["default_contractor_type"];

export interface WorkItemFormState {
  name: string;
  uom: string;
  refPrice: string;
  rate: string;
  own: ContractorType;
}

export type WorkItemFormField = "name" | "refPrice" | "rate" | "discipline";

export interface WorkItemFormError {
  field: WorkItemFormField;
  message: string;
}

/** openapi `WorkItemCreate.name` maxLength. */
export const WORK_ITEM_NAME_MAX_LENGTH = 200;
/** KIK:269 — yeni kalemin varsayılan birimi. */
export const DEFAULT_UNIT = "m³";

const RATE_REQUIRED = "A-s zorunlu · 0'dan büyük olmalı";
/** openapi `ref_price` deseni: ≤ 16 tam + ≤ 2 kesir basamağı. */
const PRICE_INTEGER_DIGITS = 16;
const PRICE_FRACTION_DIGITS = 2;
const RATE_MIN_FRACTION = 2;

/** "1250.5000" → "1250,50": sondaki sıfır atılır, en az `minFraction` hane, kayıp yok. */
function toInputText(value: string, minFraction: number): string {
  const [whole = "", fraction = ""] = value.split(".");
  return `${whole},${fraction.replace(/0+$/, "").padEnd(minFraction, "0")}`;
}

export function emptyWorkItemForm(own: ContractorType): WorkItemFormState {
  return { name: "", uom: DEFAULT_UNIT, refPrice: "", rate: "", own };
}

export function workItemFormFromItem(item: WorkItemRead): WorkItemFormState {
  return {
    name: item.name,
    uom: item.uom,
    refPrice: item.ref_price === null ? "" : toInputText(item.ref_price, PRICE_FRACTION_DIGITS),
    rate: toInputText(item.standard_unit_mhr, RATE_MIN_FRACTION),
    own: item.default_contractor_type,
  };
}

function refPriceError(raw: string): string | undefined {
  const normalized = normalizeDecimalInput(raw);
  if (normalized === null || normalized.startsWith("-")) return "Referans fiyat girin";
  const [whole = "", fraction = ""] = normalized.replace(/^\+/, "").split(".");
  if (fraction.replace(/0+$/, "").length > PRICE_FRACTION_DIGITS) return "En fazla 2 ondalık";
  if (whole.replace(/^0+/, "").length > PRICE_INTEGER_DIGITS) return "En fazla 16 basamak";
  return undefined;
}

/**
 * KIK:263-266 — mockup gibi TEK satır: ilk hata (tarif → referans fiyat → A-s).
 * Disiplin hatası yalnız katalogda hiç disiplin yokken doğar ("Önce disiplin ekleyin", KAT metni).
 */
export function firstWorkItemError(form: WorkItemFormState, disciplineId: string): WorkItemFormError | null {
  if (!form.name.trim()) return { field: "name", message: "Tarif zorunlu" };
  const price = refPriceError(form.refPrice);
  if (price) return { field: "refPrice", message: price };
  const rate = standardRateError(form.rate, RATE_REQUIRED);
  if (rate) return { field: "rate", message: rate };
  if (!disciplineId) return { field: "discipline", message: "Önce disiplin ekleyin" };
  return null;
}

/** Yalnız doğrulamadan geçmiş formla çağrılır. */
export function buildWorkItemCreateBody(form: WorkItemFormState, disciplineId: string): WorkItemCreate {
  return {
    discipline_id: disciplineId,
    name: form.name.trim(),
    uom: form.uom,
    ref_price: normalizeDecimalInput(form.refPrice) ?? form.refPrice,
    standard_unit_mhr: normalizeDecimalInput(form.rate) ?? form.rate,
    default_contractor_type: form.own,
  };
}

/** Aynı sayının farklı yazımı ("1.250,50" ↔ "1250,50") DEĞİŞİKLİK değildir. */
function isSameDecimal(a: string, b: string): boolean {
  const left = normalizeDecimalInput(a);
  const right = normalizeDecimalInput(b);
  if (left === null || right === null) return a.trim() === b.trim();
  return compareDecimalStrings(left, right) === 0;
}

export function buildWorkItemUpdateBody(initial: WorkItemFormState, form: WorkItemFormState): WorkItemUpdate {
  const name = form.name.trim();
  return {
    ...(name !== initial.name.trim() ? { name } : {}),
    ...(form.uom !== initial.uom ? { uom: form.uom } : {}),
    ...(!isSameDecimal(form.refPrice, initial.refPrice)
      ? { ref_price: normalizeDecimalInput(form.refPrice) ?? form.refPrice }
      : {}),
    ...(!isSameDecimal(form.rate, initial.rate)
      ? { standard_unit_mhr: normalizeDecimalInput(form.rate) ?? form.rate }
      : {}),
    ...(form.own !== initial.own ? { default_contractor_type: form.own } : {}),
  };
}

export function isWorkItemFormDirty(initial: WorkItemFormState, form: WorkItemFormState): boolean {
  return Object.keys(buildWorkItemUpdateBody(initial, form)).length > 0;
}
