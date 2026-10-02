/**
 * TKL-F5.3 · özet ve satır GÖSTERİM metinleri (SAF; Decimal metin, `Number()` YOK). Mockup `sg()/tl()/nf()` (TDN:234-241)
 * ve `df`/`tag` (TDN:218,221): gerçek eksi "−" (U+2212), para `formatMoneyTl`, yüzde 1 kesir virgüllü.
 */
import { EMPTY_CELL, formatFixedDecimal, formatMoneyTl } from "@/lib/format";

import type { RowDiff, RowTag } from "./convert-derive";

const MINUS = "−";
const PLUS = "+";
const PCT_DIGITS = 1;

const isNegative = (value: string): boolean => value.trim().startsWith("-");
const unsigned = (value: string): string => value.trim().replace(/^-/, "");
const isZero = (value: string): boolean => /^0*\.?0*$/.test(unsigned(value));

function signOf(value: string): string {
  if (isZero(value)) return "";
  return isNegative(value) ? MINUS : PLUS;
}

/** Mockup `sg(D) + tl(|D|)`: işaret + ₺ + mutlak tutar; sıfır işaretsiz. */
export function signedMoney(value: string): string {
  return `${signOf(value)}${formatMoneyTl(unsigned(value))}`;
}

/** Mockup `sg(P) + '%' + nf(|P|, 1)`; teklif 0 iken (`null`) "—". */
export function diffPctText(pct: string | null): string {
  if (pct === null) return EMPTY_CELL;
  return `${signOf(pct)}%${formatFixedDecimal(unsigned(pct), PCT_DIGITS)}`;
}

export type DiffTone = "muted" | "primary" | "quiet" | "danger" | "success";

/** Fark rozeti (TDN:218). `none` = hesaplanamıyor (teklifte tutar yok / kutu geçersiz): "=" demek yalan olurdu. */
export function rowDiffView(diff: RowDiff): { text: string; tone: DiffTone } {
  switch (diff.kind) {
    case "excluded":
      return { text: "çıkarıldı", tone: "muted" };
    case "new":
      return { text: "+ yeni", tone: "primary" };
    case "same":
      return { text: "=", tone: "quiet" };
    case "down":
      return { text: `↓ %${formatFixedDecimal(diff.pct, PCT_DIGITS)}`, tone: "danger" };
    case "up":
      return { text: `↑ %${formatFixedDecimal(diff.pct, PCT_DIGITS)}`, tone: "success" };
    case "none":
      return { text: EMPTY_CELL, tone: "quiet" };
  }
}

const TAG_LABELS: Readonly<Record<NonNullable<RowTag>, string>> = {
  new: "Yeni",
  excluded: "Çıkarıldı",
  price: "Fiyat değişti",
  quantity: "Miktar değişti",
};

export function rowTagLabel(tag: RowTag): string | null {
  return tag === null ? null : TAG_LABELS[tag];
}
