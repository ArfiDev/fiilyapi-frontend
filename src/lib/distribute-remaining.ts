import {
  compareDecimalStrings,
  isZeroDecimalString,
  normalizeDecimalInput,
  subtractDecimalStrings,
  sumDecimalStrings,
} from "@/lib/decimal";

/**
 * KDG K7 (CEO 2026-10-01) · "Kalanı buraya dağıt" — SAF, React'sız, genel.
 *
 * Kalem ve kolon kimlikleri opak string'dir (sözleşme ekranında kolon = şantiye,
 * sonraki BDG ekranında kolon = bölüm). Kalem başına:
 *
 *   kalan = quantity − Σ etkin değer
 *   etkin değer = taslak (kirli hücre, ham metin normalize edilir) ya da sunucu payı
 *
 * Kural özeti: taslağı geçersiz kalem ATLANIR (skipped++), kalan < 0 (taslakta
 * aşım) ATLANIR (skipped++), kalan 0 kaleme DOKUNULMAZ (atlanmış sayılmaz),
 * kalan > 0 ise hedef kolonun etkin değerinin ÜSTÜNE eklenir.
 *
 * Aritmetik `decimal.ts` (BigInt) üzerindendir — float YOK. Girdi haritaları
 * MUTASYONA UĞRAMAZ; çıktı YENİ bir taslak haritasıdır.
 */

export interface DistributeRemainingItem {
  id: string;
  /** Sözleşme miktarı (ondalık string). */
  quantity: string;
  /** Sunucudaki pay: kolon kimliği → miktar. Payı olmayan kolon yoktur. */
  shares: ReadonlyMap<string, string>;
}

export type CellKeyFn = (itemId: string, columnId: string) => string;

export interface DistributeRemainingParams {
  items: readonly DistributeRemainingItem[];
  columnIds: readonly string[];
  targetColumnId: string;
  /** Kirli hücrelerin HAM metni, anahtar `cellKey(itemId, columnId)`. */
  drafts: ReadonlyMap<string, string>;
  cellKey: CellKeyFn;
}

export interface DistributeRemainingResult {
  /** YENİ taslak haritası (önceki taslaklar + yazılan hücreler). */
  drafts: ReadonlyMap<string, string>;
  /** Değişen (hedef hücresine kalan yazılan) kalem sayısı. */
  changedCount: number;
  /** Geçersiz taslak ya da aşım yüzünden atlanan kalem sayısı. */
  skippedCount: number;
  /** Yazılan hücrelerin anahtarları. */
  changedKeys: readonly string[];
}

const STRICT_DECIMAL = /^\d+(\.\d+)?$/;
const ZERO = "0";

/**
 * Ham taslak metnini sayıya çevirir. Boş = 0 (hücre boşaltıldı). Kaydetme
 * çözümleyicisiyle (`contract-distribution-save`) AYNI kabul kümesi: negatif ve
 * yarım biçimli ("1.") metin geçersizdir → `null`.
 */
function parseDraft(raw: string): string | null {
  if (raw.trim().length === 0) return ZERO;
  const normalized = normalizeDecimalInput(raw);
  if (normalized === null || !STRICT_DECIMAL.test(normalized)) return null;
  return normalized;
}

/** Hücrenin etkin değeri; geçersiz taslakta `null`. */
function effectiveCell(draft: string | undefined, serverShare: string | undefined): string | null {
  if (draft !== undefined) return parseDraft(draft);
  return serverShare ?? ZERO;
}

function effectiveValues(
  item: DistributeRemainingItem,
  columnIds: readonly string[],
  drafts: ReadonlyMap<string, string>,
  cellKey: CellKeyFn,
): string[] | null {
  const values: string[] = [];
  for (const columnId of columnIds) {
    const value = effectiveCell(
      drafts.get(cellKey(item.id, columnId)),
      item.shares.get(columnId),
    );
    if (value === null) return null;
    values.push(value);
  }
  return values;
}

/** "120.500" → "120.5", "1900.000" → "1900" (gösterim kuralı). */
function trimTrailingZeros(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Canlı Kalan: quantity − Σ etkin değer. Taslaklardan biri geçersizse `null`
 * (çağıran sunucu değerine döner ya da "hesaplanamadı" gösterir).
 */
export function remainingQuantity(
  item: DistributeRemainingItem,
  columnIds: readonly string[],
  drafts: ReadonlyMap<string, string>,
  cellKey: CellKeyFn,
): string | null {
  const values = effectiveValues(item, columnIds, drafts, cellKey);
  if (values === null) return null;
  return subtractDecimalStrings(item.quantity, sumDecimalStrings(values));
}

export function distributeRemaining({
  items,
  columnIds,
  targetColumnId,
  drafts,
  cellKey,
}: DistributeRemainingParams): DistributeRemainingResult {
  const nextDrafts = new Map(drafts);
  const changedKeys: string[] = [];
  let skippedCount = 0;

  for (const item of items) {
    const values = effectiveValues(item, columnIds, drafts, cellKey);
    if (values === null) {
      skippedCount += 1;
      continue;
    }
    const remaining = subtractDecimalStrings(item.quantity, sumDecimalStrings(values));
    if (isZeroDecimalString(remaining)) continue;
    if (compareDecimalStrings(remaining, ZERO) < 0) {
      skippedCount += 1;
      continue;
    }

    const targetIndex = columnIds.indexOf(targetColumnId);
    const targetValue = targetIndex >= 0 ? values[targetIndex] : ZERO;
    const key = cellKey(item.id, targetColumnId);
    nextDrafts.set(key, trimTrailingZeros(sumDecimalStrings([targetValue, remaining])));
    changedKeys.push(key);
  }

  return {
    drafts: nextDrafts,
    changedCount: changedKeys.length,
    skippedCount,
    changedKeys,
  };
}
