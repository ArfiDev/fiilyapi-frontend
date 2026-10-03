import { useCallback, useState, type FocusEvent } from "react";
import { defaultRangeExtractor, type Range } from "@tanstack/react-virtual";

/**
 * KAT-F1.2 · büyük katalog listeleri (≈1.700 kalem, KAT-F0) için ORTAK sanallaştırma sabitleri ve yardımcıları.
 * Katalog tablosu (WorkItemTable) ve poz seçici (WorkItemPickerTable) aynı eşiği kullanır.
 */

/**
 * Bu sayının ALTINDA (`<`) sanallaştırma KAPALI: bugünkü DOM birebir (görsel kareler, RTL testleri, `aria-rowcount` yok).
 * Eşik ve üstünde satırlar pencereye göre basılır.
 */
export const VIRTUALIZE_MIN_ROWS = 100;
/** Pencere dışında önceden basılan satır sayısı (hızlı kaydırmada boşluk görünmesin; Tab ile bir sonraki satır hazır olsun). */
export const ROW_OVERSCAN = 8;
/** Ölçülmeden önceki tahmini satır yüksekliği (px; 2 satır ad + alt satır ≈ 64); satırlar `measureElement` ile ölçülür. */
export const ESTIMATED_ROW_HEIGHT = 64;
/** Disiplin başlık satırının tahmini yüksekliği (px). */
export const ESTIMATED_GROUP_ROW_HEIGHT = 36;

export function shouldVirtualize(rowCount: number): boolean {
  return rowCount >= VIRTUALIZE_MIN_ROWS;
}

/**
 * Pencere aralığına, DOM'da KALMASI gereken satırları ekler (düzenleme açık satır, odaktaki satır): kaydırınca
 * unmount olurlar ise odak ve imleç kaybolurdu. Dönen dizi artan sıralıdır (DOM sırası = liste sırası).
 */
export function pinnedRangeExtractor(pinned: readonly number[]): (range: Range) => number[] {
  return (range) => {
    const base = defaultRangeExtractor(range);
    if (pinned.length === 0) return base;
    const merged = new Set(base);
    for (const index of pinned) if (index >= 0 && index < range.count) merged.add(index);
    return [...merged].sort((a, b) => a - b);
  };
}

/**
 * Odaktaki satırın dizini (`data-index` taşıyan en yakın ata): odak satır içindeyken o satır pencere dışına
 * kaydırılsa da DOM'dan çıkmaz (`pinnedRangeExtractor`). Odak satırlardan TAMAMEN çıkınca temizlenir.
 */
export function useFocusedRowIndex() {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const onFocusCapture = useCallback((event: FocusEvent<HTMLElement>) => {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
    const index = row === null ? Number.NaN : Number(row.dataset.index);
    setFocusedIndex(Number.isNaN(index) ? null : index);
  }, []);
  const onBlurCapture = useCallback((event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (next instanceof HTMLElement && event.currentTarget.contains(next)) return;
    setFocusedIndex(null);
  }, []);
  return { focusedIndex, onFocusCapture, onBlurCapture };
}
