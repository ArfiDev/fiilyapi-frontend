import { describe, it, expect } from "vitest";

import { BackendError } from "@/lib/api/unwrap";
import {
  DELETE_FORBIDDEN_MESSAGE,
  DELETE_STALE_MESSAGE,
  classifyDeleteError,
} from "./delete-error";

describe("classifyDeleteError", () => {
  it("409 + code preview_stale → preview_stale", () => {
    const err = new BackendError(409, { code: "preview_stale", detail: "Silinecek kayıtlar değişti" });
    expect(classifyDeleteError(err)).toEqual({ reason: "preview_stale", message: DELETE_STALE_MESSAGE });
  });

  it("428 + code preview_required → preview_required", () => {
    const err = new BackendError(428, { code: "preview_required", detail: "x" });
    expect(classifyDeleteError(err).reason).toBe("preview_required");
  });

  it("409 + code financial_pending (şemada olmayan kod) → detail mesajı", () => {
    const err = new BackendError(409, { code: "financial_pending", detail: "Bekleyen hakediş var" });
    expect(classifyDeleteError(err)).toEqual({ reason: "financial_pending", message: "Bekleyen hakediş var" });
  });

  it("409 + code null → conflict, detail mesajı", () => {
    const err = new BackendError(409, { code: null, detail: "Veri bütünlüğü hatası" });
    expect(classifyDeleteError(err)).toEqual({ reason: "conflict", message: "Veri bütünlüğü hatası" });
  });

  it("403 → yalnız Sistem Yöneticisi mesajı", () => {
    expect(classifyDeleteError(new BackendError(403, undefined))).toEqual({
      reason: "forbidden",
      message: DELETE_FORBIDDEN_MESSAGE,
    });
  });

  it("BackendError olmayan hata → unknown", () => {
    expect(classifyDeleteError(new Error("ağ")).reason).toBe("unknown");
  });
});
