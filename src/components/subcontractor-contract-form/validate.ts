/**
 * FSO istemci doğrulaması.
 *
 * Zorunluluklar mockup'taki `*` işaretlerinden gelir (56 Proje · 59 Şantiye ·
 * 75 Taşeron Firma · 82 İş Kategorisi · 90 Sözleşme No · 91 İmza Tarihi ·
 * 93 İşe Başlama · 94 Bitiş Tarihi). Sayısal sınırlar openapi
 * `SubcontractorContractCreate`ten: `advance_pct`/`retainage_pct` 0-100,
 * `payment_term_days` ≥ 0 tamsayı, `late_penalty_daily` ≥ 0.
 */

import {
  decimalDigitCounts,
  parseQuantityInput,
  parseRefPriceInput,
  REF_PRICE_AMBIGUOUS_DOT,
} from "@/lib/tr-decimal";

import { PCT_MAX, PCT_MIN } from "./constants";
import type { ContractTermsValues, SubcontractorContractFormValues } from "./form-state";

export const MESSAGES = {
  projectRequired: "Proje seçiniz.",
  siteRequired: "Şantiye seçiniz.",
  subcontractorRequired: "Taşeron firma seçiniz.",
  workCategoryRequired: "İş kategorisi seçiniz.",
  contractNoRequired: "Sözleşme no zorunludur.",
  signatureDateRequired: "İmza tarihi zorunludur.",
  startDateRequired: "İşe başlama tarihi zorunludur.",
  endDateRequired: "Bitiş tarihi zorunludur.",
  endBeforeStart: "Bitiş tarihi işe başlama tarihinden önce olamaz.",
  pctRange: "Oran 0 ile 100 arasında olmalıdır.",
  termDaysInvalid: "Ödeme vadesi 0 veya daha büyük bir tam sayı olmalıdır.",
  latePenaltyInvalid: "Gecikme cezası 0 veya daha büyük olmalıdır.",
  latePenaltyFraction: "Gecikme cezası en fazla 2 ondalık içerebilir.",
  latePenaltyDigits: "Gecikme cezası en fazla 16 basamaklı olabilir.",
  pctFraction: "Oran en fazla 2 ondalık içerebilir.",
} as const;

/** `late_penalty_daily` `Numeric(18,2)`; `advance_pct`/`retainage_pct` `Numeric(5,2)` — backend fazlayı sessizce yuvarlar. */
const MONEY_MAX_FRACTION = 2;
const MONEY_MAX_INTEGER = 16;
const PCT_MAX_FRACTION = 2;

/** `value: null` = alan boş. `value` nokta-ondalık METİNdir (gövdeye aynen girer; `Number()` YOK). */
export type TermsNumberParse =
  | { kind: "ok"; value: string | null }
  | { kind: "error"; message: string };

function termsError(message: string): TermsNumberParse {
  return { kind: "error", message };
}

/**
 * 🔴 TKL-F7a · T42 — Gecikme Cezası (₺/gün) T30 ile okunur: nokta binlik, virgül ondalık, belirsiz
 * "28.5" reddedilir (`lib/tr-decimal.ts` TEK kaynak). Boş → `null`; negatif/okunamayan → mevcut mesaj.
 */
export function parseLatePenalty(raw: string): TermsNumberParse {
  const text = raw.trim();
  if (!text) return { kind: "ok", value: null };
  if (text.startsWith("-")) return termsError(MESSAGES.latePenaltyInvalid);
  const parsed = parseRefPriceInput(text);
  if (parsed.kind === "ambiguous") return termsError(REF_PRICE_AMBIGUOUS_DOT);
  if (parsed.kind === "invalid") return termsError(MESSAGES.latePenaltyInvalid);
  const digits = decimalDigitCounts(parsed.value);
  if (digits.fraction > MONEY_MAX_FRACTION) return termsError(MESSAGES.latePenaltyFraction);
  if (digits.integer > MONEY_MAX_INTEGER) return termsError(MESSAGES.latePenaltyDigits);
  return { kind: "ok", value: parsed.value };
}

/**
 * 🔴 TKL-F7a · T42 — Avans/Teminat oranı (%) T30 ile okunur; 0–100 aralığı ve negatif/okunamayan
 * mesajı (`pctRange`) AYNEN korunur. Boş → `null` (çağıran şema varsayılanına düşer).
 */
export function parsePct(raw: string): TermsNumberParse {
  const text = raw.trim();
  if (!text) return { kind: "ok", value: null };
  if (text.startsWith("-")) return termsError(MESSAGES.pctRange);
  const parsed = parseQuantityInput(text);
  if (parsed.kind === "ambiguous") return termsError(REF_PRICE_AMBIGUOUS_DOT);
  if (parsed.kind === "invalid") return termsError(MESSAGES.pctRange);
  const digits = decimalDigitCounts(parsed.value);
  if (digits.fraction > PCT_MAX_FRACTION) return termsError(MESSAGES.pctFraction);
  // Aralık denetimi yalnız karşılaştırma içindir; gövdeye giden metin `parsed.value`dur.
  const numeric = Number(parsed.value);
  if (numeric < PCT_MIN || numeric > PCT_MAX) return termsError(MESSAGES.pctRange);
  return { kind: "ok", value: parsed.value };
}

