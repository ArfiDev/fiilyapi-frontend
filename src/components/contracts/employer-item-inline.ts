/**
 * F-ISVPOZ · E14 "İş Kalemleri" tablosunun SATIR-İÇİ düzenlemesinin SAF
 * katmanı (React'sız, ayrı test edilir).
 *
 * Emsal İCAT EDİLMEDİ: taşeron tarafında satır-içi düzenleme zaten vardır
 * (`subcontractor-contract-form/ContractItemsCard.tsx` — hücrede `Input`,
 * `onBlur`da kaydetme, Türkçe biçimli gösterim — K7). Bu modül aynı
 * etkileşim dilinin işveren tarafındaki karar tablosudur.
 *
 * 🔴 EMSALDEN TEK BİLİNÇLİ SAPMA — İSTEMCİ KORKULUĞU:
 * taşeron kartı hücreyi doğrulamadan gönderir ve sunucunun 422'sini basar.
 * İşveren ucunun kısıtları (`quantity` `exclusiveMinimum: 0`, `unit_price`
 * `minimum: 0`) üretilen TS tipinde İFADE EDİLEMEZ; `typecheck` yeşilken
 * `quantity = 0` canlıda 422 döner. Bu yüzden istek UÇMADAN ÖNCE elenir.
 * Kural burada YAZILMAZ, `contract-item-form/validate.ts`ten ÇAĞRILIR —
 * korkuluk tek kaynaktan gelir (form ile tablo aynı cümleyi kurar).
 */

import {
  validateCodeField,
  validateDescriptionField,
  parseEmployerQuantity,
  parseEmployerUnitPrice,
  validateUnitField,
} from "@/components/contract-item-form/validate";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

/**
 * 🔴 TKL-F2.6a · K7 — hücre GÖSTERİMİ de T30'dur (ayrıştırma ile AYNI değişiklikte; yoksa gösterilen
 * "2.125" yeniden okunurken 2125 olurdu). Taşeron emsalinin `decimalInputValue`si nokta-ondalık
 * gösterir ve taşeron tarafında KALIR; İŞV hücresi Türkçe biçim kullanır: binlik nokta + ondalık
 * virgül. Dize üzerinde çalışır (`Number()` YOK) ve `parseEmployerQuantity/UnitPrice` ile gidiş-dönüş
 * KAYIPSIZDIR — gösterilen metin aynen geri yazılırsa istek uçmaz.
 */
const PLAIN_DECIMAL = /^(\d+)(?:\.(\d*))?$/;
const THOUSANDS_GROUP = /\B(?=(\d{3})+(?!\d))/g;
/** Fiyat HER ZAMAN en az 2 kesir hanesiyle gösterilir ("28.500,00"). */
const PRICE_DISPLAY_FRACTION = 2;
const QUANTITY_DISPLAY_FRACTION = 0;

function trInputValue(raw: string | null, minFraction: number): string {
  if (raw === null) return "";
  const trimmed = raw.trim();
  const match = PLAIN_DECIMAL.exec(trimmed);
  if (!match) return trimmed;
  const [, integerPart = "", fractionPart = ""] = match;
  const whole = integerPart.replace(/^0+(?=\d)/, "").replace(THOUSANDS_GROUP, ".");
  const fraction = fractionPart.replace(/0+$/, "").padEnd(minFraction, "0");
  return fraction === "" ? whole : `${whole},${fraction}`;
}

/** Miktar hücresi: "3200.000" → "3.200", "2.125" → "2,125". */
export function trQuantityInputValue(raw: string | null): string {
  return trInputValue(raw, QUANTITY_DISPLAY_FRACTION);
}

/** Birim fiyat hücresi: "28500.00" → "28.500,00". */
export function trPriceInputValue(raw: string | null): string {
  return trInputValue(raw, PRICE_DISPLAY_FRACTION);
}

export type EmployerItemUpdateBody = DeepScale<components["schemas"]["EmployerContractItemUpdate"]>;

/** Hücrede düzenlenebilen iki alan (E14 kolonları 80 ve 81). */
export type InlineCellField = "quantity" | "unitPrice" | "code" | "description" | "unit";

