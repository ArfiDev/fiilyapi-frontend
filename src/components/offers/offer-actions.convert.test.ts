import { describe, expect, it } from "vitest";

import { offerConvertGate, type OfferConvertInput } from "./offer-actions";
import type { OfferStatus } from "./offer-types";

/**
 * TKL-F5.5 · "Projeye Dönüştür" ekseni (plan §4, §6, ÜS-F5-2/3): görünür yalnız son revizyon `won` ∧
 * `conversion_state = won_not_converted`; etkin yalnız `canConvert` (teklif_hazirlama Onaylar ∧ kısıtsız).
 */

const STATUSES: readonly OfferStatus[] = ["draft", "sent", "won", "lost", "withdrawn"];
const STATES: ReadonlyArray<OfferConvertInput["conversionState"]> = ["won_not_converted", "converted", null, undefined];

const ALLOWED: OfferConvertInput = { status: "won", conversionState: "won_not_converted", canConvert: true, isLatest: true };

describe("offerConvertGate · görünürlük matrisi (durum × dönüştürme durumu)", () => {
  for (const status of STATUSES) {
    for (const conversionState of STATES) {
      const shouldShow = status === "won" && conversionState === "won_not_converted";
      it(`${status} × ${String(conversionState)} → ${shouldShow ? "görünür + etkin" : "gizli"}`, () => {
        const verdict = offerConvertGate({ ...ALLOWED, status, conversionState });
        expect(verdict.visible).toBe(shouldShow);
        if (shouldShow) expect(verdict).toEqual({ visible: true, enabled: true });
      });
    }
  }
});

describe("offerConvertGate · yetki (SO-42)", () => {
  it("canConvert=false → GEREKÇELİ PASİF (Onaylar metni)", () => {
    expect(offerConvertGate({ ...ALLOWED, canConvert: false })).toEqual({
      visible: true,
      enabled: false,
      reason: "Projeye dönüştürme için Teklif Hazırlama sayfasında Onaylar yetkisi gerekir",
    });
  });

  it("yetkisiz DURUMLARDA (converted/not won) düğme yine GİZLİ", () => {
    expect(offerConvertGate({ ...ALLOWED, canConvert: false, conversionState: "converted" })).toEqual({ visible: false });
    expect(offerConvertGate({ ...ALLOWED, canConvert: false, status: "sent" })).toEqual({ visible: false });
  });
});

describe("offerConvertGate · eski revizyon (T41)", () => {
  it("won × won_not_converted × yetkili ama isLatest=false → GİZLİ (pasif değil)", () => {
    expect(offerConvertGate({ ...ALLOWED, isLatest: false })).toEqual({ visible: false });
  });

  it("yetkisiz kombinasyonda (canConvert=false) isLatest=false → yine GİZLİ, gerekçeli pasif DEĞİL", () => {
    expect(offerConvertGate({ ...ALLOWED, canConvert: false, isLatest: false })).toEqual({ visible: false });
  });
});
