/**
 * PLN-F1.5 · "İş Tipi Ekle / Düzenle" formunun saf durumu (KAT:234-296, :465-515).
 *
 * Oran METİN olarak taşınır (TR virgülü); gövdeye `normalizeDecimalInput`
 * ile kayıpsız ondalık string gider — `Number()`'a çevrilip geri yazılmaz.
 * Düzenlemede yalnız DEĞİŞEN alanlar PATCH edilir (backend kısmi günceller;
 * oran değişmezse `standard_updated_at` yenilenmez).
 */
import { CATALOG_UNIT_OPTIONS, unitOptions } from "@/components/catalog-shared/catalog-units";
import { standardRateError } from "@/components/catalog-shared/standard-rate";
import { compareDecimalStrings, normalizeDecimalInput } from "@/lib/decimal";
import type {
  EvCatalogItemCreate,
  EvCatalogItemRead,
  EvCatalogItemUpdate,
} from "@/lib/api/models";

export type ContractorType = EvCatalogItemRead["default_contractor_type"];

export interface CatalogFormState {
  name: string;
  disciplineId: string;
  uom: string;
  rate: string;
  own: ContractorType;
  description: string;
}

export interface CatalogFormErrors {
  name?: string;
  rate?: string;
  discipline?: string;
}

/** TKL-F1.3 · birim listesi TEK KAYNAK çekirdekte (`catalog-shared/catalog-units.ts`); KAT bu adla ithal eder. */
export { CATALOG_UNIT_OPTIONS, unitOptions };

/** TKL ÜS-13(a) — düzenlemede disiplin değişince gösterilen uyarı. */
export const DISCIPLINE_CHANGE_WARNING =
  "Disiplin değişirse yeni poz no verilir; eski numara sözleşme/teklif kopyalarında kalır";
/** KAT:528 — yeni iş tipinin varsayılan birimi. */
export const DEFAULT_UNIT = "m³";
/** KAT:471 "Maks 120 karakter" — backend sınırı 200, mockup daha sıkı. */
export const CATALOG_NAME_MAX_LENGTH = 120;
/** openapi `CatalogItemCreate.description` maxLength. */
export const CATALOG_DESCRIPTION_MAX_LENGTH = 2000;

/** Düzenleme kutusunda gösterim basamağının altına inilmez (KAT:410 `dec`). */
const RATE_WIDE_FROM = 10;
const RATE_WIDE_MIN_DIGITS = 1;
const RATE_NARROW_MIN_DIGITS = 2;

/** "1.8000" → "1,80" · "0.1234" → "0,1234" — sondaki sıfır atılır, hassasiyet korunur. */
export function rateToInput(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const minDigits = Math.abs(Number(value)) >= RATE_WIDE_FROM ? RATE_WIDE_MIN_DIGITS : RATE_NARROW_MIN_DIGITS;
  const trimmed = fraction.replace(/0+$/, "").padEnd(minDigits, "0");
  return `${whole},${trimmed}`;
}

export function emptyCatalogForm(disciplineId: string, own: ContractorType): CatalogFormState {
  return { name: "", disciplineId, uom: DEFAULT_UNIT, rate: "", own, description: "" };
}

export function catalogFormFromItem(item: EvCatalogItemRead): CatalogFormState {
  return {
    name: item.name,
    disciplineId: item.discipline.id,
    uom: item.uom,
    rate: rateToInput(item.standard_unit_mhr),
    own: item.default_contractor_type,
    description: item.description ?? "",
  };
}

export function rateError(raw: string): string | undefined {
  return standardRateError(raw, "Standart oran zorunlu · 0'dan büyük olmalı");
}

export function validateCatalogForm(form: CatalogFormState): CatalogFormErrors {
  const errors: CatalogFormErrors = {};
  if (!form.name.trim()) errors.name = "İş tipi adı zorunlu";
  const rate = rateError(form.rate);
  if (rate) errors.rate = rate;
  if (!form.disciplineId) errors.discipline = "Önce disiplin ekleyin";
  return errors;
}

function descriptionValue(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** Yalnız doğrulamadan geçmiş formla çağrılır. */
export function buildCatalogCreateBody(form: CatalogFormState): EvCatalogItemCreate {
  return {
    discipline_id: form.disciplineId,
    name: form.name.trim(),
    uom: form.uom,
    standard_unit_mhr: normalizeDecimalInput(form.rate) ?? form.rate,
    default_contractor_type: form.own,
    description: descriptionValue(form.description),
  };
}

export function buildCatalogUpdateBody(
  initial: CatalogFormState,
  form: CatalogFormState,
): EvCatalogItemUpdate {
  const name = form.name.trim();
  const description = descriptionValue(form.description);
  return {
    ...(name !== initial.name.trim() ? { name } : {}),
    ...(form.disciplineId !== initial.disciplineId ? { discipline_id: form.disciplineId } : {}),
    ...(form.uom !== initial.uom ? { uom: form.uom } : {}),
    ...(form.rate.trim() !== initial.rate
      ? { standard_unit_mhr: normalizeDecimalInput(form.rate) ?? form.rate }
      : {}),
    ...(form.own !== initial.own ? { default_contractor_type: form.own } : {}),
    ...(description !== descriptionValue(initial.description) ? { description } : {}),
  };
}

/**
 * KAT:120-122 `rateChanged` — yalnız GEÇERLİ (doğrulamadan geçen) ve
 * orijinal standart orandan FARKLI bir değer uyarı bandını tetikler.
 */
export function catalogRateChanged(item: EvCatalogItemRead, form: CatalogFormState): boolean {
  if (rateError(form.rate)) return false;
  const normalized = normalizeDecimalInput(form.rate);
  return normalized !== null && compareDecimalStrings(normalized, item.standard_unit_mhr) !== 0;
}

/** KAT:184 `tOwnHint` — seçili disiplinin varsayılanına göre dinamik ipucu. */
export function catalogOwnHint(
  selected: { code: string; defaultContractorLabel: string; defaultContractorType: ContractorType } | null,
  formOwn: ContractorType,
): string {
  if (!selected) return "Disiplin seçilince varsayılanı gelir";
  const changed = formOwn !== selected.defaultContractorType;
  return `Varsayılan ${selected.code} disiplininden: ${selected.defaultContractorLabel}${
    changed ? " · bu iş tipinde değiştirildi" : ""
  }`;
}
