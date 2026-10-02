"use client";

import Link from "next/link";

import { DisciplineSwatch } from "@/components/catalog-shared/CatalogBits";
import { Checkbox } from "@/components/ui";
import { formatPrice } from "@/components/work-item-catalog/work-item-model";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { multiplyDecimalStrings } from "@/lib/decimal";
import { routes } from "@/lib/routes";

import { pickerColumns } from "./picker-columns";
import {
  validateRow,
  type DisciplineSection,
  type PickerInputs,
  type PickerRow,
  type ResolvedEntry,
} from "./picker-model";
import type { PickerRules } from "./picker-rules";
import type { PickerWords } from "./picker-rules";
import type { PickerTarget } from "./picker-target";
import { WorkItemPickerRow } from "./WorkItemPickerRow";
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
  return (
    <div className="wip-table-scroll">
      <table className="wip-table">
        <caption className="sr-only">{target.tableCaption}</caption>
        <thead>
          <tr>
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
        <tbody>
          {emptyReason !== null ? (
            <tr>
              <td colSpan={columnCount} className="wip-empty">
                <EmptyBody reason={emptyReason} restrictedNames={restrictedNames} words={target.words} />
              </td>
            </tr>
          ) : (
            sections.map((section) => (
              <SectionRows
                key={section.discipline.id}
                section={section}
                inputs={inputs}
                entryById={entryById}
                columnCount={columnCount}
                target={target}
                isDisabled={isDisabled}
                onToggle={onToggle}
                onQuantity={onQuantity}
                onUnitPrice={onUnitPrice}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

interface SectionRowsProps {
  section: DisciplineSection;
  inputs: PickerInputs;
  entryById: ReadonlyMap<string, ResolvedEntry>;
  columnCount: number;
  target: WorkItemPickerTableProps["target"];
  isDisabled: boolean;
  onToggle: WorkItemPickerTableProps["onToggle"];
  onQuantity: WorkItemPickerTableProps["onQuantity"];
  onUnitPrice: WorkItemPickerTableProps["onUnitPrice"];
}

function SectionRows({ section, inputs, entryById, columnCount, target, isDisabled, onToggle, onQuantity, onUnitPrice }: SectionRowsProps) {
  const { discipline, rows } = section;
  return (
    <>
      <tr className="wip-group">
        <td colSpan={columnCount}>
          <DisciplineSwatch color={discipline.color} />
          <span className="wip-group__title">{`${discipline.code} — ${discipline.name}`}</span>
          <span className="wip-group__count">{`${rows.length} ${target.words.noun}`}</span>
        </td>
      </tr>
      {rows.map((row) => {
        const input = inputs.get(row.item.id);
        const entry = entryById.get(row.item.id);
        return (
          <WorkItemPickerRow
            key={row.item.id}
            row={row}
            input={input}
            error={input?.selected === true && row.block === null ? validateRow(input, target) : null}
            amountText={entry === undefined || entry.unitPrice === null ? null : formatPrice(multiplyDecimalStrings(entry.quantity, entry.unitPrice))}
            rules={target}
            priceAriaSuffix={target.priceAriaSuffix}
            isDisabled={isDisabled}
            onToggle={onToggle}
            onQuantity={onQuantity}
            onUnitPrice={onUnitPrice}
          />
        );
      })}
    </>
  );
}
