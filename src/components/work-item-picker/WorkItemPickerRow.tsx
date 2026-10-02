"use client";

import { Checkbox, Input } from "@/components/ui";
import { DisciplineSwatch } from "@/components/catalog-shared/CatalogBits";
import { LastPriceCell } from "@/components/work-item-catalog/LastPriceCell";
import { formatPrice } from "@/components/work-item-catalog/work-item-model";
import "@/components/work-item-catalog/work-item-catalog.css";
import { cx } from "@/lib/cx";
import { EMPTY_CELL } from "@/lib/format";

import { blockReasonText, type PickerRow, type RowInput } from "./picker-model";

export interface WorkItemPickerRowProps {
  row: PickerRow;
  input: RowInput | undefined;
  /** Seçili satırın ilk hatası (PS:136-139 deseni: alt satır kırmızı); yoksa null. */
  error: string | null;
  /** Geçerli satırın "miktar × birim fiyat" tutarı (biçimli); yoksa null. */
  amountText: string | null;
  isDisabled: boolean;
  onToggle: (row: PickerRow, selected: boolean) => void;
  onQuantity: (row: PickerRow, text: string) => void;
  onUnitPrice: (row: PickerRow, text: string) => void;
}

/** PS:100-199 — tek poz satırı; 9 kolon. Seçilemeyen satır soluk + kutu kapalı + gerekçe alt satırı (PS:184-187). */
export function WorkItemPickerRow({
  row,
  input,
  error,
  amountText,
  isDisabled,
  onToggle,
  onQuantity,
  onUnitPrice,
}: WorkItemPickerRowProps) {
  const { item, block } = row;
  const isBlocked = block !== null;
  const isSelected = input?.selected === true;
  return (
    <tr
      className={cx(
        "wip-row",
        isSelected && "wip-row--selected",
        error !== null && "wip-row--error",
        isBlocked && "wip-row--blocked",
      )}
    >
      <td className="wip-cell wip-cell--check">
        <Checkbox
          checked={isSelected}
          disabled={isBlocked || isDisabled}
          aria-label={`${item.poz_no} seç`}
          onChange={(event) => onToggle(row, event.target.checked)}
        />
      </td>
      <td className="wip-cell wip-cell--poz">
        <DisciplineSwatch color={item.discipline.color} />
        <span className="wip-poz">{item.poz_no}</span>
      </td>
      <td className="wip-cell wip-cell--name">
        <span className="wip-name">{item.name}</span>
        {isBlocked ? (
          <span className="wip-sub wip-sub--block">{blockReasonText(block)}</span>
        ) : error !== null ? (
          <span className="wip-sub wip-sub--error">{error}</span>
        ) : (
          <span className="wip-sub">{`${item.discipline.code} · ${item.discipline.name}`}</span>
        )}
      </td>
      <td className="wip-cell wip-cell--unit">{item.uom}</td>
      <td className="wip-cell wip-cell--num">{formatPrice(item.ref_price)}</td>
      <td className="wip-cell wip-cell--last">
        <LastPriceCell lastPrice={item.last_price} refPrice={item.ref_price} />
      </td>
      <td className="wip-cell wip-cell--input">
        <Input
          numeric
          size="row"
          inputMode="decimal"
          value={input?.quantity ?? ""}
          disabled={isBlocked || isDisabled}
          status={error !== null ? "error" : "default"}
          aria-label={`${item.poz_no} miktar`}
          onChange={(event) => onQuantity(row, event.target.value)}
        />
      </td>
      <td className="wip-cell wip-cell--input">
        <Input
          numeric
          size="row"
          inputMode="decimal"
          value={input?.unitPrice ?? ""}
          disabled={isBlocked || isDisabled}
          status={error !== null ? "error" : "default"}
          aria-label={`${item.poz_no} birim fiyat`}
          onChange={(event) => onUnitPrice(row, event.target.value)}
        />
      </td>
      <td className="wip-cell wip-cell--num wip-cell--amount" data-testid="wip-amount">
        {amountText ?? EMPTY_CELL}
      </td>
    </tr>
  );
}
