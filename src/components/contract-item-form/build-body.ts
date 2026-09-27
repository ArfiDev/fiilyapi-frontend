/**
 * "Poz Ekle" formlarının SAF gövde üreticileri (React'sız, ayrı test edilir).
 *
 * 🔴 PARA/MİKTAR DEĞERLERİ DECIMAL-STRING TAŞINIR: `quantity`/`unit_price`
 * hiçbir yerde `Number()`a çevrilmez, kullanıcının yazdığı metin aynen gider
 * (hassasiyet kaybı önlemi; openapi `anyOf: [number, string]` buna izin verir).
 *
 * 🔴 İŞV formunun fiyat farkı alanları (mockup 178-200) gövdeye GİRMEZ:
 * `EmployerContractItemCreate` şemasında böyle bir alan YOKTUR — ayar
 * sözleşmenindir, poz onu devralır.
 */

import type { components } from "@/lib/api/schema";

import type { ContractItemFormValues, EmployerItemFormValues } from "./validate";
import type { DeepScale } from "@/lib/api/scale";

export type SubcontractorItemCreateBody =
  DeepScale<components["schemas"]["SubcontractorContractItemCreate"]>;
export type EmployerItemCreateBody = DeepScale<components["schemas"]["EmployerContractItemCreate"]>;

/**
 * Yeni satırın varsayılan sırası: mevcut en büyük `sort_order` + 1.
 * Mockup'taki "6" (TAŞ 101) ve "11" (İŞV 126) GÖSTERMELİK rakamlardır —
 * gerçek değer listeden türetilir.
 */
export function nextSortOrder(values: readonly number[]): number {
  return values.reduce((acc, value) => (value > acc ? value : acc), -1) + 1;
}

/** Kullanıcı `Sıra`ya dokunmadıysa hesaplanan varsayılan kullanılır. */
function resolveSortOrder(raw: string, fallback: number): number {
  const trimmed = raw.trim();
  return trimmed ? Number.parseInt(trimmed, 10) : fallback;
}

/**
 * TAŞ gövdesi. `unit_price` boşsa `null` gider — `0` ASLA türetilmez
 * ("girilmedi" ile "sıfır fiyat" iki AYRI şeydir; TSD'nin hücre düzenlemesi
 * de aynı kuralı uygular).
 */
export function buildSubcontractorItemBody(
  values: ContractItemFormValues,
  fallbackSortOrder: number,
): SubcontractorItemCreateBody {
  const price = values.unitPrice.trim();
  return {
    code: values.code.trim(),
    description: values.description.trim(),
    unit: values.unit.trim(),
    quantity: values.quantity.trim(),
    unit_price: price ? price : null,
    sort_order: resolveSortOrder(values.sortOrder, fallbackSortOrder),
  };
}

/**
 * İŞV gövdesi. `unit_price` ZORUNLUdur (şema `required`) — doğrulama zaten
 * boş geçirmez, burada boş metin gövdeye KONMAZ; `null` da yazılmaz çünkü
 * şema `null` kabul etmez.
 */
export function buildEmployerItemBody(
  values: EmployerItemFormValues,
  fallbackSortOrder: number,
): EmployerItemCreateBody {
  return {
    group_id: values.groupId,
    code: values.code.trim(),
    description: values.description.trim(),
    unit: values.unit.trim(),
    quantity: values.quantity.trim(),
    unit_price: values.unitPrice.trim(),
    sort_order: resolveSortOrder(values.sortOrder, fallbackSortOrder),
  };
}
