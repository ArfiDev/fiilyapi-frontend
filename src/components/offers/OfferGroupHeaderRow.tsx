"use client";

import { useEffect, useRef, useState } from "react";

import { XIcon } from "@/components/ui/icons";
import { formatMoneyTl, formatWholeNumber } from "@/components/work-item-catalog/work-item-model";
import { Input } from "@/components/ui";
import { EMPTY_CELL } from "@/lib/format";

import type { OfferItem } from "./offer-item-cells";
import { groupTotals, type GroupTotals } from "./offer-items-model";

export interface OfferGroupHeaderRowProps {
  code: string;
  groupId: string;
  name: string;
  items: readonly OfferItem[];
  canEdit: boolean;
  /** Ad değişikliği (boş/aynı ad çağrılmaz). */
  onRename: (groupId: string, name: string) => void;
  /** Yalnız BOŞ grupta sunulur (dolu grup silme kalemleri kaskad siler). */
  onDelete: (groupId: string) => void;
}

const NAME_MAX_LENGTH = 200;

/** TD `nf(S.as) + ' a-s'` — kuruşsuz ("5.044 a-s"). */
function manHoursText(totals: GroupTotals): string {
  return totals.manHours === null ? EMPTY_CELL : `${formatWholeNumber(totals.manHours)} a-s`;
}

/** TD:238-245 — grup başlığı: kod harfi · ad (tıkla-düzenle, ÜS-F3-11) · n kalem · Σ a-s · maliyet · Σ tutar. */
export function OfferGroupHeaderRow({ code, groupId, name, items, canEdit, onRename, onDelete }: OfferGroupHeaderRowProps) {
  const totals = groupTotals(items);
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape girişi kaldırır; tarayıcı kaldırılan odaklı girişte `blur` atabilir → iptal bayrağı yazımı korur.
  const isCancelledRef = useRef(false);
  const isEditing = draft !== null;

  // Düzenleme kipine geçişte odak girişe taşınır (tıklanan düğme DOM'dan kalkar).
  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  function startEdit() {
    isCancelledRef.current = false;
    setDraft(name);
  }

  function finishEdit() {
    const next = draft?.trim() ?? "";
    setDraft(null);
    if (isCancelledRef.current) return;
    if (next !== "" && next !== name) onRename(groupId, next);
  }

  return (
    <tr className="oit-group" data-testid={`oit-group-${groupId}`}>
      <td colSpan={4} className="oit-group__title">
        <span className="oit-group__code">{code}</span>
        {draft !== null ? (
          <Input
            ref={inputRef}
            size="row"
            className="oit-group__input"
            aria-label="Grup adı"
            value={draft}
            maxLength={NAME_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={finishEdit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                isCancelledRef.current = true;
                setDraft(null);
              }
            }}
          />
        ) : canEdit ? (
          <button type="button" className="oit-group__name" onClick={startEdit}>
            {name}
          </button>
        ) : (
          <span className="oit-group__name">{name}</span>
        )}
        <span className="oit-group__count">{`${totals.count} kalem`}</span>
        {canEdit && totals.count === 0 && (
          <button
            type="button"
            className="oit-icon-btn"
            title="Boş grubu sil"
            aria-label={`${name} grubunu sil`}
            onClick={() => onDelete(groupId)}
          >
            <XIcon width={14} height={14} aria-hidden="true" />
          </button>
        )}
      </td>
      <td className="oit-group__num">{manHoursText(totals)}</td>
      <td colSpan={4} className="oit-group__num">{`maliyet ${formatMoneyTl(totals.cost)}`}</td>
      <td className="oit-group__num oit-group__amount">{formatMoneyTl(totals.amount)}</td>
      <td />
    </tr>
  );
}
