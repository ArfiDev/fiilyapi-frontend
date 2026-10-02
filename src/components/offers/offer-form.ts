import { compareDecimalStrings, parseCountInput } from "@/lib/decimal";
import type { OfferCreateBody } from "@/lib/api/hooks/useOfferMutations";
import type { OfferSettingsRead } from "@/lib/api/hooks/useOffers";
import { REF_PRICE_AMBIGUOUS_DOT, decimalDigitCounts, parseQuantityInput } from "@/lib/tr-decimal";

/**
 * TKL-F3.4 · "Yeni teklif" formunun SAF modeli (bileşenlerden bağımsız; Detay künye/oran kartları
 * da aynı doğrulamayı kullanacak — plan §3.3).
 *
 * Yüzdeler EKRANDA Türkçe metindir ("12,5"); gövdeye T30 kuralıyla kayıpsız ondalık METİN olarak
 * gider ("12.5") — `Number()` yok. Geçerlilik tam sayıdır (1..365).
 */

/** Backend sınırları (`offers/models.py`: `MAX_PCT`, `MAX_PROFIT_PCT`, `MAX_VALIDITY_DAYS`; `Numeric(5,2)`/`(6,2)`). */
const MAX_PCT = "100";
const MAX_PROFIT_PCT = "999.99";
const PCT_MAX_FRACTION_DIGITS = 2;
const MIN_VALIDITY_DAYS = 1;
const MAX_VALIDITY_DAYS = 365;
export const OFFER_TITLE_MAX_LENGTH = 200;
export const OFFER_SCOPE_MAX_LENGTH = 2000;

/** Başlangıç tipi seçici yalnız bunu etkinleştirir (şablon / kopya B5-F4'te). */
export const OFFER_PRICE_ESCALATION_DEFAULT = "fixed" as const;

export interface OfferFormValues {
  employerId: string;
  title: string;
  scopeSummary: string;
  /** ISO `YYYY-MM-DD` ya da boş. */
  offerDate: string;
  /** Yalnız rakam metni. */
  validityDays: string;
  overheadPct: string;
  profitPct: string;
  vatPct: string;
}

export type OfferFormField = keyof OfferFormValues;
export type OfferFormErrors = Partial<Record<OfferFormField, string>>;

/** TY:218-219 metinleri; kalanlar GECE KURALI ile eklendi (rapor: SABAH ONAYI). */
export const OFFER_FORM_MESSAGES = {
  employerRequired: "İşveren zorunlu",
  titleRequired: "İş adı zorunlu",
  validityRange: `Geçerlilik ${MIN_VALIDITY_DAYS}–${MAX_VALIDITY_DAYS} gün olmalı`,
  pctInvalid: "Geçerli bir yüzde girin",
  pctFraction: `En çok ${PCT_MAX_FRACTION_DIGITS} ondalık hane`,
  pctRange100: "0–100 arasında olmalı",
  pctRangeProfit: "0–999,99 arasında olmalı",
} as const;

