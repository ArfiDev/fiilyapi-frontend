/**
 * TKL-F5.2 · satır ve özet TÜREVLERİ (SAF; Decimal metin, `Number()` YOK). Kurallar mockup `Teklif - Dönüştür.dc.html`
 * `calc()/renderVals()` (TDN:263-301) + plan §3; para matematiği `convert-money` (backend `_item_total` ikizi).
 */
import { compareDecimalStrings, divideDecimalStrings, isZeroDecimalString, subtractDecimalStrings } from "@/lib/decimal";

import { diffPercent, grossWithVat, lineAmount, sumAmounts } from "./convert-money";
import { parseQty, parseUnitPrice, type ParsedField } from "./convert-parse";
import type { ConvertDraft, ConvertRow } from "./convert-types";

export type RowTag = "new" | "excluded" | "price" | "quantity" | null;
export type RowDiff = { kind: "excluded" | "new" | "none" | "same" } | { kind: "down" | "up"; pct: string };

export interface ConvertSummary {
  /** Teklif tutarı (revizyon): teklif satırlarının `customer.amount` toplamı (= `totals.customer.net`). */
  offerTotal: string;
  /** Sözleşme tutarı = sunucunun yazacağı bedel (Σ satır başı yuvarlanmış tutar; geçersiz satır girmez). */
  contractTotal: string;
  difference: string;
  /** Fark % (1 kesir, işaretli); teklif 0 ise null ("—"). */
  diffPct: string | null;
  includedCount: number;
  excludedCount: number;
  changedCount: number;
  newCount: number;
  excludedOfferTotal: string;
  changedDelta: string;
  newTotal: string;
  /** KDV dahil = ROUND(Σ × (1 + KDV)). */
  contractGross: string;
  /** Dahil satırlardan en az biri hesaplanamıyor (boş/geçersiz kutu): Σ eksiktir, adım kapısı kapalı. */
  hasInvalid: boolean;
}

const MONEY_SCALE = 2;
const ZERO_MONEY = "0.00";
const ONE = "1";

const toMoney = (value: string): string => divideDecimalStrings(value, ONE, MONEY_SCALE) ?? ZERO_MONEY;

export function parsedRow(row: ConvertRow): { qty: ParsedField; bf: ParsedField } {
  return { qty: parseQty(row.contract.qtyRaw), bf: parseUnitPrice(row.contract.bfRaw) };
}

/** Sözleşme satır tutarı: çıkarılmış 0.00; dahilde miktar ve B.F. ikisi de geçerliyse ROUND_HALF_UP; yoksa null. */
export function rowContractAmount(row: ConvertRow): string | null {
  if (!row.included) return ZERO_MONEY;
  const { qty, bf } = parsedRow(row);
  return qty.ok && bf.ok ? lineAmount(qty.value, bf.value) : null;
}

/** Kutu teklifteki değerden FARKLI mı? Sayısal karşılaştırma (10 = 10,000); geçersiz/boşaltılmış = farklı. */
function differsFromOffer(parsed: ParsedField, raw: string, offerValue: string | null): boolean {
  if (!parsed.ok) return raw.trim() === "" ? offerValue !== null : true;
  return offerValue === null || compareDecimalStrings(parsed.value, offerValue) !== 0;
}

/** Yeni > çıkarıldı > fiyat (miktardan ÖNCE) > miktar (TDN:268). */
export function rowTag(row: ConvertRow): RowTag {
  if (row.isNew) return "new";
  if (!row.included) return "excluded";
  const { qty, bf } = parsedRow(row);
  if (differsFromOffer(bf, row.contract.bfRaw, row.offer.unitPrice)) return "price";
  if (differsFromOffer(qty, row.contract.qtyRaw, row.offer.qty)) return "quantity";
  return null;
}

export function rowDiff(row: ConvertRow): RowDiff {
  if (!row.included) return { kind: "excluded" };
  if (row.isNew) return { kind: "new" };
  const amount = rowContractAmount(row);
  if (amount === null || isZeroDecimalString(row.offer.amount)) return { kind: "none" };
  const pct = diffPercent(row.offer.amount, amount);
  if (pct === null) return { kind: "none" };
  if (isZeroDecimalString(pct)) return { kind: "same" };
  return pct.startsWith("-") ? { kind: "down", pct: pct.slice(1) } : { kind: "up", pct };
}

const validAmounts = (rows: readonly ConvertRow[]): string[] =>
  rows.map(rowContractAmount).filter((amount): amount is string => amount !== null);

function changedDelta(rows: readonly ConvertRow[]): string {
  const deltas = rows.flatMap((row) => {
    const amount = rowContractAmount(row);
    return amount === null ? [] : [subtractDecimalStrings(amount, row.offer.amount)];
  });
  return toMoney(sumAmounts(deltas));
}

/** Özet (TDN:291-301). `vatPct` = revizyon KDV'si ("20.00"; ÜS-F5-26). */
export function summarize(draft: ConvertDraft, vatPct: string): ConvertSummary {
  const included = draft.rows.filter((row) => row.included);
  const excluded = draft.rows.filter((row) => !row.included);
  const fresh = included.filter((row) => row.isNew);
  const changed = included.filter((row) => rowTag(row) === "price" || rowTag(row) === "quantity");
  const offerTotal = toMoney(sumAmounts(draft.rows.filter((row) => !row.isNew).map((row) => row.offer.amount)));
  const contractTotal = toMoney(sumAmounts(validAmounts(included)));
  return {
    offerTotal,
    contractTotal,
    difference: toMoney(subtractDecimalStrings(contractTotal, offerTotal)),
    diffPct: diffPercent(offerTotal, contractTotal),
    includedCount: included.length,
    excludedCount: excluded.length,
    changedCount: changed.length,
    newCount: fresh.length,
    excludedOfferTotal: toMoney(sumAmounts(excluded.map((row) => row.offer.amount))),
    changedDelta: changedDelta(changed),
    newTotal: toMoney(sumAmounts(validAmounts(fresh))),
    contractGross: grossWithVat(contractTotal, vatPct),
    hasInvalid: included.some((row) => rowContractAmount(row) === null),
  };
}
