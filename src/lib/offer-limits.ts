/**
 * TKL-F3.6.1 · teklif kalemi hane sınırları — TEK KAYNAK (kalem tablosu `offer-item-cells` + katalog seçicisinin
 * teklif hedefi `picker-rules` aynı sabitleri okur; metin de aynıdır). Backend sınırları (`offer_schemas.py`):
 * miktar ≤ 1e9 / 3 kesir · a-s ≤ 1e6 / 4 kesir · fiyat (maliyet B.F.) ≤ 1e12 / 2 kesir. SAF veri, React'sız.
 */
export interface DecimalLimits {
  /** En çok ondalık (kesir) hane. */
  fraction: number;
  /** Üst sınır (dahil), kayıpsız ondalık metin. */
  max: string;
  /** Üst sınırın kullanıcıya gösterilen biçimi ("1.000.000.000"). */
  maxText: string;
}

export const OFFER_QUANTITY_LIMITS: DecimalLimits = { fraction: 3, max: "1000000000", maxText: "1.000.000.000" };
export const OFFER_MHR_LIMITS: DecimalLimits = { fraction: 4, max: "1000000", maxText: "1.000.000" };
export const OFFER_PRICE_LIMITS: DecimalLimits = { fraction: 2, max: "1000000000000", maxText: "1.000.000.000.000" };

export function fractionLimitMessage(limits: DecimalLimits): string {
  return `En fazla ${limits.fraction} ondalık`;
}

export function maxLimitMessage(limits: DecimalLimits): string {
  return `En fazla ${limits.maxText}`;
}
