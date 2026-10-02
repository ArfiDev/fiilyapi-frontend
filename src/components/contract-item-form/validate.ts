/**
 * "Poz Ekle" formlarının SAF doğrulaması (React'sız, ayrı test edilir).
 *
 * Sıra MOCKUP sırasıdır: ilk hatalı alan bulunur ve odak oraya verilir
 * (`BoqItemFormModal` emsali). Kurallar openapi şemalarından gelir:
 *   `code`/`description`/`unit`  → zorunlu + `maxLength`
 *   `quantity`                   → zorunlu, `exclusiveMinimum: 0`
 *   `unit_price`                 → TAŞ'ta nullable, İŞV'de zorunlu; `minimum: 0`
 *   `group_id`                   → yalnız İŞV'de, zorunlu
 */

import {
  decimalDigitCounts,
  parseQuantityInput,
  parseRefPriceInput,
  REF_PRICE_AMBIGUOUS_DOT,
} from "@/lib/tr-decimal";

import { MAX_LENGTH, NEW_GROUP_OPTION } from "./constants";

export type ContractItemFormField =
  | "group"
  | "groupName"
  | "code"
  | "description"
  | "unit"
  | "quantity"
  | "unitPrice"
  | "sortOrder";

export interface ContractItemFormProblem {
  field: ContractItemFormField;
  message: string;
}

/** Ortak alanlar — iki form da bunları taşır. */
export interface ContractItemFormValues {
  code: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  sortOrder: string;
}

export interface EmployerItemFormValues extends ContractItemFormValues {
  /** Mevcut grubun id'si YA DA `NEW_GROUP_OPTION` sentinel'i. */
  groupId: string;
  /** Yalnız sentinel seçiliyken anlamlı: yaratılacak grubun adı. */
  groupName: string;
}

/**
 * openapi'nin ondalık deseni (`anyOf` string dalı). Değer STRING kalır;
 * doğrulama için `Number()`a çevrilse bile gövdeye giden metin bozulmaz.
 */
const DECIMAL_PATTERN = /^(?!^[-+.]*$)[+-]?0*\d*\.?\d*$/;

export function isDecimalString(raw: string): boolean {
  return DECIMAL_PATTERN.test(raw.trim());
}

/** Doğrulama için sayısal karşılık; `NaN` = okunamadı. */
function decimalValue(raw: string): number {
  return Number(raw.trim());
}

function tooLong(value: string, max: number): boolean {
  return value.trim().length > max;
}

/**
 * 🔴 ALAN DÜZEYİNDE KISITLAR — TEK KAYNAK.
 *
 * `quantity` (`exclusiveMinimum: 0`) ve İŞV `unit_price` (`minimum: 0` +
 * zorunlu) kuralları openapi TİPİNDE İFADE EDİLEMEZ: üretilen TS `quantity?:
 * number | string | null` der, "sıfırdan büyük" demez. `typecheck` yeşilken
 * canlı 422 verir. Bu yüzden kural İSTEMCİ KORKULUĞU olarak yaşar ve
 * korkuluk **tek bir yerde** durur: hem tam form (`validateEmployerItem`)
 * hem de tablo içi hücre düzenlemesi (`EmployerContractItemsTable`) BU
 * fonksiyonları çağırır. İkinci bir kopya yazılırsa biri bayatlar.
 *
 * ⚠️ `min={0}` YETMEZ — sıfır DAHİL DEĞİLDİR (yaygın hata). Sınav:
 * `quantity = "0"` REDDEDİLİR.
 */
export function validateQuantityField(raw: string): ContractItemFormProblem | null {
  if (!raw.trim()) return { field: "quantity", message: "Miktar zorunludur." };
  if (!isDecimalString(raw)) return { field: "quantity", message: "Miktar sayı olmalıdır." };
  if (!(decimalValue(raw) > 0))
    return { field: "quantity", message: "Miktar sıfırdan büyük olmalıdır." };
  return null;
}

