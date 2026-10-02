/**
 * TKL-F2.5 · "Son fiyat" hücresinin SAF mantığı (KIK:138-141, 252-256; TKL-F2-PLAN §3.1).
 * Fark yüzdesi YALNIZ gösterimdir (hesap backend'de); aritmetik kayıpsız ondalık
 * yardımcılarıyla yapılır — `Number()` YOK (büyük fiyatta float kaçağı).
 */
import {
  compareDecimalStrings,
  divideDecimalStrings,
  isZeroDecimalString,
  multiplyDecimalStrings,
  subtractDecimalStrings,
  toDecimalString,
} from "@/lib/decimal";
import { toIstanbulDateOnly } from "@/lib/format";
import type { WorkItemRead } from "@/lib/api/models";

import { formatPrice } from "./work-item-model";

/** Backend `LastPriceRead` (maskeli rolde alanın kendisi null/yok gelir). */
export type LastPrice = NonNullable<WorkItemRead["last_price"]>;

/** KIK:186 — son fiyat referansın bu yüzdenin ÜSTÜNDEYSE (`> 5`) fark kırmızı basılır. */
export const LAST_PRICE_HIGH_PCT = 5;

/** ÜS-8 — hiç kaynak yokken (ve maskeli DEĞİLKEN) hücrenin alt satırı (KIK:256). */
export const NO_LAST_PRICE_SOURCE = "henüz kaynak yok";

const PERCENT_SCALE = 1;
const MINUS_SIGN = "−";
const CURRENCY_PREFIX = "₺";
const SEPARATOR = " · ";

/** KIK:253 eşlemi + ÜS-F2-12 (SZL türetme). Bilinmeyen kaynak HAM basılır (backend: serbest dize). */
const SOURCE_LABELS: Readonly<Record<string, string>> = {
  HK: "Hakediş",
  SZL: "Sözleşme",
  TKL: "Teklif",
  SA: "Satınalma",
};

export interface LastPriceDiff {
  /** "+%6,7" · "−%3,2" · "%0,0" (tr-TR virgül). */
  text: string;
  /** Gösterilen değer > eşik → kırmızı. */
  isHigh: boolean;
}

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

/** KIK:254 — `'₺' + nf(last, 2)`. */
export function formatLastPrice(price: string): string {
  return `${CURRENCY_PREFIX}${formatPrice(price)}`;
}

/**
 * KIK:255 — `(son − ref) / ref × 100`, 1 hane ROUND_HALF_UP. Ref yok/0/anlamsız → fark yok.
 * ÜS-F2-14: negatif işaretli basılır (mockup `Math.abs` ile siliyordu). Kırmızı eşiği
 * GÖSTERİLEN (yuvarlanmış) değere göre karşılaştırılır: "%5,0" asla kırmızı görünmez.
 */
export function lastPriceDiff(price: string, refPrice: string | null | undefined): LastPriceDiff | null {
  const last = toDecimalString(price);
  const ref = toDecimalString(refPrice);
  if (last === null || ref === null || isZeroDecimalString(ref)) return null;
  const scaled = multiplyDecimalStrings(subtractDecimalStrings(last, ref), "100");
  const percent = divideDecimalStrings(scaled, ref, PERCENT_SCALE);
  if (percent === null) return null;
  const isNegative = percent.startsWith("-");
  const magnitude = formatPrecise(isNegative ? percent.slice(1) : percent);
  const sign = isNegative ? MINUS_SIGN : isZeroDecimalString(percent) ? "" : "+";
  return {
    text: `${sign}%${magnitude}`,
    isHigh: compareDecimalStrings(percent, String(LAST_PRICE_HIGH_PCT)) === 1,
  };
}

/** "6.7" → "6,7" (tr-TR ondalık virgül; binlik gerekmez, yüzde büyük olsa da düz basılır). */
function formatPrecise(value: string): string {
  const [whole = "0", fraction = ""] = value.split(".");
  return fraction === "" ? whole : `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction}`;
}

/** KIK:256 — "{Kaynak adı} · {doc_no} · GG.AA" (tarih İstanbul günü, ÜS-F2-13). */
export function formatLastPriceSource(lastPrice: LastPrice): string {
  const [, month = "", day = ""] = toIstanbulDateOnly(lastPrice.at).split("-");
  return [sourceLabel(lastPrice.source), lastPrice.doc_no, `${day}.${month}`].join(SEPARATOR);
}

/**
 * ÜS-F2-15 — `limited` rolde `last_price` VE `ref_price` ikisi de null gelir: "henüz kaynak yok"
 * o durumda YALAN olur (maskeli = bilinmez). Çift-null → yalnız "—".
 */
export function isLastPriceMasked(
  lastPrice: WorkItemRead["last_price"],
  refPrice: string | null | undefined,
): boolean {
  return (lastPrice === null || lastPrice === undefined) && (refPrice === null || refPrice === undefined);
}
