import type { ReactNode } from "react";

import { Button } from "@/components/ui/button/Button";
import { WarningTriangleIcon, XIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input/Input";
import { cx } from "@/lib/cx";
import { EMPTY_CELL, formatAmount, formatQuantity } from "@/lib/format";

import { DIARY_OVERRUN_REASON_MAX, DIARY_QUANTITY_MAX } from "./diary-labels";
import type { DiaryItemGroup, DiaryLeafRow } from "./diary-lines-tree";

/** Negatif kalan "−12" (U+2212, mockup İ:231) — tire değil eksi işareti. */
export function formatSignedQuantity(value: string | null): string {
  if (value === null) return EMPTY_CELL;
  const trimmed = value.trim();
  return trimmed.startsWith("-") ? `−${formatQuantity(trimmed.slice(1))}` : formatQuantity(trimmed);
}

export interface DiaryItemHeaderRowProps {
  group: DiaryItemGroup;
  /** "+ Bölüm" basılır mı (yazma izni, kilit/gönderim yok; öksüz grupta asla). */
  canAddSection: boolean;
  /** Eklenecek bölüm kalmadıysa düğme pasif (Ek Formlar M1(c)). */
  isAddExhausted: boolean;
  onOpenPicker: () => void;
  /** Seçici açıkken çapaya basılan popover. */
  picker: ReactNode;
  /** Başlık satırının ek hücreleri (`renderItemCells`); `null` = boş hücreler. */
  extraCells: readonly ReactNode[] | null;
  extraColumnCount: number;
  /** Kod satırına uzantı eki (İ:225 "Kendi/Taşeron"). */
  itemTag?: ReactNode;
}

/**
 * Kalem başlık satırı (G1 · G2): ad + "kod · [etiket ·] ₺birim fiyat/birim",
 * "+ Bölüm", bölüm satırlarının toplamları. Ek kolonlar uzantının
 * `renderItemCells`inden; verilmezse BOŞ hücre (kolon hizası korunur).
 */
export function DiaryItemHeaderRow({
  group,
  canAddSection,
  isAddExhausted,
  onOpenPicker,
  picker,
  extraCells,
  extraColumnCount,
  itemTag,
}: DiaryItemHeaderRowProps) {
  const cells = extraCells ?? Array.from({ length: extraColumnCount }, () => null);
  const hasTag = itemTag !== undefined && itemTag !== null && itemTag !== false && itemTag !== "";
  return (
    <tr className="diary-lines__item-row">
      <td className="diary-lines__item">
        <div className="diary-lines__item-head">
          <span className="diary-lines__item-text">
            <span className="diary-lines__item-name">{group.description}</span>
            <span className="diary-lines__item-meta">
              {group.code}
              {hasTag && <> · {itemTag}</>}
              {group.unitPrice !== null ? ` · ₺${formatAmount(group.unitPrice)}/${group.unit}` : ""}
            </span>
          </span>
          {canAddSection && (
            <span className="diary-lines__add-anchor">
              <Button
                variant="ghost"
                size="sm"
                className="diary-lines__add"
                disabled={isAddExhausted}
                title={isAddExhausted ? "Eklenecek bölüm kalmadı" : undefined}
                aria-label={`${group.code} için bölüm ekle`}
                onClick={onOpenPicker}
              >
                + Bölüm
              </Button>
              {picker}
            </span>
          )}
        </div>
      </td>
      <td className="diary-lines__unit">{group.unit}</td>
      <td className="diary-lines__num diary-lines__num--strong">{formatQuantity(group.totals.today)}</td>
      <td className="diary-lines__num diary-lines__cumulative diary-lines__num--strong">
        {formatQuantity(group.totals.cumulative)}
      </td>
      <td className="diary-lines__num diary-lines__num--muted">{formatQuantity(group.totals.planned)}</td>
      <td className="diary-lines__num diary-lines__num--muted">{formatSignedQuantity(group.totals.remaining)}</td>
      {cells.map((cell, index) => (
        <td key={index} className="diary-lines__ext">
          {cell}
        </td>
      ))}
      <td className="diary-lines__amount">{formatAmount(group.totals.amount)}</td>
      <td className="diary-lines__remove-cell" />
    </tr>
  );
}

export interface DiaryLeafRowProps {
  group: DiaryItemGroup;
  leaf: DiaryLeafRow;
  /** Satır düzenlenemez (izin yok / gönderilmiş / kilitli). */
  disabled: boolean;
  /** Kilitli gün: Bugün DÜZ METİN, "—" boş (Ek Formlar hâl d · K20). */
  isLocked: boolean;
  /** × basılır mı (G10: yazma izni; kilit/gönderim yok). */
  canRemove: boolean;
  onQuantityChange: (key: string, value: string) => void;
  onOverrunReasonChange: (key: string, value: string) => void;
  onRemove: (leaf: DiaryLeafRow) => void;
  overrunReason: string;
  extraCells: readonly ReactNode[];
  columnCount: number;
  /** Uzantının tam genişlik alt satırı (S2 · `renderSubRow`); aşım satırından SONRA. */
  subRow?: ReactNode;
  /**
   * G9 · dolaylı kalem: Bölümsüz satır "Tüm şantiye" etiketiyle, tahsis
   * ipucu ve KALAN çipi olmadan basılır (F0-6 — aynı veri, farklı etiket).
   */
  isIndirect?: boolean;
  /**
   * GKS-F1.3 · satır kaydedilmemiş önizlemeden geliyor: iskelet satırının ×'i
   * pasiftir, gerekçesi "İskelet satırıdır…" (POST birleştirmesi silemez).
   */
  isPreview?: boolean;
}

/** Önizleme iskelet satırının pasif × gerekçesi (Ü4). */
export const PREVIEW_SKELETON_REMOVE_TITLE = "İskelet satırıdır, kaydedilmeden kaldırılamaz";

/** G9 · dolaylı kalemin Bölümsüz satır etiketi (F0-6). */
export const INDIRECT_UNSECTIONED_LABEL = "Tüm şantiye";

/** Bölüm (yaprak) satırı + varsa aşım alt satırı (M4 · İ:235-240). */
export function DiaryLeafRowView({
  group,
  leaf,
  disabled,
  isLocked,
  canRemove,
  onQuantityChange,
  onOverrunReasonChange,
  onRemove,
  overrunReason,
  extraCells,
  columnCount,
  isIndirect = false,
  subRow = null,
  isPreview = false,
}: DiaryLeafRowProps) {
  const showAsSiteWide = isIndirect && leaf.isUnsectioned;
  const label = showAsSiteWide ? INDIRECT_UNSECTIONED_LABEL : leaf.label;
  const isInvalid = leaf.todayValue === null;
  // Erişilebilir ad: Bölümsüz satırda eski adla AYNI ("<kod> bugün yapılan miktar").
  const ariaLabel = leaf.isUnsectioned
    ? `${group.code} bugün yapılan miktar`
    : `${group.code} · ${leaf.label} bugün yapılan miktar`;
  const isOrphan = leaf.boqItemId === null;

  return (
    <>
      <tr
        className={cx(
          "diary-lines__leaf-row",
          leaf.isOverrun && "diary-lines__leaf-row--over",
          leaf.isAdded && "diary-lines__leaf-row--new",
        )}
      >
        <td className="diary-lines__leaf">
          <span className="diary-lines__leaf-name">
            {isOrphan ? `${group.code} — ${group.description}` : label}
            {leaf.isUnsectioned && !isOrphan && !showAsSiteWide && (
              <span className="diary-lines__leaf-hint">tahsis dışı kalan</span>
            )}
            {leaf.isAdded && <span className="diary-lines__new-chip">YENİ</span>}
          </span>
          {!leaf.isUnsectioned && leaf.sectionCode !== null && (
            <span className="diary-lines__item-meta">
              {group.code} · {leaf.sectionCode}
            </span>
          )}
        </td>
        <td className="diary-lines__unit">{group.unit}</td>
        <td className="diary-lines__today">
          {isOrphan ? (
            // Öksüz satır (BOQ pozu silinmiş): PUT gövdesi `boq_item_id` zorunlu
            // tuttuğu için düzenlenemez — gizlenmez, gerekçesiyle basılır.
            <span className="diary-lines__orphan" title="Sözleşme pozu kaldırılmış — düzenlenemez">
              {EMPTY_CELL}
            </span>
          ) : isLocked ? (
            <span className="diary-lines__today-text">
              {leaf.todayText.trim() === "" ? EMPTY_CELL : formatQuantity(leaf.todayValue)}
            </span>
          ) : (
            <Input
              size="row"
              numeric
              inputMode="decimal"
              maxLength={DIARY_QUANTITY_MAX}
              className={cx("diary-lines__qty", leaf.isOverrun && "diary-lines__qty--over")}
              aria-label={ariaLabel}
              status={isInvalid ? "error" : "default"}
              value={leaf.todayText}
              disabled={disabled}
              onChange={(event) => onQuantityChange(leaf.key, event.target.value)}
            />
          )}
        </td>
        <td className={cx("diary-lines__num diary-lines__cumulative", leaf.isOverrun && "diary-lines__num--over")}>
          {formatQuantity(leaf.cumulative)}
        </td>
        <td className="diary-lines__num diary-lines__num--muted">
          {leaf.isUnsectioned && !isOrphan && !showAsSiteWide && <span className="diary-lines__kalan-chip">KALAN</span>}
          {formatQuantity(leaf.planned)}
        </td>
        <td className={cx("diary-lines__num diary-lines__num--muted", leaf.isOverrun && "diary-lines__num--over-strong")}>
          {formatSignedQuantity(leaf.remaining)}
        </td>
        {extraCells.map((cell, index) => (
          <td key={index} className="diary-lines__ext">
            {cell}
          </td>
        ))}
        <td className="diary-lines__amount">{formatAmount(leaf.amount)}</td>
        <td className="diary-lines__remove-cell">
          {canRemove && !isOrphan && (
            <button
              type="button"
              className="diary-lines__remove"
              disabled={!leaf.isRemovable}
              aria-label={`${group.code} · ${label} satırını kaldır`}
              title={
                leaf.isRemovable
                  ? undefined
                  : isPreview && !leaf.isAdded
                    ? PREVIEW_SKELETON_REMOVE_TITLE
                    : "Bölümsüz satırı iskelettir, kaldırılamaz"
              }
              onClick={() => onRemove(leaf)}
            >
              <XIcon width={12} height={12} />
            </button>
          )}
        </td>
      </tr>
      {leaf.isOverrun && (
        <tr className="diary-lines__over-row">
          <td colSpan={columnCount}>
            <div className="diary-lines__over">
              <span className="diary-lines__over-text">
                <WarningTriangleIcon width={14} height={14} aria-hidden="true" />
                Planlı miktar aşıldı · {formatQuantity(leaf.cumulative ?? leaf.todayValue)} /{" "}
                {formatQuantity(leaf.planned)} {group.unit} (+{formatQuantity(leaf.overrunExcess)})
              </span>
              <Input
                size="row"
                className="diary-lines__over-input"
                aria-label={`${group.code} · ${leaf.label} aşım gerekçesi`}
                placeholder="Gerekçe (örn. proje revizyonu, ilave priz)"
                maxLength={DIARY_OVERRUN_REASON_MAX}
                value={overrunReason}
                disabled={disabled || isLocked}
                onChange={(event) => onOverrunReasonChange(leaf.key, event.target.value)}
              />
            </div>
          </td>
        </tr>
      )}
      {subRow !== null && subRow !== undefined && (
        <tr className="diary-lines__ext-subrow">
          <td colSpan={columnCount}>{subRow}</td>
        </tr>
      )}
    </>
  );
}
