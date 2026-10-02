"use client";

import { trPriceInputValue } from "@/components/contracts/employer-item-inline";
import { WarningTriangleIcon, XIcon, inlineSymbolProps } from "@/components/ui/icons";
import { formatPrice } from "@/components/work-item-catalog/work-item-model";
import type { WorkItemRead } from "@/lib/api/models";
import { cx } from "@/lib/cx";
import { EMPTY_CELL } from "@/lib/format";

import { OfferItemCell } from "./OfferItemCell";
import { OfferResetButton } from "./OfferResetButton";
import {
  amountText,
  catalogResetBody,
  cellTone,
  generalProfitResetBody,
  isCatalogResetAllowed,
  isOfferPriceEnabled,
  isUnpriced,
  offerPriceHint,
  type CellContext,
} from "./offer-item-cells";
import { ROW_ERROR_FIELD, type OfferItemEditor } from "./useOfferItemEditor";

export interface OfferItemRowProps {
  ctx: CellContext;
  /** Katalogdaki kalem (Ref/Son önerisi); kısıtlı listeden düşen kalemde undefined → satır basılmaz [V10]. */
  catalogItem: WorkItemRead | undefined;
  /** Miktarı girilmemiş kalem (SO-21; `isQuantityMissing` kararı — finance maskesi DEĞİL). */
  isQuantityMissing: boolean;
  editor: OfferItemEditor;
  canEdit: boolean;
}

const MISSING_TEXT = "Fiyat girilmedi · tutara dahil değil";
const QUANTITY_MISSING_TEXT = "Miktar girilmedi · toplama dahil değil";
const DELETE_TITLE = "Kalemi sil";
const CATALOG_MHR_OVER_LIMIT = "Katalog a-s değeri teklif sınırını aşıyor";

/** `Ref ₺… · Son ₺…` alt satırı (maskeli/yoksa "—"); katalogda yoksa null. */
function CatalogHints({ catalogItem }: { catalogItem: WorkItemRead | undefined }) {
  if (catalogItem === undefined) return null;
  const ref = catalogItem.ref_price === null || catalogItem.ref_price === undefined ? EMPTY_CELL : `₺${formatPrice(catalogItem.ref_price)}`;
  const last = catalogItem.last_price?.price;
  return (
    <span className="oit-hints">
      <span>{`Ref ${ref}`}</span>
      <span>{`Son ${last === undefined ? EMPTY_CELL : `₺${formatPrice(last)}`}`}</span>
    </span>
  );
}

/** TD:246-262 — tek kalem satırı; 11 kolon. */
export function OfferItemRow({ ctx, catalogItem, isQuantityMissing, editor, canEdit }: OfferItemRowProps) {
  const { item } = ctx;
  const unpriced = isUnpriced(item);
  const rowError = editor.errorOf(item.id, ROW_ERROR_FIELD);
  const mhrOverridden = cellTone("unitMhr", ctx) === "override";
  const profitOverridden = cellTone("profitPct", ctx) === "override";
  const offerEnabled = isOfferPriceEnabled(item);
  const disabled = !canEdit;
  const catalogMhr = ctx.catalogUnitMhr;
  return (
    <tr
      className={cx("oit-row", (unpriced || isQuantityMissing) && "oit-row--missing")}
      data-testid={`oit-row-${item.id}`}
      aria-busy={editor.isRowBusy(item.id) || undefined}
    >
      <td className="oit-poz">{item.poz_no}</td>
      <td className="oit-desc">
        <span className="oit-desc__text">{item.description}</span>
        {isQuantityMissing && (
          <span className="oit-warn">
            <WarningTriangleIcon {...inlineSymbolProps} />
            {QUANTITY_MISSING_TEXT}
          </span>
        )}
        {unpriced && (
          <span className="oit-warn">
            <WarningTriangleIcon {...inlineSymbolProps} />
            {MISSING_TEXT}
          </span>
        )}
        {rowError !== null && <span className="oit-cell__error">{rowError}</span>}
      </td>
      <td className="oit-unit">{item.unit}</td>
      <td>
        <OfferItemCell field="quantity" ctx={ctx} editor={editor} ariaSuffix="miktar" isDisabled={disabled} />
      </td>
      <td>
        <OfferItemCell
          field="unitMhr"
          ctx={ctx}
          editor={editor}
          ariaSuffix="a-s / birim"
          isDisabled={disabled}
          title="Bu teklife özel adam-saat / birim"
        >
          {mhrOverridden && canEdit && catalogMhr !== null && (
            <OfferResetButton
              title={isCatalogResetAllowed(catalogMhr) ? "Katalog değerine dön" : CATALOG_MHR_OVER_LIMIT}
              disabled={!isCatalogResetAllowed(catalogMhr)}
              onClick={() => editor.applyBody(item.id, "unitMhr", catalogResetBody(catalogMhr))}
            >
              {`kat. ${trPriceInputValue(catalogMhr)}`}
            </OfferResetButton>
          )}
        </OfferItemCell>
      </td>
      <td>
        <OfferItemCell
          field="costUnitPrice"
          ctx={ctx}
          editor={editor}
          ariaSuffix="maliyet B.F."
          isDisabled={disabled}
          placeholder="₺ girin"
        >
          <CatalogHints catalogItem={catalogItem} />
        </OfferItemCell>
      </td>
      <td>
        <OfferItemCell field="overheadPct" ctx={ctx} editor={editor} ariaSuffix="gider %" isDisabled={disabled} />
      </td>
      <td>
        <OfferItemCell field="profitPct" ctx={ctx} editor={editor} ariaSuffix="kâr %" isDisabled={disabled}>
          {profitOverridden && canEdit && (
            <OfferResetButton onClick={() => editor.applyBody(item.id, "profitPct", generalProfitResetBody())}>
              genel
            </OfferResetButton>
          )}
        </OfferItemCell>
      </td>
      <td>
        <OfferItemCell
          field="offerUnitPrice"
          ctx={ctx}
          editor={editor}
          ariaSuffix="teklif B.F."
          isDisabled={disabled || !offerEnabled}
          title="Teklif birim fiyatı girilirse kâr % buna göre hesaplanır"
        >
          <span className="oit-hint">{offerPriceHint(ctx)}</span>
        </OfferItemCell>
      </td>
      <td className="oit-amount" data-testid="oit-amount">
        {amountText(item)}
      </td>
      <td className="oit-del">
        <button
          type="button"
          className="oit-icon-btn"
          title={DELETE_TITLE}
          aria-label={`${item.poz_no} kalemi sil`}
          disabled={disabled}
          onClick={() => editor.removeItem(item.id)}
        >
          <XIcon width={14} height={14} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}