/** İŞV `unit_price`: ZORUNLU (mockup 94 "Fiyatsız poz girilemez") + `minimum: 0`. */
export function validateEmployerUnitPriceField(
  raw: string,
): ContractItemFormProblem | null {
  const price = raw.trim();
  if (!price) return { field: "unitPrice", message: "Birim Fiyat zorunludur." };
  if (!isDecimalString(price)) return { field: "unitPrice", message: "Birim Fiyat sayı olmalıdır." };
  if (!(decimalValue(price) >= 0))
    return { field: "unitPrice", message: "Birim Fiyat negatif olamaz." };
  return null;
}

/** `unit_price` kolonu `Numeric(18,2)`: backend hane sınırı DENETLEMEZ, fazlayı sessizce yuvarlar. */
const PRICE_MAX_FRACTION = 2;
const PRICE_MAX_INTEGER = 16;
const PRICE_FRACTION_LIMIT = "En fazla 2 ondalık";
const PRICE_DIGIT_LIMIT = "En fazla 16 basamak";

export type EmployerUnitPriceParse =
  | { kind: "ok"; value: string }
  | { kind: "error"; problem: ContractItemFormProblem };

/**
 * 🔴 TKL-F2.4 · K1 — İŞV birim fiyatının METİN girişi (satır-içi hücre + yeni satır) T30 kuralıyla
 * okunur: nokta BİNLİK, virgül ondalık, belirsiz "28.5" reddedilir (`lib/tr-decimal.ts` TEK kaynak).
 * Eskiden `isDecimalString` "28.500"ü 28,50 sayıp sözleşme bedeline sessizce yazıyordu.
 * Dönen `value` nokta-ondalık METİNdir (gövdeye aynen girer; `Number()` YOK).
 * TKL-F2.6a · K6: tekli form artık metin girişidir ve BU yolu kullanır.
 */
export function parseEmployerUnitPrice(raw: string): EmployerUnitPriceParse {
  const text = raw.trim();
  const fail = (message: string): EmployerUnitPriceParse => ({
    kind: "error",
    problem: { field: "unitPrice", message },
  });
  if (!text) return fail("Birim Fiyat zorunludur.");
  const isNegative = text.startsWith("-");
  const parsed = parseRefPriceInput(isNegative ? text.slice(1) : text);
  if (parsed.kind === "ambiguous") return fail(REF_PRICE_AMBIGUOUS_DOT);
  if (parsed.kind === "invalid") return fail("Birim Fiyat sayı olmalıdır.");
  if (isNegative) return fail("Birim Fiyat negatif olamaz.");
  const digits = decimalDigitCounts(parsed.value);
  if (digits.fraction > PRICE_MAX_FRACTION) return fail(PRICE_FRACTION_LIMIT);
  if (digits.integer > PRICE_MAX_INTEGER) return fail(PRICE_DIGIT_LIMIT);
  return { kind: "ok", value: parsed.value };
}

/** `quantity` kolonu `Numeric(14,3)`: backend hane sınırı DENETLEMEZ, fazlayı sessizce yuvarlar. */
const QUANTITY_MAX_FRACTION = 3;
const QUANTITY_MAX_INTEGER = 11;
const QUANTITY_FRACTION_LIMIT = "En fazla 3 ondalık";
const QUANTITY_DIGIT_LIMIT = "En fazla 11 basamak";

export type EmployerQuantityParse =
  | { kind: "ok"; value: string }
  | { kind: "error"; problem: ContractItemFormProblem };

/**
 * 🔴 TKL-F2.6a · K6/K7 — İŞV miktarının METİN girişi (tekli form + satır-içi hücre + yeni satır)
 * T30 kuralıyla okunur: nokta BİNLİK, virgül ondalık ("1.500" = 1500, "1,5" = 1,5), belirsiz
 * "1.5"/"0.500" reddedilir (`lib/tr-decimal.ts` TEK kaynak; `parseEmployerUnitPrice`in ikizi).
 * Sıfır/negatif kuralı `validateQuantityField` ile aynı metni taşır. Dönen `value` nokta-ondalık
 * METİNdir (gövdeye aynen girer; `Number()` YOK).
 */
