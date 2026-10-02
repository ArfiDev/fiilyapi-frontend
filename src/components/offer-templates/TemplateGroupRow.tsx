"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

const NAME_MAX_LENGTH = 200;
/** GECE KURALI: mockup'ta grup silme yok (ÜS-F4-4); `×` ipucu. */
export const REMOVE_GROUP_TITLE = "Grubu sil";

interface TemplateGroupRowProps {
  code: string;
  name: string;
  itemCount: number;
  canEdit: boolean;
  /** Yalnız ad DEĞİŞTİYSE ve boş değilse çağrılır. */
  onRename: (name: string) => void;
  onRemove: () => void;
}

/** TS:143 "A Betonarme 5 kalem" — ad tıkla-düzenle (ÜS-F4-3); BOŞ grupta × (ÜS-F4-4). */
export function TemplateGroupRow({ code, name, itemCount, canEdit, onRename, onRemove }: TemplateGroupRowProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Escape girişi kaldırır; tarayıcı kaldırılan odaklı girişte `blur` atabilir → iptal bayrağı yazımı korur.
  const isCancelledRef = useRef(false);
  const isEditing = draft !== null;
  // Satır-içi ad girişi de kaydedilmemiş sayılır (şablon adı/açıklaması/oranlar gibi): yazılan ad sessiz kaybolmasın.
  useUnsavedChanges(isEditing && draft !== name, "Grup adı");

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
    if (next !== "" && next !== name) onRename(next);
  }

  return (
    <tr className="otpl-group">
      <td colSpan={6}>
        <div className="otpl-group__row">
          <span className="otpl-group__code">{code}</span>
          {isEditing ? (
            <Input
              ref={inputRef}
              size="row"
              value={draft}
              maxLength={NAME_MAX_LENGTH}
              aria-label="Grup adı"
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
            <button type="button" className="otpl-group__name" onClick={startEdit} title="Grup adını düzenle">
              {name}
            </button>
          ) : (
            <span className="otpl-group__name">{name}</span>
          )}
          <span className="otpl-group__count">{itemCount} kalem</span>
          {canEdit && itemCount === 0 && (
            <button type="button" className="otpl-x otpl-group__remove" title={REMOVE_GROUP_TITLE} aria-label={REMOVE_GROUP_TITLE} onClick={onRemove}>
              ×
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
