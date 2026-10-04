import { describe, expect, it } from "vitest";

import { budgetAccess } from "./budget/revision-state";
import { resolveAllocationAccess } from "./diary/submit-checks";
import { approveGate } from "./reports/daily/daily-logic";

// IZN-F2.x — sayfa izni kararları verildiğinde `earned_value` seviye eşiklerinin YERİNE geçer;
// verilmediğinde bugünkü seviye kuralı aynen sürer.

describe("budgetAccess · sayfa izni kapıları", () => {
  it("kapı verilmezse eski seviye kuralı: approve → dondur + taslak sil", () => {
    expect(budgetAccess("approve")).toMatchObject({ canDraft: true, canApprove: true });
    expect(budgetAccess("draft")).toMatchObject({ canDraft: true, canApprove: false });
  });

  it("kapı seviyenin ÜSTÜNE yazar: seviye approve olsa da Onaylar bayrağı yoksa dondurma kapalı", () => {
    expect(budgetAccess("approve", { canApprove: false }).canApprove).toBe(false);
  });

  it("taslak sil kapısı Dondur'dan AYRIDIR (yalnız SA)", () => {
    const access = budgetAccess(undefined, { canDraft: true, canApprove: true, canDeleteDraft: false });
    expect(access).toMatchObject({ canApprove: true, canDeleteDraft: false });
  });
});

describe("resolveAllocationAccess · sayfa izni kapıları", () => {
  const base = { diaryCanWrite: true, isLocked: false, isSiteCompleted: false };

  it("kapı verilmezse eski kural: draft altı formen, approve kilidi açar", () => {
    expect(resolveAllocationAccess({ ...base, evLevel: "view" }).isForeman).toBe(true);
    expect(resolveAllocationAccess({ ...base, evLevel: "approve" }).canUnlock).toBe(true);
    expect(resolveAllocationAccess({ ...base, evLevel: "draft" }).canUnlock).toBe(false);
  });

  it("Gün Kilidi Aç kapısı seviyeyi ezer", () => {
    expect(resolveAllocationAccess({ ...base, evLevel: "draft", canUnlockDay: true }).canUnlock).toBe(true);
    expect(resolveAllocationAccess({ ...base, evLevel: "admin", canUnlockDay: false }).canUnlock).toBe(false);
  });

  it("dağıtım yazma kapısı formen kararını belirler", () => {
    expect(resolveAllocationAccess({ ...base, evLevel: "admin", canWriteAllocation: false }).isForeman).toBe(true);
    expect(resolveAllocationAccess({ ...base, evLevel: "view", canWriteAllocation: true }).isForeman).toBe(false);
  });

  it("tamamlanmış şantiyede kilit açılmaz", () => {
    expect(
      resolveAllocationAccess({ ...base, evLevel: "approve", canUnlockDay: true, isSiteCompleted: true }).canUnlock,
    ).toBe(false);
  });
});

describe("approveGate · Günü Onayla kapısı", () => {
  const input = { level: "view" as const, siteCompleted: false, status: "draft" as const, draftDiaryDates: [] };

  it("kapı verilmezse seviye approve gerekir", () => {
    expect(approveGate({ ...input, level: "approve" }).visible).toBe(true);
    expect(approveGate({ ...input, level: "full" }).visible).toBe(true);
    expect(approveGate({ ...input, level: "draft" }).visible).toBe(false);
  });

  it("Onaylar bayrağı (canApprove) seviyeyi ezer", () => {
    expect(approveGate({ ...input, level: "draft", canApprove: true }).visible).toBe(true);
    expect(approveGate({ ...input, level: "admin", canApprove: false }).visible).toBe(false);
  });
});
