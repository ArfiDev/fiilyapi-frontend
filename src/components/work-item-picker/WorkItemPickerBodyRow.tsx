"use client";

import { formatPrice } from "@/components/work-item-catalog/work-item-model";
import { multiplyDecimalStrings } from "@/lib/decimal";

import { validateRow, type PickerInputs, type PickerRow, type ResolvedEntry } from "./picker-model";
import type { WorkItemPickerTableProps } from "./WorkItemPickerTable";
import { WorkItemPickerRow, type WorkItemPickerRowProps } from "./WorkItemPickerRow";

export interface WorkItemPickerBodyRowProps {
  row: PickerRow;
  inputs: PickerInputs;
  entryById: ReadonlyMap<string, ResolvedEntry>;
  target: WorkItemPickerTableProps["target"];
  isDisabled: boolean;
  onToggle: WorkItemPickerTableProps["onToggle"];
  onQuantity: WorkItemPickerTableProps["onQuantity"];
  onUnitPrice: WorkItemPickerTableProps["onUnitPrice"];
  virtualIndex?: WorkItemPickerRowProps["virtualIndex"];
  ariaRowIndex?: WorkItemPickerRowProps["ariaRowIndex"];
  measureRef?: WorkItemPickerRowProps["measureRef"];
}

/** Tek poz satırının prop'larını (hata, tutar) çözer; düz ve sanallaştırılmış gövde AYNI hesabı kullanır. */
export function WorkItemPickerBodyRow({
  row,
  inputs,
  entryById,
  target,
  isDisabled,
  onToggle,
  onQuantity,
  onUnitPrice,
  virtualIndex,
  ariaRowIndex,
  measureRef,
}: WorkItemPickerBodyRowProps) {
  const input = inputs.get(row.item.id);
  const entry = entryById.get(row.item.id);
  return (
    <WorkItemPickerRow
      row={row}
      input={input}
      error={input?.selected === true && row.block === null ? validateRow(input, target) : null}
      amountText={
        entry === undefined || entry.unitPrice === null
          ? null
          : formatPrice(multiplyDecimalStrings(entry.quantity, entry.unitPrice))
      }
      rules={target}
      priceAriaSuffix={target.priceAriaSuffix}
      isDisabled={isDisabled}
      onToggle={onToggle}
      onQuantity={onQuantity}
      onUnitPrice={onUnitPrice}
      virtualIndex={virtualIndex}
      ariaRowIndex={ariaRowIndex}
      measureRef={measureRef}
    />
  );
}
