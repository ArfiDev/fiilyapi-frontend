import { describe, expect, it } from "vitest";

import { budgetAccess } from "./budget/revision-state";
import { resolveAllocationAccess } from "./diary/submit-checks";
import { approveGate } from "./reports/daily/daily-logic";

// IZN-F6b — kapılar ZORUNLU ve sayfa izni kararlarıdır; seviye (modül izni) dalı kaldırıldı.

describe("budgetAccess · sayfa izni kapıları", () => {
  it("kapılar olduğu gibi taşınır (Onaylar yoksa dondurma kapalı)", () => {
    expect(budgetAccess({ canDraft: true, canApprove: false, canDeleteDraft: false })).toMatchObject({ canDraft: true, canApprove: false, canDeleteDraft: false });
    expect(budgetAccess({ canDraft: true, canApprove: true, canDeleteDraft: false })).toMatchObject({ canDraft: true, canApprove: true, canDeleteDraft: false });
  });

  it("taslak sil kapısı Dondur'dan AYRIDIR (yalnız SA)", () => {
    const access = budgetAccess({ canDraft: true, canApprove: true, canDeleteDraft: false });
    expect(access).toMatchObject({ canApprove: true, canDeleteDraft: false });
  });
});

describe("resolveAllocationAccess · sayfa izni kapıları", () => {
  const base = { diaryCanWrite: true, isLocked: false, isSiteCompleted: false, canWriteAllocation: true, canUnlockDay: false };

  it("Gün Kilidi Aç kapısı canUnlock'u belirler", () => {
    expect(resolveAllocationAccess({ ...base, canUnlockDay: true }).canUnlock).toBe(true);
    expect(resolveAllocationAccess({ ...base, canUnlockDay: false }).canUnlock).toBe(false);
  });

  it("dağıtım yazma kapısı formen kararını belirler", () => {
    expect(resolveAllocationAccess({ ...base, canWriteAllocation: false }).isForeman).toBe(true);
    expect(resolveAllocationAccess({ ...base, canWriteAllocation: true }).isForeman).toBe(false);
  });

  it("tamamlanmış şantiyede kilit açılmaz", () => {
    expect(resolveAllocationAccess({ ...base, canUnlockDay: true, isSiteCompleted: true }).canUnlock).toBe(false);
  });
});

describe("approveGate · Günü Onayla kapısı", () => {
  const input = { canApprove: false, siteCompleted: false, status: "draft" as const, draftDiaryDates: [] };

  it("Onaylar bayrağı (canApprove) görünürlüğü belirler", () => {
    expect(approveGate({ ...input, canApprove: true }).visible).toBe(true);
    expect(approveGate({ ...input, canApprove: false }).visible).toBe(false);
  });
});
