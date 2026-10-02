"use client";

import Link from "next/link";

import { DisciplineSwatch } from "@/components/catalog-shared/CatalogBits";
import { Checkbox } from "@/components/ui";
import { formatPrice } from "@/components/work-item-catalog/work-item-model";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { multiplyDecimalStrings } from "@/lib/decimal";
import { routes } from "@/lib/routes";

import {
  validateRow,
  type DisciplineSection,
  type PickerInputs,
  type PickerRow,
  type ResolvedEntry,
} from "./picker-model";
import { WorkItemPickerRow } from "./WorkItemPickerRow";
import "./work-item-picker.css";

const COLUMN_COUNT = 9;

/** PS:86-97 sırası; Şantiye Kotası/Dağıtılmış/Kalan/Bu Bölüme/Dağıtım → plan §1.3 eşlemesi. */
const COLUMNS = ["Poz No", "Tanım", "Birim", "Ref. fiyat", "Son fiyat", "Miktar", "Birim fiyat", "Tutar"] as const;

export type PickerEmptyReason = "loading" | "error" | "forbidden" | "catalog-empty" | "restricted-empty" | "no-match" | null;

const EMPTY_TEXT: Record<Exclude<PickerEmptyReason, null | "catalog-empty" | "restricted-empty">, string> = {
  loading: "Yükleniyor…",
  error: "İş kalemi kataloğu yüklenemedi",
  forbidden: "Kataloğu görme yetkiniz yok.",
  "no-match": "Süzgece uyan poz yok.",
};

export interface WorkItemPickerTableProps {
  sections: readonly DisciplineSection[];
  inputs: PickerInputs;
  /** Başarıyla çözülen satırlar (tutar sütunu için). */
  entries: readonly ResolvedEntry[];
  emptyReason: PickerEmptyReason;
  restrictedNames: readonly string[];
  isDisabled: boolean;
  header: { isChecked: boolean; isIndeterminate: boolean; isDisabled: boolean };
  onToggleAll: () => void;
  onToggle: (row: PickerRow, selected: boolean) => void;
  onQuantity: (row: PickerRow, text: string) => void;
  onUnitPrice: (row: PickerRow, text: string) => void;
}

function EmptyBody({ reason, restrictedNames }: { reason: Exclude<PickerEmptyReason, null>; restrictedNames: readonly string[] }) {
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
  return <>{EMPTY_TEXT[reason]}</>;
}

/** PS:86-199 — disiplin başlık satırları + poz satırları; yatay kaydırma (`boq-assignment.css:108-112` dersi). */
export function WorkItemPickerTable({
  sections,
  inputs,
  entries,
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
  return (
    <div className="wip-table-scroll">
      <table className="wip-table">
        <caption className="sr-only">Katalogdan sözleşmeye eklenebilecek pozlar</caption>
        <thead>
          <tr>
            <th scope="col" className="wip-th wip-th--check">
              <Checkbox
                checked={header.isChecked}
                indeterminate={header.isIndeterminate}
                disabled={header.isDisabled || isDisabled}
                aria-label="Görünen pozların tümünü seç"
                onChange={onToggleAll}
              />
            </th>
            {COLUMNS.map((column) => (
              <th key={column} scope="col" className="wip-th">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {emptyReason !== null ? (
            <tr>
              <td colSpan={COLUMN_COUNT} className="wip-empty">
                <EmptyBody reason={emptyReason} restrictedNames={restrictedNames} />
              </td>
            </tr>
          ) : (
            sections.map((section) => (
              <SectionRows
                key={section.discipline.id}
                section={section}
                inputs={inputs}
                entryById={entryById}
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
  isDisabled: boolean;
  onToggle: WorkItemPickerTableProps["onToggle"];
  onQuantity: WorkItemPickerTableProps["onQuantity"];
  onUnitPrice: WorkItemPickerTableProps["onUnitPrice"];
}

function SectionRows({ section, inputs, entryById, isDisabled, onToggle, onQuantity, onUnitPrice }: SectionRowsProps) {
  const { discipline, rows } = section;
  return (
    <>
      <tr className="wip-group">
        <td colSpan={COLUMN_COUNT}>
          <DisciplineSwatch color={discipline.color} />
          <span className="wip-group__title">{`${discipline.code} — ${discipline.name}`}</span>
          <span className="wip-group__count">{`${rows.length} poz`}</span>
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
            error={input?.selected === true && row.block === null ? validateRow(input) : null}
            amountText={entry === undefined ? null : formatPrice(multiplyDecimalStrings(entry.quantity, entry.unitPrice))}
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
