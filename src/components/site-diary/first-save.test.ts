import { describe, it, expect, vi } from "vitest";

import { BackendError } from "@/lib/api/unwrap";
import type { SiteDiaryEntryDetail } from "@/lib/api/hooks/useSiteDiary";

import {
  DIARY_WORKERS_PATCH_FAILED,
  diaryWorkersPatchFailedMessage,
  isWorkerInputDirty,
  saveNewDiaryEntry,
} from "./first-save";
import { emptyDiaryForm, type DiaryFormState } from "./form-state";

// GKS-F1.5 · kayıt yokken ilk Taslak Kaydet zinciri: POST (+lines) → işçi kirliyse PATCH.

const DAY = "2026-09-24";
const CREATED = { id: "d-9", entry_date: DAY, worker_counts: [], lines: [] } as unknown as SiteDiaryEntryDetail;
const PATCHED = { ...CREATED, worker_total: 4 } as unknown as SiteDiaryEntryDetail;

function formWith(patch: Partial<DiaryFormState>): DiaryFormState {
  return { ...emptyDiaryForm(DAY), ...patch };
}

const WORKER_FORM = formWith({
  addedFirms: [{ subcontractorId: "sub-1", trade: "Kaya Duvar" }],
  workerCounts: { "firm|sub-1": "4" },
  workerHours: { "firm|sub-1": "8" },
});

function deps(overrides: Partial<Parameters<typeof saveNewDiaryEntry>[2]> = {}) {
  const calls: string[] = [];
  const create = vi.fn(async () => {
    calls.push("create");
    return CREATED;
  });
  const patch = vi.fn(async () => {
    calls.push("patch");
    return PATCHED;
  });
  const onCreated = vi.fn(() => {
    calls.push("created");
  });
  return { calls, create, patch, onCreated, input: { create, patch, onCreated, ...overrides } };
}

describe("isWorkerInputDirty", () => {
  it("boş formda false; dolu sayı/saat, eklenen firma ya da kaldırılan satır true", () => {
    expect(isWorkerInputDirty(emptyDiaryForm(DAY))).toBe(false);
    expect(isWorkerInputDirty(formWith({ workerCounts: { "firm|a": "  " } }))).toBe(false);
    expect(isWorkerInputDirty(formWith({ workerCounts: { "firm|a": "2" } }))).toBe(true);
    expect(isWorkerInputDirty(formWith({ workerHours: { "firm|a": "8" } }))).toBe(true);
    expect(isWorkerInputDirty(formWith({ addedFirms: [{ subcontractorId: "a", trade: "A" }] }))).toBe(true);
    expect(isWorkerInputDirty(formWith({ removedWorkers: ["company|Usta"] }))).toBe(true);
  });
});

describe("saveNewDiaryEntry", () => {
  it("işçi kirliyken POST SONRA PATCH; PATCH gövdesi worker_counts taşır ve YENİ kayıt kimliğine gider", async () => {
    const { calls, patch, input } = deps();

    const result = await saveNewDiaryEntry(WORKER_FORM, [], input);

    expect(calls).toEqual(["create", "created", "patch"]);
    expect(patch).toHaveBeenCalledTimes(1);
    const [entryId, body] = patch.mock.calls[0] as unknown as [string, { worker_counts?: { subcontractor_id?: string; count: number }[] }];
    expect(entryId).toBe("d-9");
    expect(body.worker_counts).toEqual([expect.objectContaining({ subcontractor_id: "sub-1", count: 4 })]);
    expect(result).toEqual({ ok: true, created: CREATED, saved: PATCHED });
  });

  it("işçi kirli DEĞİLKEN PATCH atılmaz; saved = POST yanıtı", async () => {
    const { calls, patch, input } = deps();

    const result = await saveNewDiaryEntry(formWith({ workDone: "x" }), [], input);

    expect(patch).not.toHaveBeenCalled();
    expect(calls).toEqual(["create", "created"]);
    expect(result).toEqual({ ok: true, created: CREATED, saved: CREATED });
  });

  it("PATCH düşerse ok=false, kayıt (created) bildirilmiş kalır, hata taşınır", async () => {
    const failure = new BackendError(500, { detail: "boom" });
    const { onCreated, input } = deps({
      patch: vi.fn(async () => {
        throw failure;
      }),
    });

    const result = await saveNewDiaryEntry(WORKER_FORM, [], input);

    expect(onCreated).toHaveBeenCalledWith(CREATED);
    expect(result).toEqual({ ok: false, created: CREATED, error: failure });
  });

  it("POST düşerse hata fırlar; PATCH ve onCreated çağrılmaz", async () => {
    const failure = new BackendError(409, { detail: "var" });
    const { patch, onCreated, input } = deps({
      create: vi.fn(async () => {
        throw failure;
      }),
    });

    await expect(saveNewDiaryEntry(WORKER_FORM, [], input)).rejects.toBe(failure);
    expect(patch).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("diaryWorkersPatchFailedMessage", () => {
  it("sabit metin; backend detail'i varsa yanına eklenir", () => {
    expect(DIARY_WORKERS_PATCH_FAILED).toBe("Günlük açıldı ama işçi dağılımı kaydedilemedi; tekrar “Taslak Kaydet” deyin.");
    expect(diaryWorkersPatchFailedMessage(new Error("ağ"))).toBe(DIARY_WORKERS_PATCH_FAILED);
    expect(diaryWorkersPatchFailedMessage(new BackendError(422, { detail: "Sayı geçersiz." }))).toBe(
      `${DIARY_WORKERS_PATCH_FAILED} Sayı geçersiz.`,
    );
  });
});
