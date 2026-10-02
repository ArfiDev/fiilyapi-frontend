import type { OfferLoseBody } from "@/lib/api/hooks/useOfferMutations";
import { decimalDigitCounts, parseRefPriceInput, REF_PRICE_AMBIGUOUS_DOT } from "@/lib/tr-decimal";

import { OFFER_TERMS_MAX_LENGTH } from "./offer-detail-form";

/**
 * TKL-F3.5 · Kaybedildi gövdesi (T37 + T30). İki alan da isteğe bağlıdır; BOŞ alan gövdeye GİRMEZ,
 * ikisi de boşsa gövde hiç gönderilmez (`undefined`).
 */

const MAX_AMOUNT_INTEGER_DIGITS = 16;
const AMOUNT_FRACTION_DIGITS = 2;

export const LOSE_MESSAGES = {
  amountInvalid: "Geçerli bir tutar girin",
  amountFraction: `En çok ${AMOUNT_FRACTION_DIGITS} ondalık hane`,
  amountTooLarge: "Tutar çok büyük",
  reasonTooLong: `En çok ${OFFER_TERMS_MAX_LENGTH} karakter`,
} as const;

export interface LoseFormErrors {
  reason?: string;
  amount?: string;
}

export type LoseBodyResult =
  | { ok: true; body: OfferLoseBody | undefined }
  | { ok: false; errors: LoseFormErrors };

export function buildLoseBody(reasonText: string, amountText: string): LoseBodyResult {
  const errors: LoseFormErrors = {};
  const reason = reasonText.trim();
  if (reason.length > OFFER_TERMS_MAX_LENGTH) errors.reason = LOSE_MESSAGES.reasonTooLong;

  let amount = "";
  if (amountText.trim() !== "") {
    const parsed = parseRefPriceInput(amountText);
    if (parsed.kind === "ambiguous") errors.amount = REF_PRICE_AMBIGUOUS_DOT;
    else if (parsed.kind === "invalid") errors.amount = LOSE_MESSAGES.amountInvalid;
    else {
      const counts = decimalDigitCounts(parsed.value);
      if (counts.fraction > AMOUNT_FRACTION_DIGITS) errors.amount = LOSE_MESSAGES.amountFraction;
      else if (counts.integer > MAX_AMOUNT_INTEGER_DIGITS) errors.amount = LOSE_MESSAGES.amountTooLarge;
      else amount = parsed.value;
    }
  }

  if (errors.reason !== undefined || errors.amount !== undefined) return { ok: false, errors };
  const body: OfferLoseBody = {
    ...(reason === "" ? {} : { lost_reason: reason }),
    ...(amount === "" ? {} : { winning_amount: amount }),
  };
  return { ok: true, body: Object.keys(body).length === 0 ? undefined : body };
}