export type SubcontractorContractFormErrors = Partial<
  Record<keyof SubcontractorContractFormValues, string>
>;

export function hasContractFormErrors(errors: SubcontractorContractFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Boş string → `null`; sayı olmayan metin → `NaN` (çağıran ayırt eder). */
function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return Number(trimmed);
}

function pctError(raw: string): string | undefined {
  const parsed = parsePct(raw);
  return parsed.kind === "error" ? parsed.message : undefined;
}

function latePenaltyError(raw: string): string | undefined {
  const parsed = parseLatePenalty(raw);
  return parsed.kind === "error" ? parsed.message : undefined;
}

export interface ValidateContractFormOptions {
  /**
   * `true` → "Taslak Kaydet". Taslakta YALNIZ proje zorunludur (sözleşme
   * PROJE altında açılır, uç proje kimliği olmadan çağrılamaz); geri kalan
   * zorunluluklar yayına alma yolundadır. Değer/tutarlılık hataları taslakta
   * da uygulanır — geçersiz sayı taslağa da yazılmamalıdır.
   */
  isDraft: boolean;
}

export function validateContractForm(
  values: SubcontractorContractFormValues,
  { isDraft }: ValidateContractFormOptions,
): SubcontractorContractFormErrors {
  const errors: SubcontractorContractFormErrors = {};

  if (!values.projectId) errors.projectId = MESSAGES.projectRequired;

  const advanceProblem = pctError(values.advancePct);
  if (advanceProblem) errors.advancePct = advanceProblem;
  const retainageProblem = pctError(values.retainagePct);
  if (retainageProblem) errors.retainagePct = retainageProblem;

  const termDays = numberOrNull(values.paymentTermDays);
  if (termDays !== null && (!Number.isInteger(termDays) || termDays < 0)) {
    errors.paymentTermDays = MESSAGES.termDaysInvalid;
  }

  const latePenaltyProblem = latePenaltyError(values.latePenaltyDaily);
  if (latePenaltyProblem) errors.latePenaltyDaily = latePenaltyProblem;

  // Tarih tutarlılığı — taslakta da (section-form emsali). Mockup tarih
  // kuralı YAZMAZ; bu bir DEĞER tutarlılığıdır, tasarım kararı değildir.
  if (values.startDate && values.endDate && values.endDate < values.startDate) {
    errors.endDate = MESSAGES.endBeforeStart;
  }

  if (isDraft) return errors;

  if (!values.siteId) errors.siteId = MESSAGES.siteRequired;
  if (!values.subcontractorId) errors.subcontractorId = MESSAGES.subcontractorRequired;
  if (!values.workCategory.trim()) errors.workCategory = MESSAGES.workCategoryRequired;
  if (!values.contractNo.trim()) errors.contractNo = MESSAGES.contractNoRequired;
  if (!values.signatureDate) errors.signatureDate = MESSAGES.signatureDateRequired;
  if (!values.startDate) errors.startDate = MESSAGES.startDateRequired;
  if (!errors.endDate && !values.endDate) errors.endDate = MESSAGES.endDateRequired;

  return errors;
}

/**
 * Yalnız SAYISAL şart alanlarını doğrular (`advancePct`/`retainagePct`/
 * `paymentTermDays`/`latePenaltyDaily`) — TSD'nin "Sözleşme Şartları"
 * PATCH'i (`ContractTermsValues`) `projectId`/`siteId` gibi bağlam alanları
 * TAŞIMAZ, bu yüzden `validateContractForm`in tamamı çağrılamaz (kalan-6
 * no 320). Aynı sayısal kurallar burada TEKRAR EDİLİR, kod TEKİLDİR
 * (yukarıdaki `pctError`/`numberOrNull` paylaşılır).
 */
export function validateContractTerms(
  values: ContractTermsValues,
): Partial<Record<keyof ContractTermsValues, string>> {
  const errors: Partial<Record<keyof ContractTermsValues, string>> = {};

  const advanceProblem = pctError(values.advancePct);
  if (advanceProblem) errors.advancePct = advanceProblem;
  const retainageProblem = pctError(values.retainagePct);
  if (retainageProblem) errors.retainagePct = retainageProblem;

  const termDays = numberOrNull(values.paymentTermDays);
  if (termDays !== null && (!Number.isInteger(termDays) || termDays < 0)) {
    errors.paymentTermDays = MESSAGES.termDaysInvalid;
  }

  const latePenaltyProblem = latePenaltyError(values.latePenaltyDaily);
  if (latePenaltyProblem) errors.latePenaltyDaily = latePenaltyProblem;

  return errors;
}
