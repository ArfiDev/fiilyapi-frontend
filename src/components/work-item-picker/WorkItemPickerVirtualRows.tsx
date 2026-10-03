"use client";

import { Fragment, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  ESTIMATED_GROUP_ROW_HEIGHT,
  ESTIMATED_ROW_HEIGHT,
  pinnedRangeExtractor,
  ROW_OVERSCAN,
  useFocusedRowIndex,
} from "@/components/catalog-shared/virtual-rows";

import type { DisciplineSection, PickerRow } from "./picker-model";
import { WorkItemPickerBodyRow, type WorkItemPickerBodyRowProps } from "./WorkItemPickerBodyRow";
import { WorkItemPickerGroupRow } from "./WorkItemPickerGroupRow";

/** Disiplin başlığı + poz satırları TEK düz listede (başlık da bir satırdır: `aria-rowindex` ve yükseklik ölçümü). */
export type PickerFlatEntry = { kind: "group"; section: DisciplineSection } | { kind: "row"; row: PickerRow };

export function flattenSections(sections: readonly DisciplineSection[]): PickerFlatEntry[] {
  return sections.flatMap((section): PickerFlatEntry[] => [
    { kind: "group", section },
    ...section.rows.map((row): PickerFlatEntry => ({ kind: "row", row })),
  ]);
}

export interface WorkItemPickerVirtualRowsProps extends Omit<WorkItemPickerBodyRowProps, "row" | "virtualIndex" | "ariaRowIndex" | "measureRef"> {
  sections: readonly DisciplineSection[];
  /** Dikey kaydıran kap (`.wip-table-scroll`). */
  scrollElement: HTMLDivElement | null;
  columnCount: number;
  noun: string;
  /** Başlık satırı sayısı (aria-rowindex kayması). */
  headRows: number;
}

const SPACER_CELL_STYLE = { padding: 0, border: 0 } as const;

/**
 * `<tbody>` içeriği: yalnız pencere + taşma payı + SABİTLENMİŞ (odaktaki) satırlar. Sıralı satırlar arasındaki
 * boşluk `<tr aria-hidden>` boşluk satırlarıyla doldurulur (tablo düzeni korunur; mutlak konum YOK).
 * Seçim ve miktar/fiyat girdileri üst bileşendedir (`inputs`) → satır unmount olsa da kaybolmaz.
 */
export function WorkItemPickerVirtualRows({
  sections,
  scrollElement,
  columnCount,
  noun,
  headRows,
  ...rowProps
}: WorkItemPickerVirtualRowsProps) {
  const flat = useMemo(() => flattenSections(sections), [sections]);
  const { focusedIndex, onFocusCapture, onBlurCapture } = useFocusedRowIndex();
  const pinned = useMemo(() => (focusedIndex === null ? [] : [focusedIndex]), [focusedIndex]);
  const rangeExtractor = useMemo(() => pinnedRangeExtractor(pinned), [pinned]);

  const virtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => scrollElement,
    estimateSize: (index) => (flat[index]?.kind === "group" ? ESTIMATED_GROUP_ROW_HEIGHT : ESTIMATED_ROW_HEIGHT),
    overscan: ROW_OVERSCAN,
    rangeExtractor,
    getItemKey: (index) => {
      const entry = flat[index];
      return entry === undefined ? index : entry.kind === "group" ? `g:${entry.section.discipline.id}` : entry.row.item.id;
    },
  });

  const items = virtualizer.getVirtualItems();
  let previousEnd = 0;
  const body = items.map((virtualRow) => {
    const entry = flat[virtualRow.index];
    if (entry === undefined) return null;
    const gap = virtualRow.start - previousEnd;
    previousEnd = virtualRow.end;
    const ariaRowIndex = headRows + virtualRow.index + 1;
    const measureRef = virtualizer.measureElement;
    return (
      <Fragment key={virtualRow.key}>
        {gap > 0 && <SpacerRow height={gap} columnCount={columnCount} />}
        {entry.kind === "group" ? (
          <WorkItemPickerGroupRow
            section={entry.section}
            columnCount={columnCount}
            noun={noun}
            virtual={{ index: virtualRow.index, ariaRowIndex, measureRef }}
          />
        ) : (
          <WorkItemPickerBodyRow
            row={entry.row}
            virtualIndex={virtualRow.index}
            ariaRowIndex={ariaRowIndex}
            measureRef={measureRef}
            {...rowProps}
          />
        )}
      </Fragment>
    );
  });
  const tail = virtualizer.getTotalSize() - previousEnd;

  return (
    <tbody onFocusCapture={onFocusCapture} onBlurCapture={onBlurCapture}>
      {body}
      {tail > 0 && <SpacerRow height={tail} columnCount={columnCount} />}
    </tbody>
  );
}

function SpacerRow({ height, columnCount }: { height: number; columnCount: number }) {
  return (
    <tr aria-hidden="true" data-testid="wip-spacer" style={{ height }}>
      <td colSpan={columnCount} style={SPACER_CELL_STYLE} />
    </tr>
  );
}