export function parseEmployerQuantity(raw: string): EmployerQuantityParse {
  const text = raw.trim();
  const fail = (message: string): EmployerQuantityParse => ({
    kind: "error",
    problem: { field: "quantity", message },
  });
  if (!text) return fail("Miktar zorunludur.");
  const isNegative = text.startsWith("-");
  const parsed = parseQuantityInput(isNegative ? text.slice(1) : text);
  if (parsed.kind === "ambiguous") return fail(REF_PRICE_AMBIGUOUS_DOT);
  if (parsed.kind === "invalid") return fail("Miktar sayı olmalıdır.");
  if (isNegative || !/[1-9]/.test(parsed.value)) return fail("Miktar sıfırdan büyük olmalıdır.");
  const digits = decimalDigitCounts(parsed.value);
  if (digits.fraction > QUANTITY_MAX_FRACTION) return fail(QUANTITY_FRACTION_LIMIT);
  if (digits.integer > QUANTITY_MAX_INTEGER) return fail(QUANTITY_DIGIT_LIMIT);
  return { kind: "ok", value: parsed.value };
}

export type SubcontractorUnitPriceParse =
  /** `value: null` = fiyat girilmedi (isteğe bağlı alan; `0` ASLA türetilmez). */
  | { kind: "ok"; value: string | null }
  | { kind: "error"; problem: ContractItemFormProblem };

/**
 * 🔴 TKL-F7a · T42 — TAŞ birim fiyatı (kalem modalı + satır-içi hücre) T30 ile okunur; `parseEmployerUnitPrice`in
 * ikizi, FARKLARI: alan İSTEĞE BAĞLIDIR (boş → `value: null`) ve mesajlar "Taşeron Birim Fiyatı" der.
 * Dönen `value` nokta-ondalık METİNdir (`Number()` YOK).
 */
export function parseSubcontractorUnitPrice(raw: string): SubcontractorUnitPriceParse {
  const text = raw.trim();
  if (!text) return { kind: "ok", value: null };
  const fail = (message: string): SubcontractorUnitPriceParse => ({
    kind: "error",
    problem: { field: "unitPrice", message },
  });
  const isNegative = text.startsWith("-");
  const parsed = parseRefPriceInput(isNegative ? text.slice(1) : text);
  if (parsed.kind === "ambiguous") return fail(REF_PRICE_AMBIGUOUS_DOT);
  if (parsed.kind === "invalid") return fail("Taşeron Birim Fiyatı sayı olmalıdır.");
  if (isNegative) return fail("Taşeron Birim Fiyatı negatif olamaz.");
  const digits = decimalDigitCounts(parsed.value);
  if (digits.fraction > PRICE_MAX_FRACTION) return fail(PRICE_FRACTION_LIMIT);
  if (digits.integer > PRICE_MAX_INTEGER) return fail(PRICE_DIGIT_LIMIT);
  return { kind: "ok", value: parsed.value };
}

/** Poz No: zorunlu + `maxLength` — form ve satır-içi hücre AYNI kuralı kullanır. */
export function validateCodeField(raw: string): ContractItemFormProblem | null {
  if (!raw.trim()) return { field: "code", message: "Poz No zorunludur." };
  if (tooLong(raw, MAX_LENGTH.code))
    return { field: "code", message: `Poz No en fazla ${MAX_LENGTH.code} karakter olabilir.` };
  return null;
}

/** İş Kalemi Tanımı: zorunlu + `maxLength`. */
export function validateDescriptionField(raw: string): ContractItemFormProblem | null {
  if (!raw.trim()) return { field: "description", message: "İş Kalemi Tanımı zorunludur." };
  if (tooLong(raw, MAX_LENGTH.description))
    return {
      field: "description",
      message: `İş Kalemi Tanımı en fazla ${MAX_LENGTH.description} karakter olabilir.`,
    };
  return null;
}

