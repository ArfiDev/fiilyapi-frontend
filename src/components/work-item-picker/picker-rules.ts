/**
 * TKL-F3.6 · seçici HEDEF KURALLARI (TKL-F3-PLAN §3.1 farkları tablosu — SAF veri, React'sız).
 *
 * Seçici iki tüketiciye hizmet eder: işveren sözleşmesi (F2) ve teklif revizyonu (F3). Doğrulama ve
 * seçilemezlik kararlarının hedefe göre değişen kısmı yalnız bu küçük veri nesnesidir; `picker-model`
 * bunu parametre olarak alır, varsayılanı SÖZLEŞMEDİR (F2 davranışı birebir). Metin/gövde farkları
 * `picker-target.ts`te toplanır.
 */
import { MAX_LENGTH } from "@/components/contract-item-form/constants";
import { MAX_CONVERT_GROUP_NAME, MAX_CONVERT_ITEMS, MSG_TOO_MANY } from "@/components/offer-convert/convert-limits";
import { MAX_TEMPLATE_ITEMS, MSG_ITEMS_TOO_MANY } from "@/components/offer-templates/template-content";
import {
  OFFER_PRICE_LIMITS,
  OFFER_QUANTITY_LIMITS,
  fractionLimitMessage,
  maxLimitMessage,
  type DecimalLimits,
} from "@/lib/offer-limits";

/**
 * Seçicinin KULLANICIYA gösterdiği nesne adı: sözleşmede "poz", teklifte "kalem" (TKL-F3.6.1). Sayaç, altbilgi,
 * düğme, bant ve boş-durum metinleri buradan kurulur; "Poz No" sütunu/arama alanı gerçek alan adıdır, DEĞİŞMEZ.
 */
export interface PickerWords {
  /** "poz" · "kalem". */
  noun: string;
  /** "Poz" · "Kalem" (cümle başı). */
  nounCap: string;
  /** "Pozu" · "Kalemi" (düğme: "3 Pozu Ekle"). */
  accusativeCap: string;
  /** "pozda" · "kalemde" ("2 pozda eksik …"). */
  locative: string;
  /** "pozların" · "kalemlerin" ("Görünen pozların tümünü seç"). */
  pluralGenitive: string;
}

export const CONTRACT_WORDS: PickerWords = {
  noun: "poz",
  nounCap: "Poz",
  accusativeCap: "Pozu",
  locative: "pozda",
  pluralGenitive: "pozların",
};

export const OFFER_WORDS: PickerWords = {
  noun: "kalem",
  nounCap: "Kalem",
  accusativeCap: "Kalemi",
  locative: "kalemde",
  pluralGenitive: "kalemlerin",
};

export interface PickerPriceMessages {
  required: string;
  notANumber: string;
  negative: string;
}

/**
 * Bir sayı alanının hane sınırı. `digits`: tam basamak sayısı (sözleşme — backend hane sınırı taşımaz, kolon
 * `Numeric` taşması); `max`: üst DEĞER (teklif — backend `le=` sınırı). Önce kesir, sonra aşım denetlenir.
 */
export type DecimalBound =
  | { kind: "digits"; fraction: number; integer: number; fractionMessage: string; integerMessage: string }
  | { kind: "max"; fraction: number; max: string; fractionMessage: string; maxMessage: string };

/** `priced`: miktar + fiyat girilir (sözleşme, teklif). `selectOnly`: yalnız kalem seçilir (şablon — miktar/fiyat tutulmaz). */
export type PickerEntryMode = "priced" | "selectOnly";

export interface PickerRules {
  entryMode: PickerEntryMode;
  /** `selectOnly`: hedefteki TOPLAM kalem tavanı (şablon 1000); `null` = yalnız tek-istek tavanı. */
  maxTotalItems: number | null;
  /** Toplam tavan aşılınca bant metni (`maxTotalItems` doluyken). */
  totalCapMessage: string;
  /** Sözleşme: birim fiyat ZORUNLU. Teklif: maliyet B.F. isteğe bağlı (fiyatsız kalem, T31). */
  isPriceRequired: boolean;
  priceMessages: PickerPriceMessages;
  /** Sözleşme: aynı `code` başka kalemde kullanılıyorsa seçilemez. Teklif: poz no kopyadır, çakışma yok. */
  blocksOnCodeCollision: boolean;
  /** "{linkedLabel} · {grup}" — katalog kalemi hedefte zaten varsa gerekçe. */
  linkedLabel: string;
  /** Başka kalemde kullanılan poz no gerekçesi (yalnız `blocksOnCodeCollision`). */
  codeBlockText: string;
  /** Miktar hane sınırı (hedefe göre). */
  quantityBound: DecimalBound;
  /** Fiyat (birim fiyat / maliyet B.F.) hane sınırı (hedefe göre). */
  priceBound: DecimalBound;
  /** Kullanıcıya gösterilen nesne adı (poz / kalem). */
  words: PickerWords;
  /**
   * Hedef gruplar YEREL (backend grubu yok): "+ Yeni Grup" adı "Yeni grup"/"Yeni grup 2"… ile DOLU başlar ve
   * aynı ad reddedilir (şablon, dönüştürme). Sözleşme/teklifte ad boş başlar (grup sunucuda açılır).
   */
  usesLocalGroups: boolean;
  /** "+ Yeni Grup" adı üst sınırı (karakter): sözleşme/teklif/şablon 2000, dönüştürme 200 (backend grup adı). */
  groupNameMax: number;
  /**
   * Σ "Eklenecek Tutar" SATIR BAŞI ROUND_HALF_UP toplamıdır (dönüştürme: sunucu `Σ ROUND(miktar × B.F.)` yazar, tablo Σ'sı ile
   * kuruşu kuruşuna aynı). Diğer hedeflerde Σ kayıpsız çarpımların toplamıdır.
   */
  roundsLineAmounts: boolean;
}

