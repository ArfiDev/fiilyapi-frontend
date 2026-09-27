/**
 * F-UNIT1 · `POST /projects/{project_id}/units` gövdesinin TEK kurucusu.
 *
 * BEŞ bağlayıcı kural (hepsinin adlı testi `build-body.test.ts`tedir):
 *
 * 1. **KARAR 11 — HİÇBİR ALAN ZORUNLU DEĞİLDİR.** UE 63 · 64 · 65 · 66 · 73 ·
 *    74 · 75 · 76 · 77 · 88 · 94'teki kırmızı `*` YALNIZ UI ipucudur. Boş form
 *    da gövde üretir; istemci "zorunlu alan" diye kaydı ENGELLEMEZ. Bu yüzden
 *    bu klasörde `validate.ts` YOKTUR — bilerek.
 * 2. **ÜRETİLMİŞ TİP TUZAĞI:** `sort_order` ve `sales_status` şemada
 *    varsayılanlıdır ama `openapi-typescript` çıktısında ZORUNLU görünür;
 *    `unit_kind` ise sunucuda gerçekten NOT NULL'dır. ÜÇÜ DE gövdede DAİMA
 *    bulunur — dokunma kapısına GİRMEZLER (ezilecek `NULL` yoktur; kapıya
 *    alınsalardı ölü kod yolu doğardı — `equipment-form/omit-fields.ts` canonu).
 * 3. **DOKUNMA KAPISI:** UE 66 · 75 · 78 · 81 · 93 · 95 seçicilerinin BOŞ
 *    SEÇENEĞİ YOKTUR. Kullanıcı dokunmadıysa anahtar gövdeye HİÇ konmaz,
 *    sütun `NULL` kalır. `parking_right="none"` ("Yok") ile `NULL`
 *    ("belirtilmedi") AYNI ŞEY DEĞİLDİR. Ölçüt "değer boş mu" DEĞİL,
 *    `touched` kümesidir — seçicilerin değeri hiçbir zaman boş olmadığı için
 *    boşluğa bakan bir kapı FİİLEN HİÇ KAPANMAZDI (T1 taslağının kusuru).
 * 4. **🔴 MALİYET SIZINTISI YASAK (KARAR 3):** gövdede `cost` / `unit_cost` /
 *    `expected_profit` / `profit` ADINDA HİÇBİR ANAHTAR OLAMAZ — sunucuda
 *    böyle bir sütun YOKTUR. Aynı şekilde `site_id` (UE 64 süzgeci),
 *    `project_id` (PATH) ve belge anahtarları da gövdeye giremez.
 * 5. **KARAR 2:** `min_sale_price > list_price` bileşimi MEŞRUDUR; istemci
 *    bunu engellemez, düzeltmez, uyarı üretip gövdeyi kırpmaz.
 */

import type { components } from "@/lib/api/schema";
import { normalizeDecimalInput, parseCountInput } from "@/lib/decimal";

import type { UnitFormValues, UnitTouched } from "./form-state";
import type { DeepScale } from "@/lib/api/scale";

export type UnitCreate = DeepScale<components["schemas"]["UnitCreate"]>;

/** Mockup'ta kutusu olmayan `sort_order` için tek kaynak (şema varsayılanı). */
export const UNIT_DEFAULT_SORT_ORDER = 0;

/** Kırpılmış metin; boşsa `undefined` (anahtar HİÇ kurulmaz). */
function text(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Opsiyonel anahtarı YALNIZ değer varken kurar. `{ key: undefined }` yazmak
 * yetmez: `Object.keys` onu SAYAR ve gövde anahtar kümesi testi (18 anahtar)
 * kırmızıya döner.
 */
function entry<K extends string, V>(key: K, value: V | null | undefined): Partial<Record<K, V>> {
  return value === null || value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

export function buildUnitBody(values: UnitFormValues, touched: UnitTouched): UnitCreate {
  return {
    // Üretilmiş tipte ZORUNLU üçlü + NOT NULL `unit_kind`: dokunma kapısına
    // GİRMEZLER, gövdede DAİMA bulunurlar (ezilecek bir `NULL` yoktur).
    block_id: values.blockId, // UE 65
    unit_no: values.unitNo.trim(), // UE 73
    unit_kind: values.unitKind, // UE 74 — sunucuda NOT NULL
    sort_order: UNIT_DEFAULT_SORT_ORDER,
    sales_status: values.salesStatus, // UE 94

    // UE 66 — KARAR 4: `floor` METİNDİR, `Number`a ÇEVRİLMEZ ("Zemin" /
    // "Çatı Katı" sayıya çevrilemez ve `ck_units_floor` diye bir CHECK
    // bilerek YOKTUR).
    ...(touched.has("floor") ? entry("floor", text(values.floor)) : {}),
    ...(touched.has("layout") ? entry("layout", text(values.layout)) : {}), // UE 75
    // UE 76 · 77 · 79 · 88 · 90 · 92 — ondalıklar gövdeye STRING girer.
    ...entry("gross_area_m2", normalizeDecimalInput(values.grossAreaM2)),
    ...entry("net_area_m2", normalizeDecimalInput(values.netAreaM2)),
    ...(touched.has("facing") ? { facing: values.facing } : {}), // UE 78
    ...entry("balcony_area_m2", normalizeDecimalInput(values.balconyAreaM2)),
    ...entry("bathroom_count", parseCountInput(values.bathroomCount)), // UE 80
    ...(touched.has("parkingRight") ? { parking_right: values.parkingRight } : {}), // UE 81
    ...entry("list_price", normalizeDecimalInput(values.listPrice)),
    ...entry("appraisal_value", normalizeDecimalInput(values.appraisalValue)),
    // KARAR 2: `min_sale_price > list_price` MEŞRUDUR — kırpılmaz, düzeltilmez.
    ...entry("min_sale_price", normalizeDecimalInput(values.minSalePrice)),
    ...(touched.has("vatRate") ? { vat_rate: values.vatRate } : {}), // UE 93
    ...(touched.has("ownerSide") ? { owner_side: values.ownerSide } : {}), // UE 95
  };
}
