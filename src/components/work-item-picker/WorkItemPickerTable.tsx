"use client";

import { useState } from "react";
import Link from "next/link";

import { shouldVirtualize } from "@/components/catalog-shared/virtual-rows";
import { Checkbox } from "@/components/ui";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { routes } from "@/lib/routes";

import { pickerColumns } from "./picker-columns";
import type { DisciplineSection, PickerInputs, PickerRow, ResolvedEntry } from "./picker-model";
import type { PickerRules } from "./picker-rules";
import type { PickerWords } from "./picker-rules";
import type { PickerTarget } from "./picker-target";
import { WorkItemPickerBodyRow, type WorkItemPickerBodyRowProps } from "./WorkItemPickerBodyRow";
import { WorkItemPickerGroupRow } from "./WorkItemPickerGroupRow";
import { WorkItemPickerVirtualRows } from "./WorkItemPickerVirtualRows";
import "./work-item-picker.css";

/** Onay kutusu kolonu + `pickerColumns` (moddan türer; `selectOnly`te Miktar/fiyat/Tutar yok). */
const CHECK_COLUMN_COUNT = 1;

export type PickerEmptyReason = "loading" | "error" | "forbidden" | "catalog-empty" | "restricted-empty" | "no-match" | null;

function emptyText(reason: Exclude<PickerEmptyReason, null | "catalog-empty" | "restricted-empty">, words: PickerWords): string {
  switch (reason) {
    case "loading":
      return "Yükleniyor…";
    case "error":
      return "İş kalemi kataloğu yüklenemedi";
    case "forbidden":
      return "Kataloğu görme yetkiniz yok.";
    case "no-match":
      return `Süzgece uyan ${words.noun} yok.`;
  }
}

export interface WorkItemPickerTableProps {
  sections: readonly DisciplineSection[];
  inputs: PickerInputs;
  /** Başarıyla çözülen satırlar (tutar sütunu için). */
  entries: readonly ResolvedEntry[];
  /** Hedef adaptörü: sütun başlığı, tablo başlığı, seçilemezlik gerekçesi, fiyat kuralı. */
  target: Pick<PickerTarget<unknown>, "tableCaption" | "priceHeader" | "priceAriaSuffix"> & PickerRules;
  emptyReason: PickerEmptyReason;
  restrictedNames: readonly string[];
  isDisabled: boolean;
  header: { isChecked: boolean; isIndeterminate: boolean; isDisabled: boolean };
  onToggleAll: () => void;
  onToggle: (row: PickerRow, selected: boolean) => void;
  onQuantity: (row: PickerRow, text: string) => void;
  onUnitPrice: (row: PickerRow, text: string) => void;
}

function EmptyBody({
  reason,
  restrictedNames,
  words,
}: {
  reason: Exclude<PickerEmptyReason, null>;
  restrictedNames: readonly string[];
  words: PickerWords;
}) {
  if (reason === "restricted-empty") return <RestrictedEmptyNotice names={restrictedNames} />;
  if (reason === "catalog-empty") {
    return (
      <>
        {"İş kalemi kataloğu boş — önce Planlama › "}
        <Link href={routes.planning.workItemCatalog()}>İş Kalemi Kataloğu</Link>
        {"'ndan kalem ekleyin."}
      </>
    );
  }
  return <>{emptyText(reason, words)}</>;
}

