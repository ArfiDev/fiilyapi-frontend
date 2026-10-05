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

/**
 * IZN-F4c.2 — bordro tutarları (dönem/özet/SGK özeti/satır) ve personel ücreti: `maas_kisisel` + `tum_tutarlar`.
 * Sözleşme `IZN-B4c-SOZLESME.md` §2: bordro TUTAR alanları maas_kisisel gizliyken `null` döner.
 */
export const PAYROLL_HIDDEN_CATEGORIES: readonly HiddenCategory[] = ["maas_kisisel", "tum_tutarlar"];

/** Personel kimlik/iletişim alanları (tc_no, iban, sgk_no, phone, email, address, acil durum, doğum tarihi): yalnız `maas_kisisel`. */
export const PERSONNEL_PII_HIDDEN_CATEGORIES: readonly HiddenCategory[] = ["maas_kisisel"];

/**
 * IZN-F4d.2 — makine / stok / satınalma tutarları (alış-piyasa değeri, kira, yakıt, birim fiyat, stok değeri,
 * teklif/sipariş/talep tutarı): `maliyet_kar` + `tum_tutarlar`. Sözleşme `IZN-B4d-SOZLESME.md` §1.
 * (Makine kira ödenen toplamı + ödenecek tutar ayrıca `banka_kasa` ister: `EQUIPMENT_PAYMENT_HIDDEN_CATEGORIES`.)
 */
export const COST_HIDDEN_CATEGORIES: readonly HiddenCategory[] = ["maliyet_kar", "tum_tutarlar"];

/** Makine kira faturası ödenecek tutar / ödenen kümülatif: `banka_kasa` VEYA `maliyet_kar` gizliyse `null`. */
export const EQUIPMENT_PAYMENT_HIDDEN_CATEGORIES: readonly HiddenCategory[] = [
  "banka_kasa",
  "maliyet_kar",
  "tum_tutarlar",
];

/** Günlük kayıt birim fiyat / satır tutarı / günlük toplamı / özet tutarları: `sozlesme_fiyat` + `maliyet_kar` + `tum_tutarlar`. */
export const SITE_DIARY_HIDDEN_CATEGORIES: readonly HiddenCategory[] = [
  "sozlesme_fiyat",
  "maliyet_kar",
  "tum_tutarlar",
];