/** Birim: zorunlu + `maxLength`. */
export function validateUnitField(raw: string): ContractItemFormProblem | null {
  if (!raw.trim()) return { field: "unit", message: "Birim zorunludur." };
  if (tooLong(raw, MAX_LENGTH.unit))
    return { field: "unit", message: `Birim en fazla ${MAX_LENGTH.unit} karakter olabilir.` };
  return null;
}

/** `Sıra` boş bırakılabilir; doluysa negatif olmayan tam sayıdır. */
function validateSortOrder(raw: string): ContractItemFormProblem | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed))
    return { field: "sortOrder", message: "Sıra negatif olmayan tam sayı olmalıdır." };
  return null;
}

/**
 * TAŞ formu. `unit_price` BOŞ bırakılabilir (mockup 142 "Boş bırakılabilir");
 * doluysa negatif olamaz. Boş fiyat HATA DEĞİLDİR — uyarı gösterilir (140-148).
 */
export function validateSubcontractorItem(
  values: ContractItemFormValues,
): ContractItemFormProblem | null {
  // 🔴 TKL-F7a · T42: miktar ve fiyat METİN girişidir → T30 ayrıştırıcıları (belirsiz nokta dahil).
  const text =
    validateCodeField(values.code) ??
    validateDescriptionField(values.description) ??
    validateUnitField(values.unit);
  if (text) return text;

  const quantity = parseEmployerQuantity(values.quantity);
  if (quantity.kind === "error") return quantity.problem;

  const price = parseSubcontractorUnitPrice(values.unitPrice);
  if (price.kind === "error") return price.problem;

  return validateSortOrder(values.sortOrder);
}

/**
 * İŞV formu. İki fark: `group_id` zorunlu (mockup 104) ve `unit_price`
 * ZORUNLU (163 — "Fiyatsız poz girilemez", 94).
 *
 * "+ Yeni Grup" seçiliyken `groupId` sentinel taşır — o hâlde zorunluluk
 * GRUP ADI alanına kayar (`BoqItemFormModal` 136-137 emsali; oradaki
 * "Grup adı zorunludur." metni birebir kullanılır). Boş seçimin metni İŞV'nin
 * kendi envanterindeki "Poz Grubu zorunludur." olarak KALIR.
 */
export function validateEmployerItem(
  values: EmployerItemFormValues,
): ContractItemFormProblem | null {
  if (!values.groupId.trim()) return { field: "group", message: "Poz Grubu zorunludur." };
  if (values.groupId === NEW_GROUP_OPTION && !values.groupName.trim())
    return { field: "groupName", message: "Grup adı zorunludur." };
  // İKİ KATMAN: `maxLength` girdiyi yazarken keser, bu dal yapıştırma/otomatik
  // doldurma yolunu kapatır — `code`/`description`/`unit` ile AYNI desen.
  // Sınır openapi `EmployerContractGroupCreate.name` (2000) ile birebirdir;
  // aşılırsa sunucu 422 döner, kullanıcı düzeltilebilir bir mesaj görmelidir.
  if (values.groupId === NEW_GROUP_OPTION && tooLong(values.groupName, MAX_LENGTH.groupName))
    return {
      field: "groupName",
      message: `Grup Adı en fazla ${MAX_LENGTH.groupName} karakter olabilir.`,
    };

  // 🔴 K6: miktar ve fiyat METİN girişidir → T30 ayrıştırıcıları (belirsiz nokta dahil).
  const text =
    validateCodeField(values.code) ??
    validateDescriptionField(values.description) ??
    validateUnitField(values.unit);
  if (text) return text;

  const quantity = parseEmployerQuantity(values.quantity);
  if (quantity.kind === "error") return quantity.problem;

  const price = parseEmployerUnitPrice(values.unitPrice);
  if (price.kind === "error") return price.problem;

  return validateSortOrder(values.sortOrder);
}
