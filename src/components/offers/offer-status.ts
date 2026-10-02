import { toIstanbulDateOnly } from "@/lib/format";

import type { OfferStatus } from "./offer-types";

/** Durum sırası: kartlar ve durum açılırı bu sırayla. */
export const OFFER_STATUSES: readonly OfferStatus[] = ["draft", "sent", "won", "lost", "withdrawn"];

/** Mockup'ta kart olarak çizilen dört durum (TL:92-100); "Vazgeçildi" kartı YOK (ÜS-F3-4). */
export const OFFER_CARD_STATUSES: readonly OfferStatus[] = ["draft", "sent", "won", "lost"];

/** T31: son durum "Vazgeçildi" (backend `withdrawn`). */
export const OFFER_STATUS_LABEL: Readonly<Record<OfferStatus, string>> = {
  draft: "Taslak",
  sent: "Gönderildi",
  won: "Kazanıldı",
  lost: "Kaybedildi",
  withdrawn: "Vazgeçildi",
};

/** Renk tonu — CSS sınıfı `offers-tone--{ton}` (rozet + kart noktası). TL:224; Vazgeçildi koyu gri (ÜS-F3-4). */
export type OfferTone = "neutral" | "primary" | "success" | "danger" | "dark";

export const OFFER_STATUS_TONE: Readonly<Record<OfferStatus, OfferTone>> = {
  draft: "neutral",
  sent: "primary",
  won: "success",
  lost: "danger",
  withdrawn: "dark",
};

/** İstanbul takvim günü (`YYYY-MM-DD`) — UTC günü DEĞİL (21:00Z sonrası TR'de ertesi gündür). */
export function istanbulToday(now: Date): string {
  return toIstanbulDateOnly(now.toISOString());
}

/**
 * "Süresi geçti" = gönderilmiş ∧ geçerlilik < BUGÜN (İstanbul). Bugün = hâlâ geçerli.
 * Türev, yalnız gösterim (TKL-F3 §4.1; backend `expired_count` aynı kuralı sayar).
 */
export function isOfferExpired(status: OfferStatus, validUntil: string, today: string): boolean {
  return status === "sent" && validUntil < today;
}
