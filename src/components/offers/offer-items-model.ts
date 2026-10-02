/**
 * TKL-F3.6 · kalem tablosunun grup düzeyi SAF hesapları (istemci Σ yalnız GÖSTERİM; asıl hesap sunucuda — ÜS-F3-1).
 * Hepsi `lib/decimal` string aritmetiğiyle KAYIPSIZdır; `Number()` YOK.
 */
import type { OfferItemRead } from "@/lib/api/hooks/useOffers";
import { sumDecimalStrings } from "@/lib/decimal";

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
  /** Σ adam-saat (fiyatsız kalemler DAHİL — `calc.py:207`). */
  manHours: string | null;
  /** Σ maliyet (yalnız fiyatlı kalemler); maskeli bileşen varsa BİLİNMEZ (null). */
  cost: string | null;
  /** Σ tutar (yalnız fiyatlı kalemler); maskeli bileşen varsa BİLİNMEZ (null). */
  amount: string | null;
}

/**
 * Fiyatsız kalem maliyet/tutar toplamına GİRMEZ (sunucu net = Σ tutar ile tutarlı). Fiyatlı kalemin para alanı
 * null ise (limited rol maskesi) toplam BİLİNMEZ döner — 0 DEĞİL (kapsam maskesi kanonu, `lib/decimal`).
 * Boş grupta toplamlar "0"dır (maskeli değil).
 */
export function groupTotals(items: readonly OfferItemRead[]): GroupTotals {
  const priced = items.filter((item) => item.priced);
  return {
    count: items.length,
    manHours: sumDecimalStrings(items.map((item) => item.internal.man_hours)),
    cost: sumDecimalStrings(priced.map((item) => item.internal.cost)),
    amount: sumDecimalStrings(priced.map((item) => item.customer?.amount ?? null)),
  };
}