function maxBound(limits: DecimalLimits): DecimalBound {
  return {
    kind: "max",
    fraction: limits.fraction,
    max: limits.max,
    fractionMessage: fractionLimitMessage(limits),
    maxMessage: maxLimitMessage(limits),
  };
}

/** `contract-item-form/validate.ts` ONAYLI metinleri (birebir; `picker-model.test.ts` drift bekçisi). */
export const CONTRACT_RULES: PickerRules = {
  entryMode: "priced",
  maxTotalItems: null,
  totalCapMessage: "",
  isPriceRequired: true,
  priceMessages: {
    required: "Birim fiyat girin",
    notANumber: "Birim Fiyat sayı olmalıdır.",
    negative: "Birim Fiyat negatif olamaz.",
  },
  blocksOnCodeCollision: true,
  linkedLabel: "Sözleşmede var",
  codeBlockText: "Bu poz no sözleşmede başka bir kalemde kullanılıyor",
  // ⚠️ Backend hane sınırı TAŞIMAZ (openapi'de yok; kolonlar Numeric(14,3)/(18,2)) → istemci korkuluğu TEK savunma.
  quantityBound: { kind: "digits", fraction: 3, integer: 11, fractionMessage: "En fazla 3 ondalık", integerMessage: "En fazla 11 basamak" },
  priceBound: { kind: "digits", fraction: 2, integer: 16, fractionMessage: "En fazla 2 ondalık", integerMessage: "En fazla 16 basamak" },
  words: CONTRACT_WORDS,
  usesLocalGroups: false,
  groupNameMax: MAX_LENGTH.groupName,
  roundsLineAmounts: false,
};

/** Teklif: maliyet B.F. isteğe bağlı; "Teklifte var · {grup}"; poz no kopya olduğundan kod çakışması engel DEĞİL. */
export const OFFER_RULES: PickerRules = {
  entryMode: "priced",
  maxTotalItems: null,
  totalCapMessage: "",
  isPriceRequired: false,
  priceMessages: {
    // Boş kutu "girin" hatası DEĞİL (fiyatsız kalem); alan yalnız tutarlılık için dolu.
    required: "Maliyet B.F. girin",
    notANumber: "Maliyet B.F. sayı olmalıdır.",
    negative: "Maliyet B.F. negatif olamaz.",
  },
  blocksOnCodeCollision: false,
  linkedLabel: "Teklifte var",
  codeBlockText: "",
  // Kalem tablosuyla TEK KAYNAK (`lib/offer-limits`): backend `le=` sınırı; metinler de aynı.
  quantityBound: maxBound(OFFER_QUANTITY_LIMITS),
  priceBound: maxBound(OFFER_PRICE_LIMITS),
  words: OFFER_WORDS,
  usesLocalGroups: false,
  groupNameMax: MAX_LENGTH.groupName,
  roundsLineAmounts: false,
};

/** Şablon: miktar/fiyat YOK (`selectOnly`); kalem bağı katalog kimliğidir → poz no çakışması engel DEĞİL; tavan 1000. */
export const TEMPLATE_RULES: PickerRules = {
  entryMode: "selectOnly",
  maxTotalItems: MAX_TEMPLATE_ITEMS,
  totalCapMessage: MSG_ITEMS_TOO_MANY,
  isPriceRequired: false,
  priceMessages: { required: "", notANumber: "", negative: "" },
  blocksOnCodeCollision: false,
  linkedLabel: "Şablonda var",
  codeBlockText: "",
  quantityBound: maxBound(OFFER_QUANTITY_LIMITS),
  priceBound: maxBound(OFFER_PRICE_LIMITS),
  words: OFFER_WORDS,
  usesLocalGroups: true,
  groupNameMax: MAX_LENGTH.groupName,
  roundsLineAmounts: false,
};

/**
 * TKL-F5.4 · dönüştürme (Dönüştür › Adım 2): fiyatlı mod; gövde YEREL satırlar. Miktar BOŞ + zorunlu, birim fiyat zorunlu
 * (dahil satırda B.F. dolu ≥ 0). Dönüştürme listesinde (dahil YA DA çıkarılmış) olan katalog kalemi "Listede var · {grup}".
 * Poz no çakışması engel DEĞİL (tablo çakışan satırda kod düzenleyicisini açar). Tavan: YALNIZ 2000 − dahil kalem (tek seferlik 200 sınırı YOK, F5.4b). Grup adı ≤ 200; Σ satır başı yuvarlanır.
 * Hane sınırları `convert-parse` ile AYNI tek kaynaktan (`lib/offer-limits`).
 */
export const CONVERT_RULES: PickerRules = {
  entryMode: "priced",
  maxTotalItems: MAX_CONVERT_ITEMS,
  totalCapMessage: MSG_TOO_MANY,
  isPriceRequired: true,
  priceMessages: {
    required: "Birim fiyat girin",
    notANumber: "Birim fiyat sayı olmalıdır.",
    negative: "Birim fiyat negatif olamaz.",
  },
  blocksOnCodeCollision: false,
  linkedLabel: "Listede var",
  codeBlockText: "",
  quantityBound: maxBound(OFFER_QUANTITY_LIMITS),
  priceBound: maxBound(OFFER_PRICE_LIMITS),
  words: OFFER_WORDS,
  usesLocalGroups: true,
  groupNameMax: MAX_CONVERT_GROUP_NAME,
  roundsLineAmounts: true,
};
