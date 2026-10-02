/**
 * TKL-F5.2 · adım kapıları (SAF). İlk hata değil TÜM hatalar döner. Amaç: backend'in HER statik 422 dalı (plan §0) gönderim
 * ÖNCESİ yakalanır; sunucu kuralı taklit eder, yerine geçmez. Metinler: `project-form/validate.ts` (Adım 1), `offer-group-names`
 * (grup adı), `contract-item-form/validate` (kod/tanım/birim), `lib/tr-decimal` (T30) AYNEN; backend metinleri (§0) yeniden yazılmaz.
 */
import { validateCodeField, validateDescriptionField, validateUnitField } from "@/components/contract-item-form/validate";
import { MSG_GROUP_NAME_TAKEN } from "@/components/offers/offer-group-names";
import { MESSAGES } from "@/components/project-form/validate";
import type { OfferRevisionRead } from "@/lib/api/hooks/useOffers";
import { compareDecimalStrings } from "@/lib/decimal";
import { durationDays } from "@/lib/form/derive";
import { REF_PRICE_AMBIGUOUS_DOT, decimalDigitCounts, parseQuantityInput } from "@/lib/tr-decimal";

import { rowContractAmount, parsedRow } from "./convert-derive";
import { collidingGroupKeys, collidingRowKeys, includedRows, sentGroupKeys } from "./convert-model";
import { isOverAmountLimit, sumAmounts } from "./convert-money";
import type { ConvertDraft, ConvertForm, ConvertRow } from "./convert-types";

/** `convert_schemas.CONVERT_MAX_ITEMS`. */
export const MAX_CONVERT_ITEMS = 2000;

/** Backend alan uzunlukları (`convert_schemas`): ad/şantiye 150 · il/sözleşme no 100 · grup adı 200. */
const MAX_PROJECT_NAME = 150;
const MAX_SITE_NAME = 150;
const MAX_CITY = 100;
/** `ConvertProject.code`: 1–50 (boşsa sunucu üretir → boş hata DEĞİL). */
const MAX_PROJECT_CODE = 50;
const MAX_CONTRACT_NO = 100;
const MAX_GROUP_NAME = 200;
/** `_BaseIndex`: Numeric(12,3) → ≤ 9 tam hane + 3 kesir. */
const BASE_INDEX_MAX = "999999999.999";
const BASE_INDEX_MAX_TEXT = "999.999.999,999";
const BASE_INDEX_FRACTION = 3;

const MSG_GROUP_NAME_REQUIRED = "Grup adı zorunlu";
const MSG_NO_ITEMS = "En az bir kalem sözleşmeye dahil olmalı";
/** Seçici (F5.4) tavan bandında AYNI metni basar. */
export const MSG_TOO_MANY = `En fazla ${MAX_CONVERT_ITEMS} kalem dönüştürülebilir`;
const MSG_AMOUNT_LIMIT = "Kalem toplamı sözleşme bedeli sınırını aşıyor";
/** Backend metinleri AYNEN (`convert_service._static_errors`). */
const MSG_OFFER_ITEM_MISSING = "Kalem teklifin son revizyonunda bulunamadı";
const MSG_OFFER_ITEM_MISMATCH = "Teklif kaleminin katalog bağı gövdedekiyle uyuşmuyor";

const maxCharsMessage = (max: number): string => `En çok ${max} karakter`;
const maxFractionMessage = (max: number): string => `En fazla ${max} ondalık`;

export type Step1Errors = Partial<Record<keyof ConvertForm, string>>;

export interface RowErrors {
  qty?: string;
  bf?: string;
  code?: string;
  description?: string;
  unit?: string;
  offerItem?: string;
}

export interface GeneralErrors {
  noItems?: string;
  tooMany?: string;
  amountLimit?: string;
}

export interface Step2Errors {
  /** Grup anahtarı → mesaj. */
  groups: Readonly<Record<string, string>>;
  /** Satır anahtarı → alan hataları (yalnız hatalı satırlar). */
  rows: Readonly<Record<string, RowErrors>>;
  general: GeneralErrors;
}

const isCalendarDate = (value: string): boolean => durationDays(value, value) !== null;

function textError(value: string, required: string, max: number): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return required;
  return trimmed.length > max ? maxCharsMessage(max) : undefined;
}

function baseIndexError(raw: string): string | undefined {
  if (!raw.trim()) return MESSAGES.escalationRequired;
  const text = raw.trim();
  const isNegative = text.startsWith("-");
  const parsed = parseQuantityInput(isNegative ? text.slice(1) : text);
  if (parsed.kind === "ambiguous") return REF_PRICE_AMBIGUOUS_DOT;
  if (parsed.kind === "invalid") return MESSAGES.notANumber;
  if (isNegative) return MESSAGES.negativeAmount;
  if (decimalDigitCounts(parsed.value).fraction > BASE_INDEX_FRACTION) return maxFractionMessage(BASE_INDEX_FRACTION);
  if (compareDecimalStrings(parsed.value, BASE_INDEX_MAX) > 0) return `En fazla ${BASE_INDEX_MAX_TEXT}`;
  return undefined;
}

