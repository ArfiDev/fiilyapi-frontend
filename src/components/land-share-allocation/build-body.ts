/**
 * F-UNIT2 · `PATCH /projects/{project_id}/units/allocation` gövdesinin TEK
 * kurucusu. 🔴 Uç **PATCH**tir — POST/PUT DEĞİL.
 *
 * DÖRT bağlayıcı kural (hepsinin adlı testi `build-body.test.ts`tedir):
 *
 * 1. **🔴 YALNIZ GERÇEKTEN DEĞİŞEN SATIRLAR GİDER.** Uç ATOMİKTİR
 *    (`service.py`: *"tek satir bile reddedilirse hicbiri yazilmaz"*; başka
 *    projenin ünitesi 404 üretir ve bu projenin hiçbir satırı değişmez).
 *    Ekrandaki 42 satırın hepsini göndermek, kullanıcı 3'ünü değiştirmiş olsa
 *    bile TÜM kaydın yıkılma yüzeyini 42 satıra genişletirdi. Karşılaştırma
 *    SUNUCU satırıyla yapılır: bekleyen atama sunucudakiyle aynıysa DÜŞÜRÜLÜR.
 * 2. **🔴 `owner_side: null` MEŞRU BİR DEĞERDİR** (PG 144 "Atanmadı";
 *    `schemas.py`: *"`owner_side=None` atamayi kaldirir"*). Doğruluk
 *    kontrolüyle (`if (ownerSide)`) elenirse kullanıcı bir atamayı ASLA
 *    kaldıramaz — klasik `null` ile `undefined` tuzağı. Anahtar DAİMA kurulur.
 * 3. **HİSSEDAR DAİMA GÖNDERİLİR** (`null` olsa bile). Sunucu alanı
 *    göndermemeyi de `None` sayar, ama açıkça yazmak "ARSA'dan çıkan ünitenin
 *    hissedarı AYNI istekte temizlenir" sözleşmesini gövdede GÖRÜNÜR kılar.
 * 4. **LİSTEDE OLMAYAN BEKLEYEN ATAMA GÖNDERİLMEZ.** Sayfa değiştiren
 *    kullanıcının önceki sayfada yaptığı atamalar durumda kalabilir; gövde
 *    GÖRÜNEN satırlardan kurulur, çünkü listede olmayan bir `unit_id` (başka
 *    projeninki ya da silinmiş olan) TÜM isteği 404'e düşürürdü.
 */

import type { components } from "@/lib/api/schema";

import { effectiveAllocation, type AllocationState, type LandShareUnitRow } from "./allocation-state";
import type { DeepScale } from "@/lib/api/scale";

export type UnitAllocationRequest = components["schemas"]["UnitAllocationRequest"];
export type UnitAllocationItem = DeepScale<components["schemas"]["UnitAllocationItem"]>;

/** Sunucudaki hâl ile ekrandaki hâl AYNI mı? */
function isUnchanged(row: LandShareUnitRow, state: AllocationState): boolean {
  const current = effectiveAllocation(row, state);
  return (
    current.ownerSide === row.owner_side && current.shareholderId === row.shareholder_id
  );
}

export function changedAllocationItems(
  rows: readonly LandShareUnitRow[],
  state: AllocationState,
): readonly UnitAllocationItem[] {
  return rows
    .filter((row) => state.pending.has(row.unit_id) && !isUnchanged(row, state))
    .map((row) => {
      const current = effectiveAllocation(row, state);
      return {
        unit_id: row.unit_id,
        // Kural 2: `null` DÜŞÜRÜLMEZ — anahtar daima kurulur.
        owner_side: current.ownerSide,
        shareholder_id: current.shareholderId,
      };
    });
}

/**
 * `UnitAllocationRequest.items` sunucuda `min_length=1`dir: değişiklik yokken
 * istek atmak 422 üretirdi. Kaydet düğmesi bu yanıtla kapatılır ve gerekçe
 * (`ALLOCATION_NO_CHANGES_MESSAGE`) GÖRÜNÜR basılır.
 */
export function hasAllocationChanges(
  rows: readonly LandShareUnitRow[],
  state: AllocationState,
): boolean {
  return changedAllocationItems(rows, state).length > 0;
}

export function buildAllocationBody(
  rows: readonly LandShareUnitRow[],
  state: AllocationState,
): UnitAllocationRequest {
  return { items: [...changedAllocationItems(rows, state)] };
}
