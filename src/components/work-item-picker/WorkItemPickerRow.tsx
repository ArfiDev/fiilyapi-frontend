"use client";

import { memo } from "react";

import { Checkbox, Input } from "@/components/ui";
import { DisciplineSwatch } from "@/components/catalog-shared/CatalogBits";
import { LastPriceCell } from "@/components/work-item-catalog/LastPriceCell";
import { formatPrice, refPriceDateLabel, sourceCodeLabel } from "@/components/work-item-catalog/work-item-model";
import "@/components/work-item-catalog/work-item-catalog.css";
import { cx } from "@/lib/cx";
import { EMPTY_CELL } from "@/lib/format";

import { blockReasonText, type PickerRow, type RowInput } from "./picker-model";
import type { PickerRules } from "./picker-rules";

export interface WorkItemPickerRowProps {
  row: PickerRow;
  input: RowInput | undefined;
  /** Seçili satırın ilk hatası (PS:136-139 deseni: alt satır kırmızı); yoksa null. */
  error: string | null;
  /** Geçerli satırın "miktar × birim fiyat" tutarı (biçimli); yoksa null. */
  amountText: string | null;
  /** Seçilemezlik gerekçesi metni (hedefe göre). */
  rules: PickerRules;
  /** Fiyat kutusunun erişilebilir adı soneki ("birim fiyat" · "maliyet B.F."). */
  priceAriaSuffix: string;
  isDisabled: boolean;
  onToggle: (row: PickerRow, selected: boolean) => void;
  onQuantity: (row: PickerRow, text: string) => void;
  onUnitPrice: (row: PickerRow, text: string) => void;
  /** Yalnız SANALLAŞTIRMADA (`WorkItemPickerVirtualRows`): liste dizini (`data-index`), gerçek satır sırası, ölçüm ref'i.
   *  Düz (kararlı) prop'lar: nesne olsaydı her render yeni kimlik → `React.memo` boşa düşerdi. */
  virtualIndex?: number;
  ariaRowIndex?: number;
  measureRef?: (element: Element | null) => void;
}

/** PS:100-199 — tek poz satırı; 9 kolon (`selectOnly`te 6: Miktar/fiyat/Tutar hücreleri yok). Seçilemeyen satır soluk + kutu kapalı + gerekçe alt satırı (PS:184-187). */
export const WorkItemPickerRow = memo(function WorkItemPickerRow({
  row,
  input,
  error,
  amountText,
  rules,
  priceAriaSuffix,
  isDisabled,
  onToggle,
  onQuantity,
  onUnitPrice,
  virtualIndex,
  ariaRowIndex,
  measureRef,
}: WorkItemPickerRowProps) {
  const { item, block } = row;
  const isBlocked = block !== null;
  const isSelected = input?.selected === true;
  const sourceCode = sourceCodeLabel(item);
  const dateLabel = refPriceDateLabel(item);
  return (
    <tr
      ref={measureRef}
      data-index={virtualIndex}
      aria-rowindex={ariaRowIndex}
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
        {sourceCode !== null && (
          <span className="wip-sub wip-sub--mono" data-testid="wip-source-code">
            {sourceCode}
          </span>
        )}
      </td>
      <td className="wip-cell wip-cell--name">
        <span className="wip-name" title={item.name}>
          {item.name}
        </span>
        {isBlocked ? (
          <span className="wip-sub wip-sub--block">{blockReasonText(block, rules)}</span>
        ) : error !== null ? (
          <span className="wip-sub wip-sub--error">{error}</span>
        ) : (
          <span className="wip-sub">{`${item.discipline.code} · ${item.discipline.name}`}</span>
        )}
      </td>
      <td className="wip-cell wip-cell--unit">{item.uom}</td>
      <td className="wip-cell wip-cell--num">
        {formatPrice(item.ref_price)}
        {dateLabel !== null && (
          <span className="wip-sub wip-sub--mono" data-testid="wip-ref-date">
            {dateLabel}
          </span>
        )}
      </td>
      <td className="wip-cell wip-cell--last">
        <LastPriceCell lastPrice={item.last_price} refPrice={item.ref_price} />
      </td>
      {rules.entryMode === "priced" && (
        <>
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
            aria-label={`${item.poz_no} ${priceAriaSuffix}`}
            onChange={(event) => onUnitPrice(row, event.target.value)}
          />
        </td>
        <td className="wip-cell wip-cell--num wip-cell--amount" data-testid="wip-amount">
          {amountText ?? EMPTY_CELL}
        </td>
        </>
      )}
    </tr>
  );
});