function dateErrors(form: ConvertForm): Step1Errors {
  const errors: Step1Errors = {};
  if (!isCalendarDate(form.signatureDate)) errors.signatureDate = MESSAGES.signatureDateRequired;
  if (!isCalendarDate(form.startDate)) errors.startDate = MESSAGES.datesRequired;
  if (!isCalendarDate(form.endDate)) errors.endDate = MESSAGES.datesRequired;
  const hasBoth = isCalendarDate(form.startDate) && isCalendarDate(form.endDate);
  if (hasBoth && durationDays(form.startDate, form.endDate) === null) errors.endDate = MESSAGES.endBeforeStart;
  return errors;
}

/** Adım 1: proje + sözleşme + fiyat farkı + şantiye adı. */
export function validateStep1(form: ConvertForm): Step1Errors {
  const errors: Step1Errors = {
    ...dateErrors(form),
    ...(form.hasPriceEscalation && !form.indexType ? { indexType: MESSAGES.escalationRequired } : {}),
    ...(form.hasPriceEscalation ? withKey("baseIndexValue", baseIndexError(form.baseIndexValue)) : {}),
    ...withKey("projectName", textError(form.projectName, MESSAGES.nameRequired, MAX_PROJECT_NAME)),
    ...withKey("city", textError(form.city, MESSAGES.cityRequired, MAX_CITY)),
    ...(form.projectCode.trim().length > MAX_PROJECT_CODE ? { projectCode: maxCharsMessage(MAX_PROJECT_CODE) } : {}),
    ...withKey("contractNo", textError(form.contractNo, MESSAGES.contractNoRequired, MAX_CONTRACT_NO)),
    ...(form.openSite && form.siteName.trim().length > MAX_SITE_NAME ? { siteName: maxCharsMessage(MAX_SITE_NAME) } : {}),
  };
  return errors;
}

function withKey(key: keyof ConvertForm, message: string | undefined): Step1Errors {
  return message ? { [key]: message } : {};
}

function rowFieldErrors(row: ConvertRow, collidingCodes: ReadonlySet<string>, revision: OfferRevisionRead): RowErrors {
  const { qty, bf } = parsedRow(row);
  const code = validateCodeField(row.code)?.message ?? (collidingCodes.has(row.key) ? duplicateCodeMessage(row.code) : undefined);
  const description = validateDescriptionField(row.description)?.message;
  const unit = validateUnitField(row.unit)?.message;
  const offerItem = offerItemError(row, revision);
  return {
    ...(qty.ok ? {} : { qty: qty.message }),
    ...(bf.ok ? {} : { bf: bf.message }),
    ...(code ? { code } : {}),
    ...(description ? { description } : {}),
    ...(unit ? { unit } : {}),
    ...(offerItem ? { offerItem } : {}),
  };
}

/** `offer_item_id` son revizyonda yok / katalog bağı uyuşmuyor (sunucu 422'leri, SO-33). Yeni satırda denetim yok. */
export function offerItemError(row: ConvertRow, revision: OfferRevisionRead): string | undefined {
  if (row.offerItemId === null) return undefined;
  const source = revisionItem(revision, row.offerItemId);
  if (source === undefined) return MSG_OFFER_ITEM_MISSING;
  return source.catalog_item_id === row.catalogItemId ? undefined : MSG_OFFER_ITEM_MISMATCH;
}

const duplicateCodeMessage = (code: string): string => `Kalem kodu tekrar ediyor (${code.trim()})`;

function revisionItem(revision: OfferRevisionRead, id: string) {
  return revision.groups.flatMap((group) => group.items).find((item) => item.id === id);
}

function groupErrors(draft: ConvertDraft): Record<string, string> {
  const colliding = collidingGroupKeys(draft);
  const sent = new Set(sentGroupKeys(draft));
  return Object.fromEntries(
    draft.groups.flatMap((group) => {
      if (!sent.has(group.key)) return [];
      const message = textError(group.name, MSG_GROUP_NAME_REQUIRED, MAX_GROUP_NAME) ?? (colliding.has(group.key) ? MSG_GROUP_NAME_TAKEN : undefined);
      return message ? [[group.key, message] as const] : [];
    }),
  );
}

function generalErrors(draft: ConvertDraft): GeneralErrors {
  const included = includedRows(draft);
  const amounts = included.map(rowContractAmount).filter((amount): amount is string => amount !== null);
  return {
    ...(included.length === 0 ? { noItems: MSG_NO_ITEMS } : {}),
    ...(included.length > MAX_CONVERT_ITEMS ? { tooMany: MSG_TOO_MANY } : {}),
    ...(isOverAmountLimit(sumAmounts(amounts)) ? { amountLimit: MSG_AMOUNT_LIMIT } : {}),
  };
}

/** Adım 2: satır kutuları, kod/grup adı tekrarı, teklif kalemi bağı, ≥ 1 kalem, tavan, bedel sınırı. */
export function validateStep2(draft: ConvertDraft, revision: OfferRevisionRead): Step2Errors {
  const collidingCodes = collidingRowKeys(draft);
  const rows = Object.fromEntries(
    includedRows(draft).flatMap((row) => {
      const found = rowFieldErrors(row, collidingCodes, revision);
      return Object.keys(found).length > 0 ? [[row.key, found] as const] : [];
    }),
  );
  return { groups: groupErrors(draft), rows, general: generalErrors(draft) };
}

export function hasStep1Errors(errors: Step1Errors): boolean {
  return Object.keys(errors).length > 0;
}

export function hasStep2Errors(errors: Step2Errors): boolean {
  return (
    Object.keys(errors.groups).length > 0 || Object.keys(errors.rows).length > 0 || Object.keys(errors.general).length > 0
  );
}
