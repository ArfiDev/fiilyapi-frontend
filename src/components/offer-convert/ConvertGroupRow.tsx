"use client";

import { Input, Select } from "@/components/ui";
import type { WorkDisciplineRead } from "@/lib/api/models";

import type { ConvertGroupDraft } from "./convert-types";
import "./offer-convert.css";

export interface ConvertGroupRowProps {
  group: ConvertGroupDraft;
  /** Teklifteki kalem sayısı (çıkarılanlar dahil). */
  itemCount: number;
  /** Tamamen çıkarılmış / boş grup gövdeye girmez (ÜS-F5-18). */
  isSkipped: boolean;
  /** Ad düzenleyicisi açık: çakışıyor VEYA düzenlendi VEYA sunucu adı reddetti (SO-29/30/52). */
  isNameEditable: boolean;
  nameError: string | undefined;
  /** Dahil satırları birden çok disiplinde (ÜS-F5-20). */
  isMixed: boolean;
  /** Şantiye açık: eşleme yalnız o zaman anlamlı (SO-32). */
  isSiteOpen: boolean;
  disciplines: readonly WorkDisciplineRead[];
  onRename: (groupKey: string, name: string) => void;
  onDiscipline: (groupKey: string, disciplineId: string | null) => void;
}

const SITE_CLOSED_NOTE = "Şantiye açılmadığı için eşleme Planlama'da yapılır";

/** Grup başlık satırı (T15; mockup düz liste çizer — kullanıcı onaylı SAPMA): ad · N kalem · durum çipleri. */
export function ConvertGroupRow(props: ConvertGroupRowProps) {
  const { group, itemCount, isSkipped, isNameEditable, nameError, isMixed, isSiteOpen, onRename } = props;
  return (
    <tr data-testid={`convert-group-${group.key}`} className="convert-group">
      <td colSpan={8}>
        <div className="convert-group__row">
          {isNameEditable ? (
            <div className="convert-cell">
              <Input size="row" aria-label="Grup adı" value={group.name} status={nameError ? "error" : "default"} onChange={(e) => onRename(group.key, e.target.value)} />
              {nameError && <span className="convert-error-text">{nameError}</span>}
            </div>
          ) : (
            <span className="convert-group__name">{group.name}</span>
          )}
          <span className="convert-group__count">{itemCount} kalem</span>
          {isSkipped && <span className="convert-group__skip">sözleşmeye geçmeyecek</span>}
          {isMixed && !isSkipped && <MixedDiscipline {...props} />}
          {isMixed && !isSkipped && !isSiteOpen && <span className="convert-group__skip">{SITE_CLOSED_NOTE}</span>}
        </div>
      </td>
    </tr>
  );
}

function MixedDiscipline({ group, isSiteOpen, disciplines, onDiscipline }: ConvertGroupRowProps) {
  return (
    <>
      <span className="convert-group__mixed">Karışık disiplin</span>
      {isSiteOpen && (
        <Select
          size="row"
          aria-label="Disiplin"
          className="convert-group__select"
          value={group.disciplineId ?? ""}
          onChange={(e) => onDiscipline(group.key, e.target.value === "" ? null : e.target.value)}
        >
          <option value="">Seçiniz…</option>
          {disciplines.map((discipline) => (
            <option key={discipline.id} value={discipline.id}>
              {discipline.name}
            </option>
          ))}
        </Select>
      )}
    </>
  );
}
