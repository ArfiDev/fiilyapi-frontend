import { describe, expect, it } from "vitest";

import { OFFER_ACTION_REASONS, offerConvertGate } from "./offer-actions";

// IZN-F6b — Dönüştür kapısı: `canConvert` (teklif.teklif_hazirlama Onaylar ∧ disiplin kısıtsız) ZORUNLUDUR ve TEK karardır;
// `projects:admin` / yazma izni aranmaz (backend POST /offers/{id}/convert = teklif_hazirlama Onaylar).

const BASE = {
  status: "won" as const,
  conversionState: "won_not_converted" as const,
  canConvert: true,
  isLatest: true,
};

describe("offerConvertGate · canConvert", () => {
  it("canConvert true → görünür + etkin", () => {
    expect(offerConvertGate(BASE)).toEqual({ visible: true, enabled: true });
  });

  it("canConvert false → pasif ve gerekçe Onaylar'dır", () => {
    expect(offerConvertGate({ ...BASE, canConvert: false })).toEqual({
      visible: true,
      enabled: false,
      reason: OFFER_ACTION_REASONS.convertNeedsApprove,
    });
    expect(OFFER_ACTION_REASONS.convertNeedsApprove).toMatch(/Onaylar/);
  });

  it("eksen kuralları korunur: eski revizyonda ya da kazanılmamışta gizli", () => {
    expect(offerConvertGate({ ...BASE, isLatest: false })).toEqual({ visible: false });
    expect(offerConvertGate({ ...BASE, status: "draft" })).toEqual({ visible: false });
    expect(offerConvertGate({ ...BASE, canConvert: false, isLatest: false })).toEqual({ visible: false });
  });
});
