// TKL-F3.2 · Teklif Hazırlama önbellek anahtarları TEK yerde.
//
// Okuma hook'ları (`useOffers.ts`) ve yazma hook'ları (`useOfferMutations.ts`) birbirini
// ithal etmeden aynı anahtarları paylaşır; anahtar biçimi değişirse tek dosya değişir.
//
//   ["offers", filtre]                       liste (+ özet kartları)
//   ["offer", id]                            detay (künye + revizyon özetleri + geçmiş)
//   ["offer", id, "revision", rev]           revizyon (koşullar + gruplar + kalemler + toplamlar)
//   ["offer-settings"]                       teklif ayarları (varsayılan oranlar)
//   ["offer-templates"]                      şablon listesi (+ sayaçlar: grup/kalem/kullanım)
//   ["offer-template", id]                   şablon detayı (gruplar + kalemler, TKL-F4)
//
// 🔴 `["offer", id]` revizyon anahtarının ÖN EKİDİR: `exact` verilmeden geçersizleme tüm
// revizyon okumalarını da tazeler (yeni revizyon açılınca eski revizyonların `is_latest`i
// değişir) — `exact: true` yalnız detayı tazeler. İkisini AYIRMAK yazma hook'larının işidir.

export const OFFERS_QUERY_KEY = "offers";
export const OFFER_QUERY_KEY = "offer";
export const OFFER_REVISION_SEGMENT = "revision";
export const OFFER_SETTINGS_QUERY_KEY = "offer-settings";
export const OFFER_TEMPLATES_QUERY_KEY = "offer-templates";
export const OFFER_TEMPLATE_QUERY_KEY = "offer-template";

/** Liste süzgeci — yalnız dolu alanlar anahtara girer (boş = süzgeç yok). */
export interface OfferListFilter {
  status?: "draft" | "sent" | "won" | "lost" | "withdrawn";
  q?: string;
  employerId?: string;
  /** Son revizyonun teklif tarihi, dahil-dahil (ISO `YYYY-MM-DD`). */
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

/** Aynı süzgeç → aynı anahtar (alan sırası ve boş alanlar anahtarı DEĞİŞTİRMEZ). */
export function normalizeOfferListFilter(filter: OfferListFilter): OfferListFilter {
  const entries = Object.entries(filter).filter(
    ([, value]) => value !== undefined && value !== "" && value !== null,
  );
  return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) as OfferListFilter;
}

export function offerListKey(filter: OfferListFilter = {}): readonly unknown[] {
  return [OFFERS_QUERY_KEY, normalizeOfferListFilter(filter)];
}

export function offerDetailKey(offerId: string): readonly unknown[] {
  return [OFFER_QUERY_KEY, offerId];
}

export function offerRevisionKey(offerId: string, revNo: number): readonly unknown[] {
  return [OFFER_QUERY_KEY, offerId, OFFER_REVISION_SEGMENT, revNo];
}

export function offerSettingsKey(): readonly unknown[] {
  return [OFFER_SETTINGS_QUERY_KEY];
}

// 🔴 `["offer-template"]` (tekil) şablon DETAYLARININ ön ekidir; `["offer-templates"]` (çoğul) listedir —
// iki dizi birbirinin öneki DEĞİLDİR (öğe eşitliği): "varsayılan yap" ön ekle TÜM detayları, listeyi AYRICA tazeler.

export function offerTemplatesKey(): readonly unknown[] {
  return [OFFER_TEMPLATES_QUERY_KEY];
}

export function offerTemplateKey(templateId: string): readonly unknown[] {
  return [OFFER_TEMPLATE_QUERY_KEY, templateId];
}
