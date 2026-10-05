import type { HiddenCategory } from "@/lib/api/models";

/**
 * IZN-F4b.2 — mali modüllerde tutar alanlarının bağlı olduğu hassas alan kategorileri.
 * Kaynak: backend `IZN-B4-ALANLAR.md` (modül · şema · alan · kategori). Para alanları kendi
 * kategorilerine VE `tum_tutarlar` rol bayrağına bağlıdır.
 *
 * 🔴 Bu listeler bir GİZLEME KARARI VERMEZ: maskeyi backend uygular (değer `null`). Burada yalnız
 * "null NEDEN geldi?" sorusu için (`useCategoryHidden`/`isCategoryHidden`) kategori kümesi adlandırılır.
 */
export const ACCOUNTING_HIDDEN_CATEGORIES: readonly HiddenCategory[] = [
  "banka_kasa",
  "maliyet_kar",
  "tum_tutarlar",
];

/** Fatura tutarları (`InvoiceResponse`…): muhasebe kümesi + alıcı/satıcı. */
export const INVOICE_HIDDEN_CATEGORIES: readonly HiddenCategory[] = [
  "banka_kasa",
  "maliyet_kar",
  "satis_alici",
  "tum_tutarlar",
];

/** Hazine (banka/kasa, çek-senet, ödeme, nakit akışı). */
export const TREASURY_HIDDEN_CATEGORIES: readonly HiddenCategory[] = ["banka_kasa", "tum_tutarlar"];

/** İşveren hakedişi tutarları. */
export const EMPLOYER_PAYMENT_HIDDEN_CATEGORIES: readonly HiddenCategory[] = [
  "sozlesme_fiyat",
  "tum_tutarlar",
];

/** Taşeron hakedişi tutarları. */
export const SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES: readonly HiddenCategory[] = [
  "maliyet_kar",
  "tum_tutarlar",
];
