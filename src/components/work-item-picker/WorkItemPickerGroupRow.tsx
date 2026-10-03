"use client";

import { DisciplineSwatch } from "@/components/catalog-shared/CatalogBits";

import type { DisciplineSection } from "./picker-model";

export interface WorkItemPickerGroupRowProps {
  section: DisciplineSection;
  columnCount: number;
  /** Poz sözcüğü ("poz" / "kalem"). */
  noun: string;
  /** Yalnız SANALLAŞTIRMADA: liste dizini, gerçek satır sırası, ölçüm ref'i. */
  virtual?: { index: number; ariaRowIndex: number; measureRef: (element: Element | null) => void };
}

/** PS:101 — disiplin başlık satırı ("KOD — Ad · N poz"). */
export function WorkItemPickerGroupRow({ section, columnCount, noun, virtual }: WorkItemPickerGroupRowProps) {
  const { discipline, rows } = section;
  return (
    <tr className="wip-group" ref={virtual?.measureRef} data-index={virtual?.index} aria-rowindex={virtual?.ariaRowIndex}>
      <td colSpan={columnCount}>
        <DisciplineSwatch color={discipline.color} />
        <span className="wip-group__title">{`${discipline.code} — ${discipline.name}`}</span>
        <span className="wip-group__count">{`${rows.length} ${noun}`}</span>
      </td>
    </tr>
  );
}
