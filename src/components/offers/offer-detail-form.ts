import { compareDecimalStrings, parseCountInput } from "@/lib/decimal";
import { PRICE_INDEX_OPTIONS, type PriceIndexType } from "@/lib/contract-labels";
import type { OfferRevisionUpdateBody, OfferUpdateBody } from "@/lib/api/hooks/useOfferMutations";
import type { OfferDetailRead, OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import { parseQuantityInput } from "@/lib/tr-decimal";

import {
  NO_MASKED_RATES,
  OFFER_SCOPE_MAX_LENGTH,
  pctToInputText,
  validateOfferForm,
  type MaskedRateField,
  type MaskedRates,
  type OfferFormValues,
} from "./offer-form";

/**
 * TKL-F3.5 · Teklif Detay formunun SAF modeli: künye + oranlar (F3.4'ün `offer-form.ts`i, ORTAK) +
 * koşullar. "Taslak Kaydet" iki PATCH'e bölünür (künye → `/offers/{id}`, koşullar/oranlar →
 * `…/revisions/{rev}`); YALNIZ DEĞİŞEN alanlar gövdeye girer (plan §3.3).
 */

export type PriceEscalation = "tuik" | "fixed";
export type PriceIndexChoice = PriceIndexType | "";

export interface OfferDetailFormValues extends OfferFormValues {
  paymentTerms: string;
  /** Yalnız rakam metni ya da boş (= belirtilmedi). */
  deliveryDays: string;
  priceEscalation: PriceEscalation;
  priceIndexType: PriceIndexChoice;
  notes: string;
}

export type OfferDetailFormField = keyof OfferDetailFormValues;
export type OfferDetailFormErrors = Partial<Record<OfferDetailFormField, string>>;

export const OFFER_TERMS_MAX_LENGTH = OFFER_SCOPE_MAX_LENGTH;
export const MAX_DELIVERY_DAYS = 36500;

/** Backend 422 metniyle birebir (plan §0): TÜİK endeksli iken endeks türü zorunludur. */
export const OFFER_DETAIL_MESSAGES = {
  indexRequired: "Fiyat farkı «TÜİK endeksli» iken endeks türü zorunludur",
  // GECE KURALI: plan metni vermiyor (SABAH ONAYI eki).
  offerDateRequired: "Teklif tarihi zorunlu",
  deliveryRange: `Teslim süresi 0–${MAX_DELIVERY_DAYS} gün olmalı`,
  textTooLong: `En çok ${OFFER_TERMS_MAX_LENGTH} karakter`,
} as const;

/** Künye PATCH'ine giren alanlar. */
const OFFER_FIELDS = ["employerId", "title", "scopeSummary"] as const;
/** Revizyon PATCH'ine giren alanlar. */
const REVISION_FIELDS = [
  "offerDate",
  "validityDays",
  "overheadPct",
  "profitPct",
  "vatPct",
  "paymentTerms",
  "deliveryDays",
  "priceEscalation",
  "priceIndexType",
  "notes",
] as const;

export const OFFER_FORM_FIELDS: readonly OfferDetailFormField[] = [...OFFER_FIELDS, ...REVISION_FIELDS];
export const OFFER_INFO_FIELD_SET: ReadonlySet<OfferDetailFormField> = new Set(OFFER_FIELDS);

/**
 * IZN-F4.2 · sunucunun MASKELEDİĞİ (`null` döndürdüğü) oranlar. Bu alanlar formda salt okunur "—"dir; değişmiş sayılmaz,
 * doğrulanmaz, gövdeye girmez. Sunucu değeri dolu olan oran normal düzenlenir.
 */
export function maskedRatesOf(revision: Pick<OfferRevisionRead, "overhead_pct" | "profit_pct">): MaskedRates {
  const masked = new Set<MaskedRateField>();
  if (revision.overhead_pct === null) masked.add("overheadPct");
  if (revision.profit_pct === null) masked.add("profitPct");
  return masked;
}

/** Sunucu durumundan form değerleri (baseline). */
export function detailFormValuesFromServer(
  detail: OfferDetailRead,
  revision: OfferRevisionRead,
): OfferDetailFormValues {
  return {
    employerId: detail.employer_id,
    title: detail.title,
    scopeSummary: detail.scope_summary ?? "",
    offerDate: revision.offer_date,
    validityDays: String(revision.validity_days),
    overheadPct: pctToInputText(revision.overhead_pct),
    profitPct: pctToInputText(revision.profit_pct),
    vatPct: pctToInputText(revision.vat_pct),
    paymentTerms: revision.payment_terms ?? "",
    deliveryDays: revision.delivery_days === null ? "" : String(revision.delivery_days),
    priceEscalation: revision.price_escalation,
    priceIndexType: revision.price_index_type ?? "",
    notes: revision.notes ?? "",
  };
}

/** Sabit fiyatta endeks türü anlamsızdır (sunucu da girilmesini 422 ile reddeder) → "yok" sayılır. */
function effectiveIndex(values: OfferDetailFormValues): PriceIndexChoice {
  return values.priceEscalation === "fixed" ? "" : values.priceIndexType;
}

/** Yüzde metni sunucudaki değere eşit mi? Okunamayan metin = değişmiş (doğrulama yakalar). */
function pctEquals(text: string, serverPct: string | null): boolean {
  if (serverPct === null) return true; // maskeli: değişmiş sayılamaz (`maskedRatesOf`)
  const parsed = parseQuantityInput(text);
  return parsed.kind === "ok" && compareDecimalStrings(parsed.value, serverPct) === 0;
}

/** Hangi alanlar sunucudakinden FARKLI? (Karşılaştırma normalleştirilmiş: kırpma, "12,0" = "12".) */
export function changedFormFields(
  values: OfferDetailFormValues,
  detail: OfferDetailRead,
  revision: OfferRevisionRead,
): ReadonlySet<OfferDetailFormField> {
  const server = detailFormValuesFromServer(detail, revision);
  const serverPct = { overheadPct: revision.overhead_pct, profitPct: revision.profit_pct, vatPct: revision.vat_pct };
  const changed = new Set<OfferDetailFormField>();
  for (const field of OFFER_FORM_FIELDS) {
    if (isFieldChanged(field, values, server, serverPct)) changed.add(field);
  }
  return changed;
}

type ServerPct = { overheadPct: string | null; profitPct: string | null; vatPct: string };

function isFieldChanged(
  field: OfferDetailFormField,
  values: OfferDetailFormValues,
  server: OfferDetailFormValues,
  serverPct: ServerPct,
): boolean {
  switch (field) {
    case "overheadPct":
    case "profitPct":
    case "vatPct":
      return !pctEquals(values[field], serverPct[field]);
    case "title":
    case "scopeSummary":
    case "paymentTerms":
    case "notes":
      return values[field].trim() !== server[field].trim();
    case "priceIndexType":
      return effectiveIndex(values) !== effectiveIndex(server);
    default:
      return values[field] !== server[field];
  }
}

/** Boş metin → `null` (nullable sütun temizlenir); dolu → kırpılmış metin. */
function textOrNull(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

function pctBody(text: string): string {
  const parsed = parseQuantityInput(text);
  if (parsed.kind !== "ok") throw new Error("buildOfferPatchBodies: doğrulanmamış yüzde");
  return parsed.value;
}

export interface OfferPatchBodies {
  /** `PATCH /offers/{id}` — künye değişmediyse `null` (istek ATILMAZ). */
  offer: OfferUpdateBody | null;
  /** `PATCH …/revisions/{rev}` — koşul/oran değişmediyse `null`. */
  revision: OfferRevisionUpdateBody | null;
}

/** YALNIZ doğrulanmış form için. Değişmeyen alan gövdede YOKTUR. */
export function buildOfferPatchBodies(
  values: OfferDetailFormValues,
  changed: ReadonlySet<OfferDetailFormField>,
): OfferPatchBodies {
  const offer: OfferUpdateBody = {};
  if (changed.has("employerId")) offer.employer_id = values.employerId;
  if (changed.has("title")) offer.title = values.title.trim();
  if (changed.has("scopeSummary")) offer.scope_summary = textOrNull(values.scopeSummary);

  const revision: OfferRevisionUpdateBody = {};
  if (changed.has("offerDate")) revision.offer_date = values.offerDate;
  if (changed.has("validityDays")) revision.validity_days = parseCountInput(values.validityDays) ?? 0;
  if (changed.has("overheadPct")) revision.overhead_pct = pctBody(values.overheadPct);
  if (changed.has("profitPct")) revision.profit_pct = pctBody(values.profitPct);
  if (changed.has("vatPct")) revision.vat_pct = pctBody(values.vatPct);
  if (changed.has("paymentTerms")) revision.payment_terms = textOrNull(values.paymentTerms);
  if (changed.has("deliveryDays")) {
    revision.delivery_days = values.deliveryDays === "" ? null : (parseCountInput(values.deliveryDays) ?? 0);
  }
  if (changed.has("notes")) revision.notes = textOrNull(values.notes);
  if (changed.has("priceEscalation") || changed.has("priceIndexType")) {
    revision.price_escalation = values.priceEscalation;
    // Sabit fiyatta endeks türü GÖNDERİLMEZ-null: açık `null` (aksi 422 "Sabit fiyatta endeks türü girilemez").
    revision.price_index_type = values.priceEscalation === "fixed" ? null : values.priceIndexType || null;
  }

  return {
    offer: Object.keys(offer).length === 0 ? null : offer,
    revision: Object.keys(revision).length === 0 ? null : revision,
  };
}

export function validateDetailForm(
  values: OfferDetailFormValues,
  masked: MaskedRates = NO_MASKED_RATES,
): OfferDetailFormErrors {
  const errors: { -readonly [K in OfferDetailFormField]?: string } = { ...validateOfferForm(values, masked) };
  if (values.offerDate === "") errors.offerDate = OFFER_DETAIL_MESSAGES.offerDateRequired;
  if (values.deliveryDays !== "") {
    const days = parseCountInput(values.deliveryDays);
    if (days === null || days > MAX_DELIVERY_DAYS) errors.deliveryDays = OFFER_DETAIL_MESSAGES.deliveryRange;
  }
  if (values.priceEscalation === "tuik" && values.priceIndexType === "") {
    errors.priceIndexType = OFFER_DETAIL_MESSAGES.indexRequired;
  }
  if (values.paymentTerms.length > OFFER_TERMS_MAX_LENGTH) errors.paymentTerms = OFFER_DETAIL_MESSAGES.textTooLong;
  if (values.notes.length > OFFER_TERMS_MAX_LENGTH) errors.notes = OFFER_DETAIL_MESSAGES.textTooLong;
  return errors;
}

/**
 * Tek alan değişimini kurar (kontrol metni → tipli değer; cast YOK). Bilinmeyen segment/endeks metni
 * güvenli varsayılana düşer ("fixed" / boş).
 */
export function applyFieldChange(
  edits: Partial<OfferDetailFormValues>,
  field: OfferDetailFormField,
  text: string,
): Partial<OfferDetailFormValues> {
  if (field === "priceEscalation") return { ...edits, priceEscalation: text === "tuik" ? "tuik" : "fixed" };
  if (field === "priceIndexType") {
    return { ...edits, priceIndexType: PRICE_INDEX_OPTIONS.find((option) => option.value === text)?.value ?? "" };
  }
  return { ...edits, [field]: text };
}
