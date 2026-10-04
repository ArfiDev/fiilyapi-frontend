"use client";

import { SourceCodeSub } from "@/components/catalog-shared/SourceCodeSub";
import { trQuantityInputValue } from "@/components/contracts/employer-item-inline";
import { Checkbox, Input } from "@/components/ui";
import { cx } from "@/lib/cx";
import { EMPTY_CELL, formatMoneyTl } from "@/lib/format";

import { rowChangedFields, rowContractAmount, rowDiff, rowTag } from "./convert-derive";
import { rowDiffView, rowTagLabel } from "./convert-format";
import type { ConvertRow } from "./convert-types";
import type { RowErrors } from "./convert-validate";
import "./offer-convert.css";

export interface ConvertItemRowProps {
  row: ConvertRow;
  errors: RowErrors | undefined;
  /** Kod düzenleyicisi açık: çakışıyor VEYA düzenlendi VEYA sunucu kodu reddetti (SO-29/30/52). */
  isCodeEditable: boolean;
  onToggle: (key: string) => void;
  onQty: (key: string, raw: string) => void;
  onBf: (key: string, raw: string) => void;
  onCode: (key: string, code: string) => void;
}

const QTY_LABEL = "Sözleşme miktarı";
const BF_LABEL = "Sözleşme birim fiyatı";

const refText = (value: string | null, format: (raw: string) => string): string => `teklif ${value === null ? EMPTY_CELL : format(value)}`;

/** TDN:90-112 — satır: dahil kutusu · poz · tarif + etiket/not · birim · miktar · B.F. · tutar · fark. */
export function ConvertItemRow({ row, errors, isCodeEditable, onToggle, onQty, onBf, onCode }: ConvertItemRowProps) {
  const tag = rowTagLabel(rowTag(row));
  const changed = rowChangedFields(row);
  const diff = rowDiffView(rowDiff(row));
  const amount = rowContractAmount(row);
  const offerQty = row.isNew ? null : row.offer.qty;
  const offerBf = row.isNew ? null : row.offer.unitPrice;
  return (
    <tr
      data-testid={`convert-row-${row.key}`}
      className={cx("convert-row", !row.included && "convert-row--excluded", row.isNew && "convert-row--new")}
    >
      <td>
        <Checkbox
          size="lg"
          checked={row.included}
          aria-label="Sözleşmeye dahil et"
          title="Sözleşmeye dahil et"
          onChange={() => onToggle(row.key)}
        />
      </td>
      <td>
        <CodeCell row={row} error={errors?.code} isEditable={isCodeEditable} onCode={onCode} />
      </td>
      <td>
        <div className="convert-row__desc">
          <span className="convert-row__title">
            <span className="convert-row__text convert-row__name" title={row.description}>{row.description}</span>
            {tag !== null && <span className={cx("convert-tag", row.isNew && "convert-tag--new", !row.included && !row.isNew && "convert-tag--excluded")}>{tag}</span>}
          </span>
          {row.note !== null && <span className="convert-row__note">{row.note}</span>}
          {errors?.description && <span className="convert-error-text">{errors.description}</span>}
          {errors?.offerItem && <span className="convert-error-text">{errors.offerItem}</span>}
        </div>
      </td>
      <td>
        {row.unit}
        {errors?.unit && <span className="convert-error-text">{errors.unit}</span>}
      </td>
      <td className="convert-num">
        <div className="convert-cell">
          <Input
            numeric
            size="row"
            inputMode="decimal"
            aria-label={QTY_LABEL}
            value={row.contract.qtyRaw}
            disabled={!row.included}
            status={errors?.qty ? "error" : "default"}
            className={cx(changed.qty && "convert-box--changed")}
            onChange={(e) => onQty(row.key, e.target.value)}
          />
          <span className="convert-ref">{refText(offerQty, trQuantityInputValue)}</span>
          {errors?.qty && <span className="convert-error-text">{errors.qty}</span>}
        </div>
      </td>
      <td className="convert-num">
        <div className="convert-cell">
          <Input
            numeric
            size="row"
            inputMode="decimal"
            aria-label={BF_LABEL}
            value={row.contract.bfRaw}
            disabled={!row.included}
            status={errors?.bf ? "error" : "default"}
            className={cx(changed.bf && "convert-box--changed")}
            onChange={(e) => onBf(row.key, e.target.value)}
          />
          <span className="convert-ref">{refText(offerBf, formatMoneyTl)}</span>
          {errors?.bf && <span className="convert-error-text">{errors.bf}</span>}
        </div>
      </td>
      <td className="convert-num">
        <div className="convert-cell convert-cell--end">
          <span className="convert-amount convert-row__text">{amount === null ? EMPTY_CELL : formatMoneyTl(amount)}</span>
          <span className="convert-ref">{row.isNew ? "teklifte yok" : `teklif ${formatMoneyTl(row.offer.amount)}`}</span>
        </div>
      </td>
      <td className="convert-num">
        <span className={cx("convert-diff", `convert-diff--${diff.tone}`)}>{diff.text}</span>
      </td>
    </tr>
  );
}

interface CodeCellProps {
  row: ConvertRow;
  error: string | undefined;
  isEditable: boolean;
  onCode: (key: string, code: string) => void;
}

function CodeCell({ row, error, isEditable, onCode }: CodeCellProps) {
  const sub = <SourceCodeSub code={row.sourceCode} data-testid={`convert-source-code-${row.key}`} />;
  if (!isEditable) {
    return (
      <>
        <span className="convert-code convert-row__text">{row.code}</span>
        {sub}
      </>
    );
  }
  return (
    <div className="convert-cell">
      <Input
        numeric
        size="row"
        aria-label="Poz no"
        value={row.code}
        status={error ? "error" : "default"}
        onChange={(e) => onCode(row.key, e.target.value)}
      />
      {error && <span className="convert-error-text">{error}</span>}
      {sub}
    </div>
  );
}