/** Bir satırın kirli hücreleri; tanımsız alan "dokunulmadı" demektir. */
export interface InlineRowDraft {
  quantity?: string;
  unitPrice?: string;
  code?: string;
  description?: string;
  unit?: string;
}

export type InlineCommit =
  /** Değer değişmedi ya da hücreye hiç dokunulmadı — istek UÇMAZ. */
  | { kind: "noop" }
  /** Kısıt ihlali — istek UÇMAZ, hücre sunucu değerine döner. */
  | { kind: "error"; message: string }
  /** Kısmi gövde: yalnız değişen alan. */
  | { kind: "patch"; body: EmployerItemUpdateBody };

/**
 * Tek bir hücrenin kaydetme kararı.
 *
 * `serverValue` kalemin uçtan gelen ham ondalık metnidir (`"1200.000"`);
 * karşılaştırma GÖSTERİM biçiminde yapılır, yoksa hücreye hiç dokunmayan
 * kullanıcı bile her odak çıkışında istek uçururdu.
 */
export function commitInlineCell(
  field: InlineCellField,
  draft: string | undefined,
  // 🔴 KAPSAM MASKESİ (2026-09-19): sunucu değeri `null` gelebilir. `""` ile
  //    karşılaştırmak DOĞRUDUR: `trQuantityInputValue(null)` da `""` üretir, yani
  //    maskeli hücreye dokunmayan kullanıcı istek UÇURMAZ.
  serverValue: string | null,
): InlineCommit {
  if (draft === undefined) return { kind: "noop" };
  const next = draft.trim();
  // 🔴 K1/K7 · birim fiyat ve miktar T30 kuralıyla okunur ("28.500" = 28500); gövde OKUNMUŞ metindir.
  if (field === "unitPrice") return commitUnitPrice(next, serverValue);
  if (field === "quantity") return commitQuantity(next, serverValue);
  return commitTextCell(field, next, serverValue);
}

function commitTextCell(
  field: Exclude<InlineCellField, "unitPrice" | "quantity">,
  next: string,
  serverValue: string | null,
): InlineCommit {
  if (next === (serverValue ?? "").trim()) return { kind: "noop" };

  const problem = validateCell(field, next);
  if (problem) return { kind: "error", message: problem.message };

  return { kind: "patch", body: bodyFor(field, next) };
}

function commitUnitPrice(next: string, serverValue: string | null): InlineCommit {
  // Ham metin gösterilenle AYNIYSA (maskeli null ↔ "" dahil) dokunulmamıştır.
  if (next === trPriceInputValue(serverValue)) return { kind: "noop" };
  const parsed = parseEmployerUnitPrice(next);
  if (parsed.kind === "error") return { kind: "error", message: parsed.problem.message };
  // Aynı sayıyı başka yazımla ("1.850" ↔ "1850,00") yazmak istek UÇURMAZ.
  if (trPriceInputValue(parsed.value) === trPriceInputValue(serverValue)) return { kind: "noop" };
  return { kind: "patch", body: { unit_price: parsed.value } };
}

function commitQuantity(next: string, serverValue: string | null): InlineCommit {
  if (next === trQuantityInputValue(serverValue)) return { kind: "noop" };
  const parsed = parseEmployerQuantity(next);
  if (parsed.kind === "error") return { kind: "error", message: parsed.problem.message };
  if (trQuantityInputValue(parsed.value) === trQuantityInputValue(serverValue)) {
    return { kind: "noop" };
  }
  // 🔴 Metin AYNEN gider: `Number()` turu yoktur (hassasiyet kaybı önlemi).
  return { kind: "patch", body: { quantity: parsed.value } };
}

function validateCell(field: Exclude<InlineCellField, "unitPrice" | "quantity">, next: string) {
  switch (field) {
    case "code":
      return validateCodeField(next);
    case "description":
      return validateDescriptionField(next);
    case "unit":
      return validateUnitField(next);
  }
}

function bodyFor(field: InlineCellField, next: string): EmployerItemUpdateBody {
  switch (field) {
    case "quantity":
      return { quantity: next };
    case "unitPrice":
      return { unit_price: next };
    case "code":
      return { code: next };
    case "description":
      return { description: next };
    case "unit":
      return { unit: next };
  }
}
