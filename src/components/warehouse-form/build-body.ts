/**
 * "Yeni Depo Ekle" gövde üreticisi (SAF, React'sız, ayrı test edilir).
 *
 * 🔴 `site_id` SEÇİLMEZSE GÖVDEDE HİÇ TAŞINMAZ ve MERKEZ DEPO oluşur (backend
 * spec §7 S2b · `WarehouseCreate` docstring'i: "`site_id` NULL = MERKEZ
 * DEPO"). `siteId ?? ""` YAZILMAZ — boş dize "bilinmiyor" değil "boş metin"
 * demektir ve UUID beklenen alanda 422 üretir. Bu bir kaza değil,
 * sözleşmenin kendisidir.
 */

import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

export type WarehouseCreate = DeepScale<components["schemas"]["WarehouseCreate"]>;

export function buildWarehouseBody(name: string, siteId: string): WarehouseCreate {
  const trimmedSiteId = siteId.trim();
  return {
    name: name.trim(),
    ...(trimmedSiteId ? { site_id: trimmedSiteId } : {}),
  };
}
