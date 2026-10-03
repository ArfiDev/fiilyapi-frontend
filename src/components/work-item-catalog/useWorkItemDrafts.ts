"use client";

import { useCallback, useState } from "react";

import { backendErrorMessage } from "@/lib/api/error-message";
import { useCreateCatalogItem, useUpdateCatalogItem } from "@/lib/api/hooks/useCatalogItems";
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";
import { useUnsavedChanges } from "@/lib/workspace-tabs/useUnsavedChanges";

import {
  addDraft,
  editDraftFromItem,
  isDraftDirty,
  newDraftFor,
  patchDraftForm,
  removeDraft,
  resolveNewDraftDiscipline,
  updateDraft,
  type WorkItemDraft,
} from "./work-item-drafts";
import {
  buildWorkItemCreateBody,
  buildWorkItemUpdateBody,
  firstWorkItemError,
  type WorkItemFormState,
} from "./work-item-form";

/** `useUnsavedChanges` etiketi (sekme kapatma onayı). */
const UNSAVED_LABEL = "İş kalemi";

interface UseWorkItemDraftsOptions {
  /** Disiplinler (yüklendiyse); yeni satırın disiplini kayıtta buradan çözülür. */
  disciplines: readonly WorkDisciplineRead[];
  onSaved: (saved: WorkItemRead) => void;
}

export interface WorkItemDraftsApi {
  drafts: readonly WorkItemDraft[];
  openNew: (discipline: WorkDisciplineRead | null) => void;
  openEdit: (item: WorkItemRead) => void;
  patch: (key: string, change: Partial<WorkItemFormState>) => void;
  cancel: (key: string) => void;
  save: (key: string) => Promise<void>;
}

/**
 * KIK:233-236 — taslaklar + satır hata/istek durumu EKRAN düzeyinde, kimliğe göre. Kayıt da
 * burada koşar: satır süzgeçten düşüp unmount olsa bile istek sonucu taslağa yazılır.
 * Kaydedilmemiş değişiklik kaydı (`useUnsavedChanges`) TÜM taslaklardan beslenir.
 */
export function useWorkItemDrafts({ disciplines, onSaved }: UseWorkItemDraftsOptions): WorkItemDraftsApi {
  const [drafts, setDrafts] = useState<readonly WorkItemDraft[]>([]);
  const [sequence, setSequence] = useState(0);
  const createItem = useCreateCatalogItem();
  const updateItem = useUpdateCatalogItem();

  useUnsavedChanges(drafts.some(isDraftDirty), UNSAVED_LABEL);

  function openNew(discipline: WorkDisciplineRead | null) {
    const next = sequence + 1;
    setSequence(next);
    setDrafts((current) => addDraft(current, newDraftFor(next, discipline)));
  }

  // Kararlı kimlik (yalnız `setDrafts` kullanır): satır `React.memo`su (WorkItemRow) bozulmasın.
  const openEdit = useCallback((item: WorkItemRead) => {
    setDrafts((current) =>
      current.some((draft) => draft.key === item.id) ? current : addDraft(current, editDraftFromItem(item)),
    );
  }, []);

  const patch = useCallback((key: string, change: Partial<WorkItemFormState>) => {
    setDrafts((current) => patchDraftForm(current, key, change));
  }, []);

  const cancel = useCallback((key: string) => {
    setDrafts((current) => removeDraft(current, key));
  }, []);

  async function save(key: string) {
    const draft = drafts.find((candidate) => candidate.key === key);
    if (!draft || draft.isSaving) return;
    const disciplineId =
      draft.itemId !== null ? draft.disciplineId : (resolveNewDraftDiscipline(draft, disciplines)?.id ?? "");
    if (firstWorkItemError(draft.form, disciplineId)) {
      setDrafts((current) => updateDraft(current, key, { hasTried: true, serverError: null }));
      return;
    }
    const request = buildRequest(draft, disciplineId);
    if (request === null) {
      cancel(key); // değişiklik yok → istek yok, satır kapanır
      return;
    }
    setDrafts((current) => updateDraft(current, key, { isSaving: true, serverError: null }));
    try {
      const saved = await (request.kind === "create"
        ? createItem.mutateAsync(request.body)
        : updateItem.mutateAsync({ id: request.id, body: request.body }));
      cancel(key);
      onSaved(saved);
    } catch (error) {
      setDrafts((current) => updateDraft(current, key, { isSaving: false, serverError: backendErrorMessage(error) }));
    }
  }

  return { drafts, openNew, openEdit, patch, cancel, save };
}

type SaveRequest =
  | { kind: "create"; body: ReturnType<typeof buildWorkItemCreateBody> }
  | { kind: "update"; id: string; body: ReturnType<typeof buildWorkItemUpdateBody> };

/** Doğrulamadan geçmiş taslak → istek; düzenlemede değişen alan yoksa null. */
function buildRequest(draft: WorkItemDraft, disciplineId: string): SaveRequest | null {
  if (draft.itemId === null) {
    return { kind: "create", body: buildWorkItemCreateBody(draft.form, disciplineId) };
  }
  const body = buildWorkItemUpdateBody(draft.initial, draft.form);
  return Object.keys(body).length === 0 ? null : { kind: "update", id: draft.itemId, body };
}
