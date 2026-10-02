/**
 * TKL-F3.6 · kalem tablosunun grup düzeyi SAF hesapları (istemci Σ yalnız GÖSTERİM; asıl hesap sunucuda — ÜS-F3-1).
 * Hepsi `lib/decimal` string aritmetiğiyle KAYIPSIZdır; `Number()` YOK.
 */
import type { OfferItemRead } from "@/lib/api/hooks/useOffers";
import { sumDecimalStrings } from "@/lib/decimal";

import { isQuantityMissing, type QuantityBasis } from "./offer-item-cells";

const LETTER_COUNT = 26;
const FIRST_LETTER = "A".charCodeAt(0);

/** Grup kod harfi sıradan TÜREV: A–Z, sonra AA, AB… (TP:182; mockup A/B/C). */
export function groupCode(index: number): string {
  let rest = index;
  let code = "";
  do {
    code = String.fromCharCode(FIRST_LETTER + (rest % LETTER_COUNT)) + code;
    rest = Math.floor(rest / LETTER_COUNT) - 1;
  } while (rest >= 0);
  return code;
}

export interface GroupTotals {
  count: number;
  /** Σ adam-saat (fiyatsız kalemler DAHİL — `calc.py:207`; miktarsız kalem HARİÇ: a-s bilinmiyor, SO-28 kısmi). */
  manHours: string | null;
  /** Σ maliyet (yalnız fiyatlı kalemler); maskeli bileşen varsa BİLİNMEZ (null). */
  cost: string | null;
  /** Σ tutar (yalnız fiyatlı kalemler); maskeli bileşen varsa BİLİNMEZ (null). */
  amount: string | null;
}

/**
 * Fiyatsız ve miktarsız kalem maliyet/tutar toplamına GİRMEZ (sunucu net = Σ tutar ile tutarlı). Fiyatlı kalemin para alanı
 * null ise (limited rol maskesi) toplam BİLİNMEZ döner — 0 DEĞİL (kapsam maskesi kanonu, `lib/decimal`).
 * Boş grupta toplamlar "0"dır (maskeli değil).
 */
export function groupTotals(items: readonly OfferItemRead[], basis: QuantityBasis): GroupTotals {
  // F4.2 · miktarsız kalem (SO-21) hiçbir Σ'ya GİRMEZ (sunucu net/a-s ile tutarlı); onu "BİLİNMEZ" saymak Σ'yı "—" yapardı.
  const counted = items.filter((item) => !isQuantityMissing(item, basis));
  const priced = counted.filter((item) => item.priced);
  return {
    count: items.length,
    manHours: sumDecimalStrings(counted.map((item) => item.internal.man_hours)),
    cost: sumDecimalStrings(priced.map((item) => item.internal.cost)),
    amount: sumDecimalStrings(priced.map((item) => item.customer?.amount ?? null)),
  };
}
