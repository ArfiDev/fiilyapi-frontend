import type { ReactNode } from "react";

import { formatSignedQuantity } from "@/components/site-diary/DiaryLineRows";
import { cx } from "@/lib/cx";
import { formatAmount, formatQuantity } from "@/lib/format";

import type { DiaryDetailLineColumns, DiaryDetailLineRef } from "./detail-extension";
import type { DetailLineRow } from "./lines-derive";

/**
 * DET-1.3 · Yapılan Miktarlar tablosunun SATIRLARI — mockup 321-385
 * (İ-EK:241-254 yaprak satırı · İ-EK:687-688 Bugün düz metin · İ:236-237
 * aşım alt satırı · İ:386/712 "Diğer bölümler" soluklaştırması).
 */
export interface LineTableShape {
  columns: DiaryDetailLineColumns | null;
  isPaymentHidden: boolean;
  /** Toplam kolon sayısı (alt satırların `colSpan`ı). */
  columnCount: number;
}

export function lineRef(row: DetailLineRow): DiaryDetailLineRef {
  return { lineId: row.lineId, boqItemId: row.boqItemId, sectionId: row.sectionId };
}

/** İ:225 kod satırı: "KAB.01.01 · Kat 6–10 · Kendi · ₺185/m²" — ₺ S10 gizlide yok. */
function codeLine(row: DetailLineRow, shape: LineTableShape): string {
  const tag = shape.columns?.renderLineTag?.(lineRef(row)) ?? null;
  const parts = [row.code, row.sectionLabel, tag, shape.isPaymentHidden ? null : `₺${formatAmount(row.unitPrice)}/${row.unit}`];
  return parts.filter((part): part is string => part !== null && part !== "").join(" · ");
}

function SubRow({ span, isOther, children }: { span: number; isOther: boolean; children: ReactNode }) {
  return (
    <tr className={cx("diary-detail-lines__subrow", isOther && "diary-detail-lines__row--other")}>
      <td colSpan={span}>{children}</td>
    </tr>
  );
}

export function DetailLineRowView({ row, shape, isOther }: { row: DetailLineRow; shape: LineTableShape; isOther: boolean }) {
  const ref = lineRef(row);
  const extraCells = shape.columns?.renderCells(ref) ?? [];
  const subRow = shape.columns?.renderSubRow?.(ref) ?? null;
  const isOver = row.overrunExcess !== null;
  return (
    <>
      <tr className={cx("diary-detail-lines__row", isOther && "diary-detail-lines__row--other")}>
        <td className="diary-detail-lines__name">
          <span className="diary-detail-lines__item">{row.name}</span>
          <span className="diary-detail-lines__code">{codeLine(row, shape)}</span>
        </td>
        <td className="diary-detail-lines__unit">{row.unit}</td>
        <td className="diary-detail-lines__today">{formatQuantity(row.today)}</td>
        <td className={cx("diary-detail-lines__num diary-detail-lines__num--strong", isOver && "diary-detail-lines__num--over")}>
          {formatQuantity(row.cumulative)}
        </td>
        <td className="diary-detail-lines__num">{formatQuantity(row.planned)}</td>
        <td className={cx("diary-detail-lines__num", isOver && "diary-detail-lines__num--over diary-detail-lines__num--bold")}>
          {formatSignedQuantity(row.remaining)}
        </td>
        {extraCells.map((cell, index) => (
          <td key={shape.columns?.headers[index]?.key ?? index} className="diary-detail-lines__ext">
            {cell}
          </td>
        ))}
        {!shape.isPaymentHidden && <td className="diary-detail-lines__amount">{formatAmount(row.amount)}</td>}
      </tr>
      {isOver && (
        <SubRow span={shape.columnCount} isOther={isOther}>
          <div className="diary-detail-lines__over">
            <span className="diary-detail-lines__over-lead">
              {`Aşım · ${formatQuantity(row.cumulative)} / ${formatQuantity(row.planned)} ${row.unit} (+${formatQuantity(row.overrunExcess)})`}
            </span>
            {row.overrunReason !== null && row.overrunReason.trim() !== "" && (
              <span className="diary-detail-lines__over-reason">{`Gerekçe: ${row.overrunReason}`}</span>
            )}
          </div>
        </SubRow>
      )}
      {subRow !== null && (
        <SubRow span={shape.columnCount} isOther={isOther}>
          {subRow}
        </SubRow>
      )}
    </>
  );
}

/** 318-319 / 358-359 — grup ayırıcısı (İ:455); "bu bölüm" vurgulu (D:129-130). */
export function SeparatorRow({ span, isCurrent, children }: { span: number; isCurrent: boolean; children: string }) {
  return (
    <tr className={cx("diary-detail-lines__sep", isCurrent && "diary-detail-lines__sep--current")}>
      <th scope="colgroup" colSpan={span}>
        {children}
      </th>
    </tr>
  );
}

/** 351-356 — "Ara toplam" (İ-EK:228-238 kalem başlığı deseni); miktar kolonları boş (birimler farklı). */
export function SubtotalRow({
  sectionId,
  sectionName,
  amountTotal,
  shape,
}: {
  sectionId: string;
  sectionName: string;
  amountTotal: string | null;
  shape: LineTableShape;
}) {
  const extra = shape.columns?.renderSectionSubtotal(sectionId) ?? null;
  return (
    <tr className="diary-detail-lines__subtotal">
      <td className="diary-detail-lines__name">
        <span className="diary-detail-lines__item">Ara toplam</span>
        <span className="diary-detail-lines__code">
          {sectionName}
          {extra !== null && extra.note !== null && <> · {extra.note}</>}
        </span>
      </td>
      <td colSpan={5} />
      {(extra?.cells ?? []).map((cell, index) => (
        <td key={shape.columns?.headers[index]?.key ?? index} className="diary-detail-lines__ext">
          {cell}
        </td>
      ))}
      {!shape.isPaymentHidden && <td className="diary-detail-lines__amount">{formatAmount(amountTotal)}</td>}
    </tr>
  );
}

/** Hâl (k) — "Bu gün miktar satırı girilmemiş" gövdesi (SectionDiaryPanel boş hâli). */
export function EmptyLinesBody() {
  return (
    <div className="diary-detail-lines__empty">
      <p className="diary-detail-lines__empty-title">Bu gün miktar satırı girilmemiş</p>
      <p className="diary-detail-lines__empty-hint">Yalnız notlar, hava ve işçi sayıları kaydedilmiş.</p>
    </div>
  );
}
