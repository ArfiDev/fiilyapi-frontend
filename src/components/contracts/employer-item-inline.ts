/**
 * F-ISVPOZ · E14 "İş Kalemleri" tablosunun SATIR-İÇİ düzenlemesinin SAF
 * katmanı (React'sız, ayrı test edilir).
 *
 * Emsal İCAT EDİLMEDİ: taşeron tarafında satır-içi düzenleme zaten vardır
 * (`subcontractor-contract-form/ContractItemsCard.tsx` — hücrede `Input`,
 * `onBlur`da kaydetme, `decimalInputValue` ile gösterim). Bu modül aynı
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
  parseEmployerUnitPrice,
  validateQuantityField,
  validateUnitField,
} from "@/components/contract-item-form/validate";
// Ondalık gösterim yardımcısı taşeron emsalinden PAYLAŞILIR — ikinci bir
// kopya yazmak "aynı formül iki yerde YAŞAMAZ" kuralını çiğnerdi.
import { decimalInputValue } from "@/components/subcontractor-contract-form/item-rows";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

export { decimalInputValue };

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
  //    karşılaştırmak DOĞRUDUR: `decimalInputValue(null)` da `""` üretir, yani
  //    maskeli hücreye dokunmayan kullanıcı istek UÇURMAZ.
  serverValue: string | null,
): InlineCommit {
  if (draft === undefined) return { kind: "noop" };
  const next = draft.trim();
  // 🔴 K1 · birim fiyat T30 kuralıyla okunur ("28.500" = 28500); gövde OKUNMUŞ metindir.
  if (field === "unitPrice") return commitUnitPrice(next, serverValue);
  return commitOtherCell(field, next, serverValue);
}

function commitOtherCell(
  field: Exclude<InlineCellField, "unitPrice">,
  next: string,
  serverValue: string | null,
): InlineCommit {
  const isText = field === "code" || field === "description" || field === "unit";
  const shown = isText ? (serverValue ?? "").trim() : decimalInputValue(serverValue);
  if (next === shown) return { kind: "noop" };

  const problem = validateCell(field, next);
  if (problem) return { kind: "error", message: problem.message };

  // 🔴 Metin AYNEN gider: `Number()` turu yoktur (hassasiyet kaybı önlemi,
  // openapi `anyOf: [number, string]` buna izin verir).
  return { kind: "patch", body: bodyFor(field, next) };
}

function commitUnitPrice(next: string, serverValue: string | null): InlineCommit {
  // Ham metin gösterilenle AYNIYSA (maskeli null ↔ "" dahil) dokunulmamıştır.
  if (next === decimalInputValue(serverValue)) return { kind: "noop" };
  const parsed = parseEmployerUnitPrice(next);
  if (parsed.kind === "error") return { kind: "error", message: parsed.problem.message };
  // Aynı sayıyı başka yazımla ("1.850" ↔ "1850.00") yazmak istek UÇURMAZ.
  if (decimalInputValue(parsed.value) === decimalInputValue(serverValue)) return { kind: "noop" };
  return { kind: "patch", body: { unit_price: parsed.value } };
}

function validateCell(field: Exclude<InlineCellField, "unitPrice">, next: string) {
  switch (field) {
    case "quantity":
      return validateQuantityField(next);
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
