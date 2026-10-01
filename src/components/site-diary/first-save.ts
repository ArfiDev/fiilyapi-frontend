import { backendErrorMessage } from "@/lib/api/error-message";
import type { SiteDiaryEntryDetail } from "@/lib/api/hooks/useSiteDiary";
import type { SiteDiaryEntryCreate, SiteDiaryEntryUpdate } from "@/lib/api/hooks/useSiteDiaryMutations";

import type { DiaryLeafRow } from "./diary-lines-tree";
import { buildDiaryCreateBody, buildDiaryUpdateBody, type DiaryFormState } from "./form-state";
import { hasEnteredWorkerData } from "./preview-transition";

/**
 * GKS-F1.5 · kayıt YOKKEN ilk "Taslak Kaydet" zinciri. `POST /sites/{id}/diary`
 * gövdesi `worker_counts` taşımaz (sunucu yutar), bu yüzden işçi alanları
 * kirliyse AYNI kayda ikinci bir `PATCH` gider (mevcut `buildDiaryUpdateBody`
 * — ikinci gövde kodu yok). React'siz; istekler enjekte edilir.
 */

/** İşçi PATCH'i düşünce hata alanına basılan SABİT metin (backend detail'i yanına eklenir). */
export const DIARY_WORKERS_PATCH_FAILED = "Günlük açıldı ama işçi dağılımı kaydedilemedi; tekrar “Taslak Kaydet” deyin.";

export function diaryWorkersPatchFailedMessage(error: unknown): string {
  const detail = backendErrorMessage(error, "");
  return detail === "" ? DIARY_WORKERS_PATCH_FAILED : `${DIARY_WORKERS_PATCH_FAILED} ${detail}`;
}

/** Formda kaydedilecek işçi değişikliği var mı (dolu sayı/saat, eklenen firma, kaldırılan satır). */
export function isWorkerInputDirty(form: DiaryFormState): boolean {
  return hasEnteredWorkerData(form) || form.removedWorkers.length > 0;
}

export type FirstSaveResult =
  | { ok: true; created: SiteDiaryEntryDetail; /** Son sunucu yanıtı: PATCH atıldıysa o, yoksa POST yanıtı. */ saved: SiteDiaryEntryDetail }
  | { ok: false; created: SiteDiaryEntryDetail; /** İşçi PATCH'inin hatası; kayıt AÇIK kalır. */ error: unknown };

export interface FirstSaveDeps {
  create: (body: SiteDiaryEntryCreate) => Promise<SiteDiaryEntryDetail>;
  patch: (entryId: string, body: SiteDiaryEntryUpdate) => Promise<SiteDiaryEntryDetail>;
  /** POST başarılı olur olmaz, PATCH'ten ÖNCE (eşzamanlı) — ekran formu ezilmeye karşı korur. */
  onCreated: (created: SiteDiaryEntryDetail) => void;
}

/** POST hatası fırlar; PATCH hatası `ok: false` olarak döner (kayıt zaten açıldı). */
export async function saveNewDiaryEntry(
  form: DiaryFormState,
  leaves: readonly DiaryLeafRow[],
  deps: FirstSaveDeps,
): Promise<FirstSaveResult> {
  const created = await deps.create(buildDiaryCreateBody(form, leaves));
  deps.onCreated(created);
  if (!isWorkerInputDirty(form)) return { ok: true, created, saved: created };
  try {
    return { ok: true, created, saved: await deps.patch(created.id, buildDiaryUpdateBody(form, created)) };
  } catch (error: unknown) {
    return { ok: false, created, error };
  }
}
