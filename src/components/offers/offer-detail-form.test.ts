import { describe, expect, it } from "vitest";

import {
  buildOfferPatchBodies,
  changedFormFields,
  detailFormValuesFromServer,
  validateDetailForm,
  type OfferDetailFormValues,
} from "./offer-detail-form";
import { makeDetail, makeRevision } from "./offer-detail-fixtures";

const DETAIL = makeDetail();
const REVISION = makeRevision({ rev_no: 2 });

function edited(patch: Partial<OfferDetailFormValues>): OfferDetailFormValues {
  return { ...detailFormValuesFromServer(DETAIL, REVISION), ...patch };
}
function bodies(patch: Partial<OfferDetailFormValues>, revision = REVISION) {
  const values = edited(patch);
  return buildOfferPatchBodies(values, changedFormFields(values, DETAIL, revision));
}

describe("Taslak Kaydet gövdeleri — YALNIZ değişen alan (§3.3)", () => {
  it("dokunulmamış form: iki gövde de null (HİÇ istek atılmaz)", () => {
    expect(bodies({})).toEqual({ offer: null, revision: null });
  });

  it("yalnız iş adı değişti → yalnız künye gövdesi {title}; koşul PATCH'i YOK", () => {
    expect(bodies({ title: "  Güneşkent Konut Kompleksi 2  " })).toEqual({
      offer: { title: "Güneşkent Konut Kompleksi 2" },
      revision: null,
    });
  });

  it("yalnız GG değişti → yalnız revizyon gövdesi {overhead_pct:'12.5'} METİN; künye PATCH'i YOK", () => {
    expect(bodies({ overheadPct: "12,5" })).toEqual({ offer: null, revision: { overhead_pct: "12.5" } });
  });

  it("'12,0' = sunucudaki 12.00 → değişmemiş sayılır", () => {
    expect(bodies({ overheadPct: "12,0" })).toEqual({ offer: null, revision: null });
  });

  it("boşaltılan nullable metinler açık null gönderir (kapsam özeti, notlar, ödeme, teslim)", () => {
    expect(bodies({ scopeSummary: "", notes: "", paymentTerms: "", deliveryDays: "" })).toEqual({
      offer: { scope_summary: null },
      revision: { notes: null, payment_terms: null, delivery_days: null },
    });
  });

  it("geçerlilik tam sayı, tarih ISO; ikisi birlikte değişirse ikisi de gider", () => {
    expect(bodies({ validityDays: "45", offerDate: "2026-10-01" }).revision).toEqual({
      validity_days: 45,
      offer_date: "2026-10-01",
    });
  });
});

describe("TÜİK ⇄ Sabit gövdesi (price_index_type sabitte NULL)", () => {
  const tuikRevision = makeRevision({ rev_no: 2, price_escalation: "tuik", price_index_type: "ufe" });

  it("Sabit → TÜİK(TÜFE): ikisi birlikte gider", () => {
    expect(bodies({ priceEscalation: "tuik", priceIndexType: "tufe" }).revision).toEqual({
      price_escalation: "tuik",
      price_index_type: "tufe",
    });
  });

  it("TÜİK → Sabit: price_escalation 'fixed' + price_index_type AÇIK null (aksi 422)", () => {
    const values = { ...detailFormValuesFromServer(DETAIL, tuikRevision), priceEscalation: "fixed" as const };
    const result = buildOfferPatchBodies(values, changedFormFields(values, DETAIL, tuikRevision));
    expect(result.revision).toEqual({ price_escalation: "fixed", price_index_type: null });
    expect(result.revision).toHaveProperty("price_index_type", null);
  });

  it("Sabitken seçili eski endeks türü gövdeye SIZMAZ", () => {
    const values = {
      ...detailFormValuesFromServer(DETAIL, tuikRevision),
      priceEscalation: "fixed" as const,
      priceIndexType: "tufe" as const,
    };
    expect(buildOfferPatchBodies(values, changedFormFields(values, DETAIL, tuikRevision)).revision).toEqual({
      price_escalation: "fixed",
      price_index_type: null,
    });
  });

  it("TÜİK'te yalnız endeks türü değişti → ikisi birlikte (tutarlı durum)", () => {
    const values = { ...detailFormValuesFromServer(DETAIL, tuikRevision), priceIndexType: "construction_cost" as const };
    expect(buildOfferPatchBodies(values, changedFormFields(values, DETAIL, tuikRevision)).revision).toEqual({
      price_escalation: "tuik",
      price_index_type: "construction_cost",
    });
  });
});

describe("doğrulama", () => {
  it("TÜİK seçili ama endeks türü boş → backend metniyle", () => {
    const errors = validateDetailForm(edited({ priceEscalation: "tuik", priceIndexType: "" }));
    expect(errors.priceIndexType).toBe("Fiyat farkı «TÜİK endeksli» iken endeks türü zorunludur");
  });

  it("temiz form hatasız; teslim süresi aralığı; zorunlu teklif tarihi; ortak künye kuralları", () => {
    expect(validateDetailForm(edited({}))).toEqual({});
    expect(validateDetailForm(edited({ deliveryDays: "40000" })).deliveryDays).toMatch(/0–36500/);
    expect(validateDetailForm(edited({ offerDate: "" })).offerDate).toBe("Teklif tarihi zorunlu");
    expect(validateDetailForm(edited({ title: "  " })).title).toBe("İş adı zorunlu");
    expect(validateDetailForm(edited({ validityDays: "366" })).validityDays).toMatch(/1–365/);
  });
});
