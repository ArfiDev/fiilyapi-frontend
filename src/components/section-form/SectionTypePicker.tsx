"use client";

import { useState } from "react";

import { Button, Field, Input, Select } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useCreateSectionType, useSectionTypes } from "@/lib/api/hooks/useSectionTypes";
import { SECTION_TYPE_CREATE_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { NEW_SECTION_TYPE_OPTION, SECTION_TYPE_NAME_MAX_LENGTH, SELECT_PLACEHOLDER } from "./constants";

export interface SectionTypePickerProps {
  /** Seçili tipin id'si (`GET /section-types` satırı); boş = seçilmedi. */
  value: string;
  onChange: (sectionTypeId: string) => void;
  /** Form doğrulama hatası (taslak dışında tip zorunlu — F-c). */
  error?: string;
}

const NAME_REQUIRED_MESSAGE = "Tip adı zorunludur.";
const LOADING_MESSAGE = "Bölüm tipleri yükleniyor…";
const LOAD_ERROR_MESSAGE = "Bölüm tipleri yüklenemedi.";
const CREATE_FALLBACK_MESSAGE = "Bölüm tipi eklenemedi.";
const SAVED_TYPE_FALLBACK_LABEL = "Kayıtlı tip";

/**
 * 🏗 Bölüm Tipi seçici — şirket geneli, genişletilebilir liste (BLF-F1.3, F-b).
 *
 * "+ Yeni tip ekle" = `BoqItemFormModal` "+ Yeni Grup" deseni (KULLANICI ONAYLI
 * mockup dışı sapma, 2026-10-01): listenin SON seçeneği; seçilince altta ad
 * kutusu + Ekle/Vazgeç açılır; kaydedince yeni tip seçili olur.
 *
 * ÇAKIŞMA (409): ad karşılaştırması İSTEMCİDE YAPILMAZ (normalize tek kaynak
 * backend). Sunucu çakışmayı bildirirse `useCreateSectionType` mevcut tipi
 * döndürür → o tip SEÇİLİR ve backend mesajı "— seçildi" ile görünür kalır.
 */
export function SectionTypePicker({ value, onChange, error }: SectionTypePickerProps) {
  const types = useSectionTypes();
  const createType = useCreateSectionType();
  // IZN-F5c · POST /section-types = santiye.bolumler VEYA bolum.detay Düzenler. Form zaten kapılı; grant yoksa bugünkü (görünür) davranış.
  const canCreateType = useButtonGate({ pages: SECTION_TYPE_CREATE_EDIT, need: "edit", fallback: true });
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const list = types.data ?? [];
  const isUnavailable = types.isLoading || types.isError;
  // Liste yüklenemediğinde kayıtlı değer görünür/korunur kalır (düzenleme).
  const hasOrphanValue = value !== "" && !list.some((item) => item.id === value);

  function closeAdd() {
    setIsAdding(false);
    setName("");
    setAddError(null);
  }

  function handleSelect(next: string) {
    setNote(null);
    if (next === NEW_SECTION_TYPE_OPTION) {
      setIsAdding(true);
      return;
    }
    closeAdd();
    onChange(next);
  }

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) {
      setAddError(NAME_REQUIRED_MESSAGE);
      return;
    }
    setAddError(null);
    try {
      const outcome = await createType.mutateAsync({ name: trimmed });
      if (outcome.kind === "created") {
        onChange(outcome.sectionType.id);
        setNote(null);
        closeAdd();
        return;
      }
      if (outcome.existing) {
        onChange(outcome.existing.id);
        setNote(`${outcome.message} — seçildi`);
        closeAdd();
        return;
      }
      setAddError(outcome.message);
    } catch (err) {
      setAddError(backendErrorMessage(err, CREATE_FALLBACK_MESSAGE));
    }
  }

  return (
    <Field
      label="Bölüm Tipi"
      required
      error={error}
      hint={note ?? (types.isLoading ? LOADING_MESSAGE : undefined)}
    >
      {(control) => (
        <>
          <Select
            {...control}
            value={isAdding ? NEW_SECTION_TYPE_OPTION : value}
            disabled={isUnavailable}
            status={error ? "error" : "default"}
            onChange={(e) => handleSelect(e.target.value)}
          >
            <option value="">{SELECT_PLACEHOLDER}</option>
            {hasOrphanValue && <option value={value}>{SAVED_TYPE_FALLBACK_LABEL}</option>}
            {list.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
            {!isUnavailable && canCreateType && <option value={NEW_SECTION_TYPE_OPTION}>+ Yeni tip ekle</option>}
          </Select>

          {types.isError && (
            <div className="sf-type-status">
              <span>{LOAD_ERROR_MESSAGE}</span>
              <Button variant="ghost" size="sm" onClick={() => void types.refetch()}>
                Yeniden dene
              </Button>
            </div>
          )}

          {isAdding && (
            <div className="sf-type-add">
              <div className="sf-type-add__row">
                <Input
                  aria-label="Yeni tip adı"
                  className="sf-type-add__input"
                  maxLength={SECTION_TYPE_NAME_MAX_LENGTH}
                  value={name}
                  placeholder="Örn. Asansör"
                  status={addError ? "error" : "default"}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    void handleAdd();
                  }}
                />
                <Button variant="primary" size="sm" disabled={createType.isPending} onClick={() => void handleAdd()}>
                  {createType.isPending ? "Ekleniyor…" : "Ekle"}
                </Button>
                <Button variant="secondary" size="sm" disabled={createType.isPending} onClick={closeAdd}>
                  Vazgeç
                </Button>
              </div>
              {addError && (
                <p className="sf-type-add__error" data-testid="section-type-add-error">
                  {addError}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Field>
  );
}
