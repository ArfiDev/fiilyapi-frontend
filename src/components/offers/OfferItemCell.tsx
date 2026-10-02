"use client";

import type { ReactNode } from "react";

import { Input } from "@/components/ui";
import { cx } from "@/lib/cx";

import { cellText, cellTone, type CellContext, type ItemCellField } from "./offer-item-cells";
import type { OfferItemEditor } from "./useOfferItemEditor";

export interface OfferItemCellProps {
  field: ItemCellField;
  ctx: CellContext;
  editor: OfferItemEditor;
  /** Erişilebilir ad soneki ("miktar", "maliyet B.F." …); ad `{poz_no} {ariaSuffix}`. */
  ariaSuffix: string;
  /** Yazma yetkisi/durumu yok ya da alan kapalı (SO-4 teklif B.F.). */
  isDisabled: boolean;
  placeholder?: string;
  title?: string;
  /** Girişin altı: ref/son satırı, "↺" düğmesi, ipucu. */
  children?: ReactNode;
}

/**
 * Tek düzenlenebilir hücre: ham metin `editor` taslağında, yoksa sunucu değeri (`cellText`). Odak çıkışı kaydeder
 * (kuyruğa girer); Enter odağı bırakır, Escape yazımı atar. Ton: genel (soluk) · elle değiştirildi (mavi) · eksik (sarı).
 */
export function OfferItemCell({ field, ctx, editor, ariaSuffix, isDisabled, placeholder, title, children }: OfferItemCellProps) {
  const itemId = ctx.item.id;
  const error = editor.errorOf(itemId, field);
  const tone = cellTone(field, ctx);
  return (
    <div className="oit-cell">
      <Input
        numeric
        size="row"
        inputMode="decimal"
        className={cx("oit-in", tone !== "general" && `oit-in--${tone}`)}
        value={editor.draftOf(itemId, field) ?? cellText(field, ctx)}
        disabled={isDisabled || editor.isPending(itemId, field)}
        placeholder={placeholder}
        title={title}
        status={error === null ? "default" : "error"}
        aria-label={`${ctx.item.poz_no} ${ariaSuffix}`}
        aria-invalid={error === null ? undefined : true}
        onChange={(event) => editor.setDraft(itemId, field, event.target.value)}
        onBlur={() => editor.commit(itemId, field)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            editor.cancelDraft(itemId, field);
            event.currentTarget.blur();
          }
        }}
      />
      {children}
      {error !== null && <span className="oit-cell__error">{error}</span>}
    </div>
  );
}
