/**
 * TKL-F5.2 · dönüştürme modelinin TİPLERİ (SAF; React'sız). Plan: TKL-F5-PLAN §3.
 * Durum NESNE olarak taşınır ve her işlem YENİ nesne döndürür (mutasyon YOK).
 */
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

/** `POST /offers/{id}/convert` gövdesi (F5.1 `OfferConvertBody` ile AYNI tip — `convert-body.test.ts` bağlar). */
export type ConvertRequest = DeepScale<components["schemas"]["ConvertRequest"]>;
export type PriceIndexType = components["schemas"]["PriceIndexType"];

/** Teklifteki değerler (salt okunur başvuru). Yeni satırda alanlar null, `amount` "0.00". */
export interface ConvertRowOffer {
  qty: string | null;
  /** Müşteri B.F. (`customer.unit_price`); fiyatsız kalemde null. */
  unitPrice: string | null;
  /** `customer.amount`; fiyatsız / miktarsızda "0.00". */
  amount: string;
}

export interface ConvertRow {
  key: string;
  groupKey: string;
  /** Yalnız tekliften gelen satırda dolu (sunucu adam-saati ondan okur, SO-33). */
  offerItemId: string | null;
  catalogItemId: string;
  /** Sözleşme kalem kodu (başlangıçta teklif `poz_no`); yalnız çakışmada düzenlenir. */
  code: string;
  description: string;
  unit: string;
  offer: ConvertRowOffer;
  /** Kutuların YAZILDIĞI gibi (TR) metni — kontrollü girdi; ayrıştırma `convert-parse`. */
  contract: { qtyRaw: string; bfRaw: string };
  included: boolean;
  isNew: boolean;
  /** Sistem notu ("Katalogdan eklendi · teklifte yoktu"); serbest not YOK (ÜS-F5-17). */
  note: string | null;
  /** Katalog disiplini; katalogda bulunamayan satırda null ("bilinmiyor"). */
  disciplineId: string | null;
  /** Kullanıcı kodu elle düzenledi: düzenleyici çakışma çözülünce de AÇIK kalır (yazarken kaybolmasın). */
  codeEdited: boolean;
}

export interface ConvertGroupDraft {
  key: string;
  /** Güncel (düzenlenebilir) ad. */
  name: string;
  /** Tekliftekiyle aynı metin (başvuru). */
  offerName: string;
  /** Karışık grup için elle seçilen disiplin; yoksa null. */
  disciplineId: string | null;
  nameEdited: boolean;
}

export interface ConvertDraft {
  groups: readonly ConvertGroupDraft[];
  /** Grup sırası × grup içi sıra korunur. */
  rows: readonly ConvertRow[];
  /** Yeni satır anahtarı sayacı (saf: durum nesnesinde taşınır). */
  nextNewSeq: number;
}

/** Adım 1 formu (yerel durum; hepsi METİN). */
export interface ConvertForm {
  projectName: string;
  /** İsteğe bağlı (K-F5-1/BD-2): boşsa sunucu `PRJ-YYYY-NNN` üretir ve gövdeye HİÇ girmez. */
  projectCode: string;
  city: string;
  contractNo: string;
  signatureDate: string;
  startDate: string;
  endDate: string;
  hasPriceEscalation: boolean;
  /** Boş = seçilmedi. */
  indexType: PriceIndexType | "";
  baseIndexValue: string;
  openSite: boolean;
  siteName: string;
}

/** Ekran adımı (yerel durum; URL'de taşınmaz — ÜS-F5-1). */
export type ConvertStep = 1 | 2 | 3;
