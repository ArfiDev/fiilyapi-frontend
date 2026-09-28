"use client";

import { useState } from "react";

import type { EvDayView } from "@/lib/api/models";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import { draftFromView, invalidCellCount, isDraftDirty, type AllocationDraft } from "./allocation-model";

interface DraftState {
  /** Şantiye + gün — değişince taslak SIFIRLANIR (kök rotada şantiye bir sorgu parametresidir). */
  key: string;
  view: EvDayView;
  base: AllocationDraft;
  draft: AllocationDraft;
}

export interface AllocationDraftApi {
  draft: AllocationDraft;
  isDirty: boolean;
  invalidCount: number;
  update: (fn: (draft: AllocationDraft) => AllocationDraft) => void;
}

/**
 * Sunucu dağılımı → düzenlenebilir taslak. Taslak ADAPTÖRDE durur, çünkü
 * çekirdeğe verilen Gönder kapısı (`submitGate`) kaydedilmemiş dağıtımı
 * bilmek zorundadır.
 *
 * Senkron kuralı (render sırasında, `useSyncedFieldState` deseni):
 * - şantiye/gün değişti → yeni günün tabanı (önceki günün düzenlemesi SIZMAZ);
 * - aynı gün yeniden geldi (kayıt yanıtı, refetch) → taslak temizse yeni taban,
 *   kullanıcının kaydedilmemiş düzenlemesi varsa KORUNUR.
 */
export function useAllocationDraft(siteId: string, view: EvDayView | undefined): AllocationDraftApi | null {
  const [state, setState] = useState<DraftState | null>(null);
  let current = state;
  if (view !== undefined) {
    const key = `${siteId}|${view.day}`;
    if (current === null || current.key !== key || current.view !== view) {
      current = nextState(current, key, view);
      setState(current);
    }
  }
  const isDirty =
    view !== undefined && current !== null ? isDraftDirty(current.draft, current.base, view.rows) : false;
  useUnsavedChanges(isDirty, "Kaynak dağılımı");
  if (view === undefined || current === null) return null;
  const { draft } = current;
  return {
    draft,
    isDirty,
    invalidCount: invalidCellCount(draft),
    update: (fn) => setState((prev) => (prev === null ? prev : { ...prev, draft: fn(prev.draft) })),
  };
}

function nextState(previous: DraftState | null, key: string, view: EvDayView): DraftState {
  const base = draftFromView(view);
  const keepEdits =
    previous !== null &&
    previous.key === key &&
    isDraftDirty(previous.draft, previous.base, view.rows) &&
    isDraftDirty(previous.draft, base, view.rows);
  return { key, view, base, draft: keepEdits ? previous.draft : base };
}
