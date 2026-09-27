/**
 * F-UNIT1 · UE 66 "Kat" seçeneklerinin SAF türevi — DOM'suz, test edilir.
 *
 * 🔴 KAT LİSTESİ İCAT EDİLMEZ, SEÇİLİ BLOKTAN TÜRER. Mockup UE 66'da bir
 * `<select>` çizer ve içine dört örnek değer koyar (`Zemin` · `1. Kat` ·
 * `3. Kat` · `Çatı Katı`) — bunlar ÖRNEK VERİDİR. Sabitlenirlerse 12 katlı bir
 * blokta kullanıcı 2. katı SEÇEMEZ, 2 katlı bir blokta ise bloğun sahip
 * OLMADIĞI bir katı seçebilir. İkisi de sessiz veri hatasıdır.
 *
 * Kaynak `BlockResponse`un ÜÇ alanıdır ve üçü de BE formunun kendi
 * kutularından yazılır:
 *   · `basement_floor_count` (BE 78) → "N. Bodrum" … "1. Bodrum"
 *   · `floor_count`          (BE 79) → "1. Kat" … "N. Kat"
 *   · `roof_type`            (BE 80) → yalnız `duplex`/`terrace` "Çatı Katı" açar
 * "Zemin" her blokta vardır ve ayrı bir alanı yoktur.
 *
 * Sıra AŞAĞIDAN YUKARIYA: kullanıcı binayı böyle okur (UE 66 de zeminden
 * yukarı sıralar).
 *
 * 🔴 KARAR 4: `floor` sunucuda SERBEST METİNDİR (`str`, max 20) — "Zemin" ve
 * "Çatı Katı" sayıya çevrilemez, `ck_units_floor` diye bir CHECK bilerek
 * YOKTUR. Bu yüzden seçeneğin `value`su ile etiketi AYNI dizedir; ayrı bir
 * kod/etiket ikilisi kurmak saklanan veriyi ekrandakinden ayırırdı.
 */

import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

/**
 * Türev için gereken EN DAR blok yüzeyi. `BlockResponse`un tamamını istemek
 * bu saf modülü gereksizce ağ tipine bağlardı; testler üç alanla kurulur.
 */
export type BlockFloorSource = Pick<
  DeepScale<components["schemas"]["BlockResponse"]>,
  "floor_count" | "basement_floor_count" | "roof_type"
>;

export interface FloorOptions {
  /** UE 66 seçenekleri; her biri hem etiket hem saklanan değerdir. */
  options: readonly string[];
  /** Liste eksikse kullanıcıya GÖRÜNEN gerekçe; tamsa `null`. */
  hint: string | null;
}

export const NO_BLOCK_FLOOR_HINT =
  "Kat listesi seçili bloğun kat sayısından türetilir — önce blok seçin";

export const UNKNOWN_FLOOR_COUNT_HINT =
  "Seçili bloğun kat sayısı girilmemiş — yalnız bilinen katlar listelendi";

export const GROUND_FLOOR_LABEL = "Zemin"; // UE 66
export const ROOF_FLOOR_LABEL = "Çatı Katı"; // UE 66

/** BE 80 — yalnız bu iki çatı tipi gerçek bir çatı KATI demektir. */
const ROOF_TYPES_WITH_FLOOR: readonly components["schemas"]["BlockRoofType"][] = [
  "duplex",
  "terrace",
];

/** Sayılabilir bir adet mi? `null` ve negatif değer "yok" sayılır. */
function positiveCount(value: number | null): number {
  return value !== null && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export function deriveFloorOptions(block: BlockFloorSource | null): FloorOptions {
  if (block === null) return { options: [], hint: NO_BLOCK_FLOOR_HINT };

  const basementCount = positiveCount(block.basement_floor_count);
  const floorCount = positiveCount(block.floor_count);

  const options: string[] = [];

  // En derin bodrumdan yukarı: "2. Bodrum", "1. Bodrum".
  for (let level = basementCount; level >= 1; level -= 1) {
    options.push(`${level}. Bodrum`);
  }

  options.push(GROUND_FLOOR_LABEL);

  for (let level = 1; level <= floorCount; level += 1) {
    options.push(`${level}. Kat`);
  }

  if (block.roof_type !== null && ROOF_TYPES_WITH_FLOOR.includes(block.roof_type)) {
    options.push(ROOF_FLOOR_LABEL);
  }

  // 🔴 `floor_count === null` ("girilmemiş") ile `0` ("gerçekten kat yok")
  // AYRI hâllerdir: ilkinde kullanıcıya listenin EKSİK olduğu söylenir,
  // ikincisinde liste zaten tamdır.
  const hint = block.floor_count === null ? UNKNOWN_FLOOR_COUNT_HINT : null;

  return { options, hint };
}
