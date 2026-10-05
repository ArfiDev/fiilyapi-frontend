import { describe, expect, it } from "vitest";

import { formatTemplateRates, ratesDiffer } from "@/components/offer-templates/template-rates";
import { previewText, type CreateFormState } from "@/components/offer-templates/template-create-form";

import { BOTH_RATES_MASKED, buildOfferCreateBody, initialOfferFormValues, maskedRatesOfSettings, validateOfferForm } from "./offer-form";

/** IZN-F4.3 · `OfferSettingsRead.default_overhead_pct/default_profit_pct` `maliyet_kar` gizli rolde null döner. */
const MASKED_SETTINGS = {
  default_overhead_pct: null,
  default_profit_pct: null,
  default_vat_pct: "20.00",
  default_validity_days: 30,
} as never;

describe("IZN-F4.3 · ayar varsayılan oranı null → '—' (sıfır/uydurma yok)", () => {
  it("şablon oran özeti: boş oran + maskeli ayar → '—'", () => {
    const defaults = { default_overhead_pct: null, default_profit_pct: null };
    expect(formatTemplateRates(null, null, defaults)).toBe("GG — · K —");
    expect(formatTemplateRates("10", null, defaults)).toBe("GG %10 · K —");
  });

  it("şablon oran özeti: ayar dolu davranışı AYNI", () => {
    expect(formatTemplateRates(null, null, { default_overhead_pct: "12.00", default_profit_pct: "15.00" })).toBe(
      "GG %12 (ayar) · K %15 (ayar)",
    );
  });

  it("şablon oluştur önizlemesi: boş oran '—' (sahte '%' basılmaz)", () => {
    const state = { source: "blank", groupIds: [], overhead: null, profit: null } as unknown as CreateFormState;
    const text = previewText(state, { offers: [], templates: [], disciplines: [] }, { overhead: "", profit: "" });
    expect(text).toContain("GG — · Kâr —");
  });

  it("yeni teklif: maskeli ayar → başlangıç değeri boş, oranlar maskeli sayılır, doğrulanmaz ve gövdeye girmez", () => {
    const initial = initialOfferFormValues(MASKED_SETTINGS, "2026-10-05");
    expect(initial.overheadPct).toBe("");
    expect(initial.profitPct).toBe("");
    const masked = maskedRatesOfSettings(MASKED_SETTINGS);
    expect([...masked].sort()).toEqual([...BOTH_RATES_MASKED].sort());
    const values = { ...initial, employerId: "e1", title: "T" };
    expect(validateOfferForm(values, masked)).toEqual({});
    const body = buildOfferCreateBody(values, { kind: "blank" }, masked);
    expect(body).not.toHaveProperty("overhead_pct");
    expect(body).not.toHaveProperty("profit_pct");
  });

  it("dolu ayar: maske YOK", () => {
    expect(maskedRatesOfSettings({ default_overhead_pct: "12.00", default_profit_pct: "15.00" }).size).toBe(0);
  });

  it("şablon PATCH: dokunulmayan maskeli (null) oran değişmiş sayılmaz → gövdeye girmez", () => {
    expect(ratesDiffer(null, null)).toBe(false);
  });
});
