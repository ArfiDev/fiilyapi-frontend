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

/** Belirsiz nokta kullanımında satır hatası (kullanıcı onaylı metin). */
export const REF_PRICE_AMBIGUOUS_DOT = "Ondalık için virgül kullanın (ör. 28,50)";

/**
 * Tamsayı kısmı: noktasız serbest; noktalıysa Türkçe binlik — ilk grup 1-3 hane ve "0" ile
 * başlamaz, sonrakiler TAM 3 hane ("28.500"). "0.500"/"1234.567" belirsizdir (TKL-F1.6-HF).
 */
const THOUSANDS_GROUPED = /^(\d+|[1-9]\d{0,2}(\.\d{3})+)$/;
const DIGITS_AND_DOTS = /^[\d.]+$/;
const DIGITS_ONLY = /^\d+$/;
const PRICE_MIN_FRACTION = 2;

export type RefPriceParse =
  | { kind: "ok"; value: string }
  | { kind: "ambiguous" }
  | { kind: "invalid" };

/** "1250,5000" → "1250,50": 2'yi aşan SIFIR haneler atılır, anlamlı hane ASLA. */
function trimPriceFraction(fraction: string): string {
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed.padEnd(PRICE_MIN_FRACTION, "0").slice(0, Math.max(trimmed.length, PRICE_MIN_FRACTION));
}

/**
 * 🔴 REFERANS FİYAT OKUMA KURALI — TEK YER (ürün kararı değişirse yalnız burası çevrilir).
 * Türkçe yazım: nokta = BİNLİK ayıracı, virgül = ondalık. Noktayla ayrılan her grup
 * (ilk grup hariç) TAM 3 hane değilse girdi BELİRSİZDİR ("28.5", "1.50", "28.5000") ve
 * KAYDEDİLMEZ — sessizce 28,50 ya da 2850 okumak yerine kullanıcıdan virgül istenir.
 * Dönen değer kayıpsız ondalık dizedir ("28.500,75" → "28500.75"); virgüllü girdi en az
 * 2 kesir haneye tamamlanır ("28,5" → "28.50"). A-s alanı bu kuralı KULLANMAZ
 * (`normalizeDecimalInput`: nokta ondalıktır).
 */
export function parseRefPriceInput(raw: string): RefPriceParse {
  const text = raw.trim();
  const parts = text.split(",");
  if (parts.length > 2) return { kind: "invalid" };
  const [integerText = "", fractionText] = parts;
  if (fractionText !== undefined && !DIGITS_ONLY.test(fractionText)) return { kind: "invalid" };
  if (!DIGITS_AND_DOTS.test(integerText)) return { kind: "invalid" };
  if (!THOUSANDS_GROUPED.test(integerText)) return { kind: "ambiguous" };
  const whole = integerText.replace(/\./g, "").replace(/^0+(?=\d)/, "");
  if (fractionText === undefined) return { kind: "ok", value: whole };
  return { kind: "ok", value: `${whole}.${trimPriceFraction(fractionText)}` };
}

function refPriceError(raw: string): string | undefined {
  const parsed = parseRefPriceInput(raw);
  if (parsed.kind === "invalid") return "Referans fiyat girin";
  if (parsed.kind === "ambiguous") return REF_PRICE_AMBIGUOUS_DOT;
  const [whole = "", fraction = ""] = parsed.value.split(".");
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
    ref_price: refPriceBodyValue(form.refPrice),
    standard_unit_mhr: normalizeDecimalInput(form.rate) ?? form.rate,
    default_contractor_type: form.own,
  };
}

/** Doğrulamadan geçmiş fiyat metni → gövde dizesi (geçmemişse ham metin: sunucu 422 verir). */
function refPriceBodyValue(raw: string): string {
  const parsed = parseRefPriceInput(raw);
  return parsed.kind === "ok" ? parsed.value : raw;
}

/** Aynı sayının farklı yazımı ("1.250,50" ↔ "1250,50") DEĞİŞİKLİK değildir. */
function isSameDecimal(a: string, b: string, read: (raw: string) => string | null): boolean {
  const left = read(a);
  const right = read(b);
  if (left === null || right === null) return a.trim() === b.trim();
  return compareDecimalStrings(left, right) === 0;
}

function readRate(raw: string): string | null {
  return normalizeDecimalInput(raw);
}

function readRefPrice(raw: string): string | null {
  const parsed = parseRefPriceInput(raw);
  return parsed.kind === "ok" ? parsed.value : null;
}

export function buildWorkItemUpdateBody(initial: WorkItemFormState, form: WorkItemFormState): WorkItemUpdate {
  const name = form.name.trim();
  return {
    ...(name !== initial.name.trim() ? { name } : {}),
    ...(form.uom !== initial.uom ? { uom: form.uom } : {}),
    ...(!isSameDecimal(form.refPrice, initial.refPrice, readRefPrice)
      ? { ref_price: refPriceBodyValue(form.refPrice) }
      : {}),
    ...(!isSameDecimal(form.rate, initial.rate, readRate)
      ? { standard_unit_mhr: normalizeDecimalInput(form.rate) ?? form.rate }
      : {}),
    ...(form.own !== initial.own ? { default_contractor_type: form.own } : {}),
  };
}

export function isWorkItemFormDirty(initial: WorkItemFormState, form: WorkItemFormState): boolean {
  return Object.keys(buildWorkItemUpdateBody(initial, form)).length > 0;
}
