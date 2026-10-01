/**
 * TKL-F1.3.1 · İş Kalemi Kataloğu taslakları — EKRAN düzeyinde, kimliğe göre (KIK:233-236
 * `state.edit`). Satır çip/arama süzgecinden düşse de taslak (form + hata + istek durumu)
 * YAŞAR; süzgeç geri açılınca satır kaldığı yerden görünür.
 *
 * Saf ve değişmez: her işlem yeni dizi döner.
 */
import type { WorkDisciplineRead, WorkItemRead } from "@/lib/api/models";

import { emptyWorkItemForm, isWorkItemFormDirty, workItemFormFromItem, type WorkItemFormState } from "./work-item-form";
import type { WorkItemFilter } from "./work-item-model";

const LOCALE = "tr-TR";
const NEW_KEY_PREFIX = "new-";

export interface WorkItemDraft {
  /** Düzenleme: kalem kimliği · yeni satır: `new-<sıra>`. */
  key: string;
  /** Düzenlenen kalemin kimliği; yeni satırda null. */
  itemId: string | null;
  /** Yeni satırda açıldığı andaki İSTENEN disiplin KİMLİĞİ ("" = disiplin yok); çizim/kayıtta listeden çözülür. */
  disciplineId: string;
  initial: WorkItemFormState;
  form: WorkItemFormState;
  hasTried: boolean;
  serverError: string | null;
  isSaving: boolean;
}

export function newDraftKey(sequence: number): string {
  return `${NEW_KEY_PREFIX}${sequence}`;
}

export function editDraftFromItem(item: WorkItemRead): WorkItemDraft {
  const form = workItemFormFromItem(item);
  return {
    key: item.id,
    itemId: item.id,
    disciplineId: item.discipline.id,
    initial: form,
    form,
    hasTried: false,
    serverError: null,
    isSaving: false,
  };
}

export function newDraftFor(sequence: number, discipline: WorkDisciplineRead | null): WorkItemDraft {
  const form = emptyWorkItemForm(discipline?.default_contractor_type ?? "own");
  return {
    key: newDraftKey(sequence),
    itemId: null,
    disciplineId: discipline?.id ?? "",
    initial: form,
    form,
    hasTried: false,
    serverError: null,
    isSaving: false,
  };
}

export function isNewDraft(draft: WorkItemDraft): boolean {
  return draft.itemId === null;
}

export function isDraftDirty(draft: WorkItemDraft): boolean {
  return isWorkItemFormDirty(draft.initial, draft.form);
}

/** Yeni satırın disiplini ŞİMDİKİ listeden çözülür; listede yoksa null. */
export function resolveNewDraftDiscipline(
  draft: WorkItemDraft,
  disciplines: readonly WorkDisciplineRead[],
): WorkDisciplineRead | null {
  return disciplines.find((discipline) => discipline.id === draft.disciplineId) ?? null;
}

export function addDraft(drafts: readonly WorkItemDraft[], draft: WorkItemDraft): readonly WorkItemDraft[] {
  return [draft, ...drafts.filter((existing) => existing.key !== draft.key)];
}

export function updateDraft(
  drafts: readonly WorkItemDraft[],
  key: string,
  change: Partial<Omit<WorkItemDraft, "key" | "itemId">>,
): readonly WorkItemDraft[] {
  return drafts.map((draft) => (draft.key === key ? { ...draft, ...change } : draft));
}

export function patchDraftForm(
  drafts: readonly WorkItemDraft[],
  key: string,
  change: Partial<WorkItemFormState>,
): readonly WorkItemDraft[] {
  return drafts.map((draft) =>
    draft.key === key ? { ...draft, serverError: null, form: { ...draft.form, ...change } } : draft,
  );
}

export function removeDraft(drafts: readonly WorkItemDraft[], key: string): readonly WorkItemDraft[] {
  return drafts.filter((draft) => draft.key !== key);
}

/**
 * KIK:244 — yeni satır listenin parçasıdır: çip süzgecine ve aramaya (`poz_no` boş + yazılan
 * tarif) girer. Boş tarif hiçbir aramaya uymaz; arama kutusu boşken her yeni satır görünür.
 */
export function filterNewDrafts(
  drafts: readonly WorkItemDraft[],
  { query, disciplineId }: WorkItemFilter,
): WorkItemDraft[] {
  const needle = query.trim().toLocaleLowerCase(LOCALE);
  return drafts.filter(
    (draft) =>
      isNewDraft(draft) &&
      (disciplineId === null || draft.disciplineId === disciplineId) &&
      (needle === "" || ` ${draft.form.name}`.toLocaleLowerCase(LOCALE).includes(needle)),
  );
}
