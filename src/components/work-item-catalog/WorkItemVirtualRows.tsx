"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

import { ESTIMATED_ROW_HEIGHT, pinnedRangeExtractor, ROW_OVERSCAN, useFocusedRowIndex } from "@/components/catalog-shared/virtual-rows";
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";

import { WorkItemEditRow } from "./WorkItemEditRow";
import { WorkItemRow } from "./WorkItemRow";
import type { WorkItemDraft } from "./work-item-drafts";
import type { WorkItemFormState } from "./work-item-form";

export interface WorkItemVirtualRowsProps {
  items: readonly WorkItemRead[];
  editDrafts: ReadonlyMap<string, WorkItemDraft>;
  now: Date;
  canWrite: boolean;
  catalogUnits: readonly string[];
  /** Başlık + yeni taslak satırları kadar kayma: ilk kalemin gerçek `aria-rowindex`i = bu + 1. */
  rowIndexOffset: number;
  onEdit: (item: WorkItemRead) => void;
  onPatch: (key: string, change: Partial<WorkItemFormState>) => void;
  onCancel: (key: string) => void;
  onSave: (key: string) => void;
}

/**
 * Büyük katalogda (≥ `VIRTUALIZE_MIN_ROWS`) yalnız pencere + taşma payı kadar kalem basılır; sayfa kaydırması (pencere) kullanılır.
 * Seçim/düzenleme DURUMU üst bileşendedir (`useWorkItemDrafts`): satır unmount olsa da taslak kaybolmaz. Ek olarak
 * düzenleme açık ve odaktaki satırlar DOM'da SABİTLENİR (odak/imleç kaybolmasın).
 */
export function WorkItemVirtualRows({
  items,
  editDrafts,
  now,
  canWrite,
  catalogUnits,
  rowIndexOffset,
  onEdit,
  onPatch,
  onCancel,
  onSave,
}: WorkItemVirtualRowsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  const { focusedIndex, onFocusCapture, onBlurCapture } = useFocusedRowIndex();

  // Listenin belge tepesine uzaklığı (üstteki başlık/çip/yeni satırlar yüksekliği değişebilir): her çizimde yeniden ölç.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- her çizimde ölçüm bilinçli; eşitlikte bail-out döngüyü önler
  useLayoutEffect(() => {
    const top = listRef.current === null ? 0 : Math.round(listRef.current.getBoundingClientRect().top + window.scrollY);
    setScrollMargin((current) => (current === top ? current : top));
  });

  const editingIndexes = useMemo(
    () => items.flatMap((item, index) => (editDrafts.has(item.id) ? [index] : [])),
    [items, editDrafts],
  );
  const pinned = useMemo(
    () => (focusedIndex === null ? editingIndexes : [...editingIndexes, focusedIndex]),
    [editingIndexes, focusedIndex],
  );
  const rangeExtractor = useMemo(() => pinnedRangeExtractor(pinned), [pinned]);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: ROW_OVERSCAN,
    scrollMargin,
    rangeExtractor,
    getItemKey: (index) => items[index]?.id ?? index,
  });

  return (
    <div
      ref={listRef}
      className="wik-virtual"
      style={{ height: virtualizer.getTotalSize(), position: "relative" }}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const item = items[virtualRow.index];
        if (item === undefined) return null;
        const draft = editDrafts.get(item.id);
        const ariaRowIndex = rowIndexOffset + virtualRow.index + 1;
        return (
          <div
            key={virtualRow.key}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            className="wik-virtual__row"
            style={{ transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
          >
            {draft ? (
              <WorkItemEditRow
                draft={draft}
                pozNo={item.poz_no}
                source={item}
                discipline={item.discipline satisfies Pick<WorkDisciplineRead, "id" | "code" | "name">}
                lastPrice={item.last_price}
                savedRefPrice={item.ref_price}
                testId={`wik-edit-${item.id}`}
                catalogUnits={catalogUnits}
                onPatch={onPatch}
                onCancel={onCancel}
                onSave={onSave}
                ariaRowIndex={ariaRowIndex}
              />
            ) : (
              <WorkItemRow item={item} now={now} canWrite={canWrite} onEdit={onEdit} ariaRowIndex={ariaRowIndex} />
            )}
          </div>
        );
      })}
    </div>
  );
}
