import { describe, it, expect } from "vitest";

import { BackendError } from "@/lib/api/unwrap";

import { classifyDiarySaveError } from "./save-error";

// GKS-F1.2a · POST/PATCH hata sınıfı: kilit 409 ≠ tarih çakışması 409 (Ü10).
// Sınıf `locked_days`e göre; metne BAKILMAZ.

describe("classifyDiarySaveError", () => {
  it("409 + geçerli locked_days → locked", () => {
    const error = new BackendError(409, {
      detail: "Bu gün raporla kilitlendi",
      locked_days: ["2026-09-24"],
      day_locks: [{ day: "2026-09-24", report_date: "2026-09-25" }],
    });

    expect(classifyDiarySaveError(error)).toBe("locked");
  });

  it("409 + locked_days YOK → date_conflict (metne bakılmaz)", () => {
    expect(classifyDiarySaveError(new BackendError(409, { detail: "Bu güne ait günlük kayıt zaten var" }))).toBe(
      "date_conflict",
    );
    expect(classifyDiarySaveError(new BackendError(409, { detail: "kilitlendi" }))).toBe("date_conflict");
    expect(classifyDiarySaveError(new BackendError(409, undefined))).toBe("date_conflict");
  });

  it("409 + bozuk locked_days (boş / geçersiz gün) → kilit SAYILMAZ, date_conflict", () => {
    expect(classifyDiarySaveError(new BackendError(409, { detail: "x", locked_days: [] }))).toBe("date_conflict");
    expect(classifyDiarySaveError(new BackendError(409, { detail: "x", locked_days: ["2026-02-30"] }))).toBe(
      "date_conflict",
    );
    expect(classifyDiarySaveError(new BackendError(409, { detail: "x", locked_days: "2026-09-24" }))).toBe(
      "date_conflict",
    );
  });

  it("409 DIŞI hatalar (locked_days taşısa bile) → other", () => {
    expect(classifyDiarySaveError(new BackendError(422, { detail: "x", locked_days: ["2026-09-24"] }))).toBe("other");
    expect(classifyDiarySaveError(new BackendError(403, { detail: "izin yok" }))).toBe("other");
    expect(classifyDiarySaveError(new BackendError(404, undefined))).toBe("other");
  });

  it("BackendError olmayan hata → other", () => {
    expect(classifyDiarySaveError(new Error("ağ koptu"))).toBe("other");
    expect(classifyDiarySaveError("x")).toBe("other");
    expect(classifyDiarySaveError(null)).toBe("other");
  });
});
