"use client";

import { useMemo } from "react";

import { CatalogPickerModal, type PickerSubmission } from "@/components/work-item-picker/CatalogPickerModal";
import type { PickerGroup } from "@/components/work-item-picker/picker-model";
import { CONVERT_PICKER_TARGET, type ConvertAddBody } from "@/components/work-item-picker/picker-target";

import type { CatalogEntry, CatalogTarget } from "./convert-model";
import type { ConvertDraft } from "./convert-types";

export interface ConvertCatalogPickerHostProps {
  draft: ConvertDraft;
  /** Alt metin bağlamı: "TKL-2026-0014 Rev.2". */
  contextLabel: string;
  /** Onay: seçici KAPANMADAN önce taslağa yazılır (yerel işlem; ağ YOK). */
  onAdd: (target: CatalogTarget, entries: readonly CatalogEntry[]) => void;
  onClose: () => void;
}

/**
 * Taslağı seçicinin yapısal grup görünümüne çevirir. `id` = taslağın KENDİ grup anahtarı (`g:…`/`ng:…`; ad#sıra DEĞİL —
 * anahtar yeniden adlandırmada değişmez). Kalem `isExcluded` = taslakta çıkarılmış: "Listede var" sayılır ama 2000 tavanına girmez.
 */
function toPickerGroups(draft: ConvertDraft): PickerGroup[] {
  return draft.groups.map((group, index) => ({
    id: group.key,
    name: group.name,
    sort_order: index,
    items: draft.rows
      .filter((row) => row.groupKey === group.key)
      .map((row, position) => ({ code: row.code, catalog_item_id: row.catalogItemId, sort_order: position, isExcluded: !row.included })),
  }));
}

/**
 * TKL-F5.4 · Dönüştür Adım 2 "+ Katalogdan kalem ekle" → ortak seçici (DÖRDÜNCÜ hedef, fiyatlı mod). Gövde HTTP değil
 * YEREL satırlardır; onay taslağa yazar ve seçici kapanır (eşzamanlı: uçuş/sunucu hatası yok).
 */
export function ConvertCatalogPickerHost({ draft, contextLabel, onAdd, onClose }: ConvertCatalogPickerHostProps) {
  const groups = useMemo(() => toPickerGroups(draft), [draft]);

  function handleSubmit(submission: PickerSubmission<ConvertAddBody>) {
    if (submission.newGroup !== null) {
      onAdd({ newGroupName: submission.newGroup.name }, submission.buildBody("").entries);
    } else if (submission.body !== null) {
      onAdd({ groupKey: submission.body.groupId }, submission.body.entries);
    }
    onClose();
  }

  return (
    <CatalogPickerModal<ConvertAddBody>
      target={CONVERT_PICKER_TARGET}
      projectName={contextLabel}
      groups={groups}
      onSubmit={handleSubmit}
      onClose={onClose}
      isSubmitting={false}
      submitError={null}
    />
  );
}
