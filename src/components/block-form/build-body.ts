/**
 * F-UNIT1 · `POST /projects/{project_id}/blocks` gövdesinin TEK kurucusu.
 *
 * DÖRT bağlayıcı kural (hepsinin adlı testi `build-body.test.ts`tedir):
 *
 * 1. **KARAR 11 — HİÇBİR ALAN ZORUNLU DEĞİLDİR.** Mockup'taki kırmızı `*`
 *    (BE 62 · 66 · 70 · 79) YALNIZ UI ipucudur. BOŞ form da gövde üretir;
 *    istemci "zorunlu alan" diye kaydı ENGELLEMEZ. Bu yüzden bu klasörde
 *    `validate.ts` YOKTUR — bilerek.
 * 2. **ÜRETİLMİŞ TİP TUZAĞI:** `sort_order` şemada varsayılanlıdır (`0`) ama
 *    `openapi-typescript` çıktısında ZORUNLU görünür. Mockup'ta karşılığı
 *    olmadığı için forma GİRMEZ, gövdeye ise DAİMA `0` olarak girer
 *    (`SupplierModal` / `stock-entry-form` emsali).
 * 3. **DOKUNMA KAPISI (F-İK/MK-1 canonu):** BE 80 · 82 · 86 · 101 seçicilerinin
 *    BOŞ SEÇENEĞİ YOKTUR — kullanıcı hiç açmasa bile ekranda bir değer görünür.
 *    Ölçüt "değer boş mu" DEĞİL, `touched` kümesidir: bu dört seçicinin değeri
 *    hiçbir zaman boş olmadığı için boşluğa bakan bir kapı HİÇ KAPANMAZDI.
 *    Kullanıcı dokunmadıysa anahtar gövdeye HİÇ konmaz, sütun `NULL` kalır.
 *    Gerekçe oluşturma kipinde de geçerlidir: `roof_type="none"` ("Yok") ile
 *    `NULL` ("belirtilmedi") AYNI ŞEY DEĞİLDİR; ilkini kullanıcı adına
 *    seçmek onun VERMEDİĞİ bir kararı veriye yazmak olurdu.
 * 4. **PENDING SIZINTISI YASAK:** BE 109 "toplu ünite üretimine geç" kutusu
 *    gövdeye HİÇBİR anahtar eklemez; `project_id` de gövdede DEĞİL PATH'tedir.
 *
 * Boş bırakılan isteğe bağlı alan için anahtar HİÇ kurulmaz (`null` göndermek
 * ile göndermemek sunucuda aynı; gövdeyi gürültüsüz tutmak anahtar KÜMESİ
 * testini okunur kılar).
 */

import type { components } from "@/lib/api/schema";
import { normalizeDecimalInput, parseCountInput } from "@/lib/decimal";

import type { BlockFormValues, BlockTouched } from "./form-state";
import type { DeepScale } from "@/lib/api/scale";

export type BlockCreate = DeepScale<components["schemas"]["BlockCreate"]>;

/** Mockup'ta kutusu olmayan `sort_order` için tek kaynak (şema varsayılanı). */
export const BLOCK_DEFAULT_SORT_ORDER = 0;

/** Kırpılmış metin; boşsa `undefined` (anahtar HİÇ kurulmaz). */
function text(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Opsiyonel anahtarı YALNIZ değer varken kurar. `{ key: undefined }` yazmak
 * yetmez: `Object.keys` onu SAYAR ve gövde anahtar kümesi testi (16 anahtar)
 * kırmızıya döner.
 */
function entry<K extends string, V>(key: K, value: V | null | undefined): Partial<Record<K, V>> {
  return value === null || value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

export function buildBlockBody(values: BlockFormValues, touched: BlockTouched): BlockCreate {
  return {
    // BE 70 — `name` şemada ZORUNLUDUR: boş da olsa gövdede bulunur. Kararı
    // sunucu verir (KARAR 11), istemci 422 taklidi yapmaz.
    name: values.name.trim(),
    sort_order: BLOCK_DEFAULT_SORT_ORDER,

    ...entry("site_id", text(values.siteId)), // BE 66
    ...entry("code", text(values.code)), // BE 71 — boşsa sunucu ÜRETİR
    ...entry("basement_floor_count", parseCountInput(values.basementFloorCount)), // BE 78
    ...entry("floor_count", parseCountInput(values.floorCount)), // BE 79
    ...(touched.has("roofType") ? { roof_type: values.roofType } : {}), // BE 80
    ...entry("units_per_floor", parseCountInput(values.unitsPerFloor)), // BE 81
    ...(touched.has("groundFloorUsage")
      ? { ground_floor_usage: values.groundFloorUsage }
      : {}), // BE 82
    ...entry("shop_count", parseCountInput(values.shopCount)), // BE 83
    // BE 84 — ondalık(12,2) gövdeye STRING girer (şema `number | string`);
    // `Number()`e çevirmek kuruş hassasiyetini riske atardı.
    ...entry("construction_area_m2", normalizeDecimalInput(values.constructionAreaM2)),
    ...entry("elevator_count", parseCountInput(values.elevatorCount)), // BE 85
    ...(touched.has("parkingType") ? { parking_type: values.parkingType } : {}), // BE 86
    ...entry("estimated_delivery_date", text(values.estimatedDeliveryDate)), // BE 100
    ...(touched.has("status") ? { status: values.status } : {}), // BE 101
    ...entry("notes", text(values.notes)), // BE 102
  };
}
