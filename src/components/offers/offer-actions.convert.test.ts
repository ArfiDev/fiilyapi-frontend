import { describe, expect, it } from "vitest";

import { OFFER_ACTION_REASONS, offerConvertGate, type OfferConvertInput } from "./offer-actions";
import type { OfferStatus } from "./offer-types";

/**
 * TKL-F5.5 · "Projeye Dönüştür" ekseni (plan §4, §6, ÜS-F5-2/3): görünür yalnız son revizyon `won` ∧
 * `conversion_state = won_not_converted`; etkin yalnız `projects ≥ admin` ∧ `contracts ≥ full` ∧ kısıtsız.
 */

const STATUSES: readonly OfferStatus[] = ["draft", "sent", "won", "lost", "withdrawn"];
const STATES: ReadonlyArray<OfferConvertInput["conversionState"]> = ["won_not_converted", "converted", null, undefined];

const ALLOWED: OfferConvertInput = { status: "won", conversionState: "won_not_converted", canWrite: true, canAdminProjects: true };

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
  it("contracts < full ya da kısıtlı (canWrite=false) → GEREKÇELİ PASİF (mevcut salt-okunur gerekçesi)", () => {
    expect(offerConvertGate({ ...ALLOWED, canWrite: false })).toEqual({
      visible: true,
      enabled: false,
      reason: OFFER_ACTION_REASONS.readOnlyUser,
    });
  });

  it("projects < admin → GEREKÇELİ PASİF (ÜS-F5-3 metni)", () => {
    expect(offerConvertGate({ ...ALLOWED, canAdminProjects: false })).toEqual({
      visible: true,
      enabled: false,
      reason: "Projeye dönüştürme Projeler yönetici yetkisi ister (bugün yalnız sistem yöneticisi)",
    });
  });

  it("ikisi de yok → contracts gerekçesi önce gelir; yetkisiz DURUMLARDA (converted/not won) düğme yine GİZLİ", () => {
    expect(offerConvertGate({ ...ALLOWED, canWrite: false, canAdminProjects: false })).toMatchObject({
      enabled: false,
      reason: OFFER_ACTION_REASONS.readOnlyUser,
    });
    expect(offerConvertGate({ ...ALLOWED, canWrite: false, conversionState: "converted" })).toEqual({ visible: false });
    expect(offerConvertGate({ ...ALLOWED, canAdminProjects: false, status: "sent" })).toEqual({ visible: false });
  });
});
