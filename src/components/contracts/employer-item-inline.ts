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
  validateEmployerUnitPriceField,
  validateQuantityField,
} from "@/components/contract-item-form/validate";
// Ondalık gösterim yardımcısı taşeron emsalinden PAYLAŞILIR — ikinci bir
// kopya yazmak "aynı formül iki yerde YAŞAMAZ" kuralını çiğnerdi.
import { decimalInputValue } from "@/components/subcontractor-contract-form/item-rows";
import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

export { decimalInputValue };

export type EmployerItemUpdateBody = DeepScale<components["schemas"]["EmployerContractItemUpdate"]>;

/** Hücrede düzenlenebilen iki alan (E14 kolonları 80 ve 81). */
export type InlineCellField = "quantity" | "unitPrice";

/** Bir satırın kirli hücreleri; tanımsız alan "dokunulmadı" demektir. */
export interface InlineRowDraft {
  quantity?: string;
  unitPrice?: string;
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
  if (next === decimalInputValue(serverValue)) return { kind: "noop" };

  const problem =
    field === "quantity" ? validateQuantityField(next) : validateEmployerUnitPriceField(next);
  if (problem) return { kind: "error", message: problem.message };

  // 🔴 Metin AYNEN gider: `Number()` turu yoktur (hassasiyet kaybı önlemi,
  // openapi `anyOf: [number, string]` buna izin verir).
  return {
    kind: "patch",
    body: field === "quantity" ? { quantity: next } : { unit_price: next },
  };
}
