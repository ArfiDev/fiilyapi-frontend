/**
 * F-UNIT2 · `POST /projects/{project_id}/units/bulk` (ve `…/bulk/preview`)
 * gövdesinin TEK kurucusu. İki uç AYNI gövdeyi alır — önizleme ile kaydın
 * ayrı kurucuları olsaydı kullanıcı bir şeyi önizleyip BAŞKA bir şey yazardı.
 *
 * ALTI bağlayıcı kural (hepsinin adlı testi `build-body.test.ts`tedir):
 *
 * 1. **🔴 MALİYET SIZINTISI YASAK (KARAR 3):** ne gövdede ne SLOT'LARDA
 *    `cost` / `maliyet` / `profit` / `kar` adında anahtar olabilir — sunucuda
 *    böyle bir sütun YOKTUR (`units/models.py`, `UnitBulkSlot` yorumu).
 *    TU 104 sütunu ekranda devre dışı basılır ama gövdeye HİÇ dokunmaz.
 * 2. **🔴 `site_id` GÖVDEYE GİRMEZ.** TU 62 şantiyesi YALNIZ blok listesini
 *    daraltır; şantiye bloktan türer (*"tek otorite `blocks`"*). EI (Excel
 *    içe aktarma) ile KARIŞTIRILMAMALIDIR: orada `site_id` GERÇEK bir gövde
 *    alanıdır (`unit-import/build-request.ts`). İki ekranı aynı sanmak sessiz
 *    hata olurdu. `project_id` de PATH parametresidir, gövde alanı değil.
 * 3. **ÜRETİLMİŞ TİP TUZAĞI:** `roof_floor` · `numbering` · `prefix` ·
 *    `start_number` şemada varsayılanlıdır ama `openapi-typescript` çıktısında
 *    ZORUNLU görünür. Hepsi gövdede DAİMA bulunur.
 * 4. **DOKUNMA KAPISI SATIR İÇİNDEDİR:** TU 109/112 seçicilerinin BOŞ
 *    SEÇENEĞİ YOKTUR ama `UnitBulkSlot.layout`/`.facing` NULLABLE'dır.
 *    Kullanıcı dokunmadıysa anahtar KONMAZ. Ölçüt `touched` kümesidir,
 *    "değer boş mu" değil (`unit-form/build-body.ts` kural 3).
 * 5. **`slots` YA HEP YA HİÇ:** sunucu `len(slots) == units_per_floor` ister.
 *    Bir hücre bile doluysa TÜM satırlar gider; hiçbiri dolu değilse anahtar
 *    HİÇ konmaz ve sunucunun "ortak varsayılanlar" yolu (P3 davranışı) açık kalır.
 * 6. **🔴 SEÇİLMEMİŞ SAYI SESSİZCE 0 OLMAZ.** KARAR 11 emsali istemcinin
 *    "zorunlu alan" reddini yasaklar, ama seçilmemiş katı `0` yapmak "Zemin"
 *    demekti ve kullanıcı istemediği bir katta ünite üretirdi. Bunun yerine
 *    sunucu sınırlarının DIŞINDAKİ sabitler gider: istek 422 döner, hiçbir
 *    şey yazılmaz ve ekran TU 73 türevinden ("incomplete") sebebi zaten basar.
 */

import type { components } from "@/lib/api/schema";
import { normalizeDecimalInput, parseCountInput } from "@/lib/decimal";

import { resolveEndFloor, parseFloorValue, type FloorRange } from "./floor-range";
import type { BulkUnitFormValues } from "./form-state";
import { hasFilledSlot, type BulkSlotValues } from "./slots";
import type { DeepScale } from "@/lib/api/scale";

export type UnitBulkCreate = DeepScale<components["schemas"]["UnitBulkCreate"]>;
export type UnitBulkSlot = components["schemas"]["UnitBulkSlot"];

/**
 * TU'da kutusu olmayan `prefix` için tek kaynak (şema varsayılanı). Mockup'ın
 * dört deseni `{Blok}` jetonuyla çalışır; ön ek SY 132-135 ekranının işidir.
 */
