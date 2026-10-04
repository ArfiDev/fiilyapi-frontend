import { describe, expect, it } from "vitest";

import { offerConvertGate } from "./offer-actions";

// IZN-F2.x — Dönüştür kapısı: `canConvert` (teklif.teklif_hazirlama Onaylar) verilirse `canWrite` + `canAdminProjects`
// kapılarının YERİNE geçer; verilmezse bugünkü kural aynen sürer.

const BASE = {
  status: "won" as const,
  conversionState: "won_not_converted" as const,
  canWrite: true,
  canAdminProjects: true,
  isLatest: true,
};

describe("offerConvertGate · canConvert", () => {
  it("canConvert verilmezse eski kural: yazamayan → readOnlyUser, admin değil → projects admin gerekçesi", () => {
    expect(offerConvertGate(BASE)).toEqual({ visible: true, enabled: true });
    const noWrite = offerConvertGate({ ...BASE, canWrite: false });
    expect(noWrite).toMatchObject({ visible: true, enabled: false });
    const noAdmin = offerConvertGate({ ...BASE, canAdminProjects: false });
    expect(noAdmin).toMatchObject({ visible: true, enabled: false });
  });

  it("canConvert true → yazma izni olmasa bile etkin (Onaylar kapısı tek başına yeter)", () => {
    expect(offerConvertGate({ ...BASE, canWrite: false, canAdminProjects: false, canConvert: true })).toEqual({
      visible: true,
      enabled: true,
    });
  });

  it("canConvert false → yazma + projects admin olsa bile pasif ve gerekçe Onaylar'dır", () => {
    const verdict = offerConvertGate({ ...BASE, canConvert: false });
    expect(verdict).toMatchObject({ visible: true, enabled: false });
    expect("reason" in verdict && verdict.reason).toMatch(/Onaylar/);
  });

  it("eksen kuralları korunur: eski revizyonda ya da kazanılmamışta gizli", () => {
    expect(offerConvertGate({ ...BASE, canConvert: true, isLatest: false })).toEqual({ visible: false });
    expect(offerConvertGate({ ...BASE, canConvert: true, status: "draft" })).toEqual({ visible: false });
  });
});