/** PS:86-199 — disiplin başlık satırları + poz satırları; yatay kaydırma (`boq-assignment.css:108-112` dersi). */
export function WorkItemPickerTable({
  sections,
  inputs,
  entries,
  target,
  emptyReason,
  restrictedNames,
  isDisabled,
  header,
  onToggleAll,
  onToggle,
  onQuantity,
  onUnitPrice,
}: WorkItemPickerTableProps) {
  const entryById = new Map(entries.map((entry) => [entry.item.id, entry]));
  const columns = pickerColumns(target.entryMode, target.priceHeader);
  const columnCount = columns.length + CHECK_COLUMN_COUNT;
  // Durum (useRef DEĞİL): ilk çizimde sanal gövde ile birlikte bağlanır; alt bileşenin layout efekti kap ref'inden ÖNCE koşar
  // (önbellek doluyken satırlar hiç basılmazdı) — kap bağlanınca durum değişir, sanallaştırıcı yeniden ölçer.
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  // Eşik altında DOM bugünkü gibidir (aria-rowcount/rowindex, colgroup YOK); eşikte yalnız pencere basılır.
  const rowCount = sections.reduce((sum, section) => sum + section.rows.length, 0);
  const isVirtual = emptyReason === null && shouldVirtualize(rowCount);
  const headRows = 1;
  const rowProps = { inputs, entryById, target, isDisabled, onToggle, onQuantity, onUnitPrice };
  return (
    <div className="wip-table-scroll" ref={setScrollElement}>
      <table
        className={isVirtual ? "wip-table wip-table--virtual" : "wip-table"}
        aria-rowcount={isVirtual ? headRows + rowCount + sections.length : undefined}
      >
        <caption className="sr-only">{target.tableCaption}</caption>
        {isVirtual && (
          // Sabit sütun düzeni: pencere kayarken sütun genişlikleri satır içeriğine göre zıplamasın.
          <colgroup>
            <col className="wip-col wip-col--check" />
            {columns.map((column) => (
              <col key={column} className={columnClass(column)} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr aria-rowindex={isVirtual ? 1 : undefined}>
            <th scope="col" className="wip-th wip-th--check">
              <Checkbox
                checked={header.isChecked}
                indeterminate={header.isIndeterminate}
                disabled={header.isDisabled || isDisabled}
                aria-label={`Görünen ${target.words.pluralGenitive} tümünü seç`}
                onChange={onToggleAll}
              />
            </th>
            {columns.map((column) => (
              <th key={column} scope="col" className="wip-th">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        {isVirtual ? (
          <WorkItemPickerVirtualRows
            sections={sections}
            scrollElement={scrollElement}
            columnCount={columnCount}
            noun={target.words.noun}
            headRows={headRows}
            {...rowProps}
          />
        ) : (
          <tbody>
            {emptyReason !== null ? (
              <tr>
                <td colSpan={columnCount} className="wip-empty">
                  <EmptyBody reason={emptyReason} restrictedNames={restrictedNames} words={target.words} />
                </td>
              </tr>
            ) : (
              sections.map((section) => (
                <SectionRows key={section.discipline.id} section={section} columnCount={columnCount} noun={target.words.noun} {...rowProps} />
              ))
            )}
          </tbody>
        )}
      </table>
    </div>
  );
}

/** Sütun başlığı → `<col>` sınıfı (yalnız sanallaştırılmış, sabit düzenli tabloda kullanılır). */
function columnClass(column: string): string {
  switch (column) {
    case "Poz No":
      return "wip-col wip-col--poz";
    case "Tanım":
      return "wip-col wip-col--name";
    case "Birim":
      return "wip-col wip-col--unit";
    case "Ref. fiyat":
      return "wip-col wip-col--ref";
    case "Son fiyat":
      return "wip-col wip-col--last";
    case "Tutar":
      return "wip-col wip-col--amount";
    default:
      return "wip-col wip-col--input";
  }
}

type SectionRowsProps = Omit<WorkItemPickerBodyRowProps, "row" | "virtualIndex" | "ariaRowIndex" | "measureRef"> & {
  section: DisciplineSection;
  columnCount: number;
  noun: string;
};

function SectionRows({ section, columnCount, noun, ...rowProps }: SectionRowsProps) {
  return (
    <>
      <WorkItemPickerGroupRow section={section} columnCount={columnCount} noun={noun} />
      {section.rows.map((row) => (
        <WorkItemPickerBodyRow key={row.item.id} row={row} {...rowProps} />
      ))}
    </>
  );
}