export const BULK_DEFAULT_PREFIX = "";

/** TU 84 boşken şema varsayılanı. `0` MEŞRU bir değerdir ve 1'e yuvarlanmaz. */
export const BULK_DEFAULT_START_NUMBER = 1;

/**
 * Seçilmemiş kat. 🔴 `Field(ge=-5, le=100)` DIŞINDA seçildi: sunucu 422 döner.
 * `0` yazmak "Zemin" demekti ve seçim yapmamış kullanıcı sessizce zemin katta
 * ünite üretirdi.
 */
export const BULK_UNSET_FLOOR = -99;

/** Boş "Kat Başına Daire". `Field(ge=1)` dışıdır → sunucu reddeder. */
export const BULK_UNSET_UNITS_PER_FLOOR = 0;

/** Kırpılmış metin; boşsa `undefined` (anahtar HİÇ kurulmaz). */
function text(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Opsiyonel anahtarı YALNIZ değer varken kurar. `{ key: undefined }` yazmak
 * yetmez: `Object.keys` onu SAYAR ve anahtar kümesi testi kırmızıya döner.
 */
function entry<K extends string, V>(key: K, value: V | null | undefined): Partial<Record<K, V>> {
  return value === null || value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function buildSlot(slot: BulkSlotValues): UnitBulkSlot {
  return {
    sequence: slot.sequence, // TU 98 — `resizeSlots` üretir, elle girilmez
    ...(slot.touched.has("layout") ? entry("layout", text(slot.layout)) : {}), // TU 99
    ...entry("gross_area_m2", normalizeDecimalInput(slot.grossAreaM2)), // TU 100
    ...entry("net_area_m2", normalizeDecimalInput(slot.netAreaM2)), // TU 101
    ...(slot.touched.has("facing") ? { facing: slot.facing } : {}), // TU 102
    ...entry("list_price", normalizeDecimalInput(slot.listPrice)), // TU 103
    // TU 104 "Maliyet (₺)": karşılığı YOK (karar 3) — kural 1.
  };
}

export function buildBulkUnitBody(
  values: BulkUnitFormValues,
  range: FloorRange,
): UnitBulkCreate {
  // TU 71 — BİR kutu → İKİ alan. Sentinel burada tüketilir ve gövdeye
  // metin olarak ASLA geçmez.
  const end = resolveEndFloor(values.endFloor, range);
  const startFloor = parseFloorValue(values.startFloor);
  const unitsPerFloor = parseCountInput(values.unitsPerFloor);
  const startNumber = parseCountInput(values.startNumber);

  return {
    block_id: values.blockId, // TU 63
    unit_kind: values.unitKind, // MOCKUP + BİR; sunucuda NOT NULL
    start_floor: startFloor ?? BULK_UNSET_FLOOR, // TU 70
    end_floor: end.endFloor ?? BULK_UNSET_FLOOR, // TU 71
    roof_floor: end.roofFloor, // TU 71 "Çatı Katı"
    units_per_floor: unitsPerFloor ?? BULK_UNSET_UNITS_PER_FLOOR, // TU 72
    numbering: values.numbering, // TU 79
    prefix: BULK_DEFAULT_PREFIX, // mockup'ta kutusu YOK
    start_number: startNumber ?? BULK_DEFAULT_START_NUMBER, // TU 84

    // TU 96-135 — YA HEP YA HİÇ (kural 5).
    ...(hasFilledSlot(values.slots) ? { slots: values.slots.map(buildSlot) } : {}),

    // TU 137-138 — kutucuk kapalıysa yüzde gövdeye GİRMEZ; kutucuğun kendisi
    // gövdede karşılığı OLMAYAN bir UI kontrolüdür.
    ...(values.floorPriceIncreaseEnabled
      ? entry("floor_price_increase_pct", normalizeDecimalInput(values.floorPriceIncreasePct))
      : {}),
  };
}