/** "12.00" → "12", "15.50" → "15,5": ekran metni (Türkçe virgül, sondaki sıfırlar atılır). */
export function pctToInputText(value: string): string {
  const [whole = "", fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed === "" ? whole : `${whole},${trimmed}`;
}

/** Ön değerler teklif modülünün KENDİ ayarındandır (T32); hiçbiri sabit yazılmaz. */
export function initialOfferFormValues(settings: OfferSettingsRead, today: string): OfferFormValues {
  return {
    employerId: "",
    title: "",
    scopeSummary: "",
    offerDate: today,
    validityDays: String(settings.default_validity_days),
    overheadPct: pctToInputText(settings.default_overhead_pct),
    profitPct: pctToInputText(settings.default_profit_pct),
    vatPct: pctToInputText(settings.default_vat_pct),
  };
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function parseValidity(text: string): number | null {
  const days = parseCountInput(text);
  return days !== null && days >= MIN_VALIDITY_DAYS && days <= MAX_VALIDITY_DAYS ? days : null;
}

/** Bitiş = teklif tarihi + gün (yalnız gösterim; kayıtta sunucu `valid_until` türetir). */
export function validUntilIso(offerDate: string, validityDays: string): string | null {
  const match = ISO_DATE.exec(offerDate);
  const days = parseValidity(validityDays);
  if (match === null || days === null) return null;
  const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Date(start + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Yüzde metni → kayıpsız ondalık dizge ya da satır hatası. */
function parsePct(text: string, max: string, rangeMessage: string): { value: string } | { error: string } {
  const parsed = parseQuantityInput(text);
  if (parsed.kind === "ambiguous") return { error: REF_PRICE_AMBIGUOUS_DOT };
  if (parsed.kind === "invalid") return { error: OFFER_FORM_MESSAGES.pctInvalid };
  if (decimalDigitCounts(parsed.value).fraction > PCT_MAX_FRACTION_DIGITS) {
    return { error: OFFER_FORM_MESSAGES.pctFraction };
  }
  if (compareDecimalStrings(parsed.value, max) > 0) return { error: rangeMessage };
  return { value: parsed.value };
}

const PCT_FIELDS = [
  ["overheadPct", MAX_PCT, OFFER_FORM_MESSAGES.pctRange100],
  ["profitPct", MAX_PROFIT_PCT, OFFER_FORM_MESSAGES.pctRangeProfit],
  ["vatPct", MAX_PCT, OFFER_FORM_MESSAGES.pctRange100],
] as const;

export function validateOfferForm(values: OfferFormValues): OfferFormErrors {
  const errors: { -readonly [K in OfferFormField]?: string } = {};
  if (values.employerId === "") errors.employerId = OFFER_FORM_MESSAGES.employerRequired;
  if (values.title.trim() === "") errors.title = OFFER_FORM_MESSAGES.titleRequired;
  if (parseValidity(values.validityDays) === null) errors.validityDays = OFFER_FORM_MESSAGES.validityRange;
  for (const [field, max, rangeMessage] of PCT_FIELDS) {
    const parsed = parsePct(values[field], max, rangeMessage);
    if ("error" in parsed) errors[field] = parsed.error;
  }
  return errors;
}

/** TY:114 — hata bandının kalın metni. */
export function missingFieldsText(count: number): string {
  return `${count} alan eksik.`;
}

function pctBodyValue(text: string): string {
  const parsed = parseQuantityInput(text);
  if (parsed.kind !== "ok") throw new Error("buildOfferCreateBody: doğrulanmamış yüzde");
  return parsed.value;
}

/**
 * `POST /offers` gövdesi — YALNIZ doğrulanmış form için.
 * · `payment_terms` GÖNDERİLMEZ: Yeni'de alanı yok, sunucu ayar metnini kopyalar (plan §7).
 * · `price_escalation` AÇIKÇA gönderilir (K-F3-5: TS'te zorunlu; varsayılan Sabit, SO-5).
 * · Yüzdeler METİN, geçerlilik tam sayı; boş teklif tarihi/kapsam özeti gönderilmez.
 */
export function buildOfferCreateBody(values: OfferFormValues): OfferCreateBody {
  const validityDays = parseValidity(values.validityDays);
  if (validityDays === null) throw new Error("buildOfferCreateBody: doğrulanmamış geçerlilik");
  const scope = values.scopeSummary.trim();
  return {
    employer_id: values.employerId,
    title: values.title.trim(),
    ...(values.offerDate === "" ? {} : { offer_date: values.offerDate }),
    validity_days: validityDays,
    overhead_pct: pctBodyValue(values.overheadPct),
    profit_pct: pctBodyValue(values.profitPct),
    vat_pct: pctBodyValue(values.vatPct),
    price_escalation: OFFER_PRICE_ESCALATION_DEFAULT,
    ...(scope === "" ? {} : { scope_summary: scope }),
  };
}
