import { describe, expect, it } from "vitest";

import {
  OFFER_FORM_MESSAGES,
  buildOfferCreateBody,
  initialOfferFormValues,
  missingFieldsText,
  pctToInputText,
  validUntilIso,
  validateOfferForm,
  type OfferFormValues,
} from "./offer-form";

const SETTINGS = {
  default_overhead_pct: "12.00",
  default_profit_pct: "15.00",
  default_vat_pct: "20.00",
  default_validity_days: 30,
  default_payment_terms: "Ödeme aylık hakedişle, 30 gün vadeli",
  updated_at: "2026-10-01T09:00:00Z",
};

function valid(overrides: Partial<OfferFormValues> = {}): OfferFormValues {
  return {
    employerId: "emp-1",
    title: "Ataköy Rezidans C Blok",
    scopeSummary: "",
    offerDate: "2026-10-02",
    validityDays: "30",
    overheadPct: "12",
    profitPct: "15",
    vatPct: "20",
    ...overrides,
  };
}

describe("ön değerler AYARDAN gelir (sabit yazılmaz)", () => {
  it("ayar 10/18/8/45 ise form 10/18/8/45 ile açılır; tarih = verilen bugün", () => {
    const values = initialOfferFormValues(
      {
        ...SETTINGS,
        default_overhead_pct: "10.00",
        default_profit_pct: "18.00",
        default_vat_pct: "8.00",
        default_validity_days: 45,
      },
      "2026-10-02",
    );
    expect(values).toMatchObject({
      overheadPct: "10",
      profitPct: "18",
      vatPct: "8",
      validityDays: "45",
      offerDate: "2026-10-02",
      employerId: "",
      title: "",
    });
  });

  it("kesirli ayar Türkçe virgülle gösterilir: 12.50 → '12,5'", () => {
    expect(pctToInputText("12.50")).toBe("12,5");
    expect(pctToInputText("12.00")).toBe("12");
    expect(pctToInputText("0.00")).toBe("0");
    expect(pctToInputText("999.99")).toBe("999,99");
  });
});

describe("bitiş = teklif tarihi + gün", () => {
  it("30 gün: 2026-10-02 → 2026-11-01; ay/yıl taşar", () => {
    expect(validUntilIso("2026-10-02", "30")).toBe("2026-11-01");
    expect(validUntilIso("2026-12-20", "30")).toBe("2027-01-19");
  });
  it("tarih boş / gün geçersiz → null", () => {
    expect(validUntilIso("", "30")).toBeNull();
    expect(validUntilIso("2026-10-02", "")).toBeNull();
    expect(validUntilIso("2026-10-02", "0")).toBeNull();
    expect(validUntilIso("2026-10-02", "366")).toBeNull();
  });
});

describe("doğrulama", () => {
  it("geçerli form hatasızdır", () => {
    expect(validateOfferForm(valid())).toEqual({});
  });

  it("işveren ve iş adı zorunlu (TY metinleri)", () => {
    const errors = validateOfferForm(valid({ employerId: "", title: "   " }));
    expect(errors.employerId).toBe("İşveren zorunlu");
    expect(errors.title).toBe("İş adı zorunlu");
  });

  it("geçerlilik 0 ve 366 reddedilir; 1 ve 365 kabul", () => {
    expect(validateOfferForm(valid({ validityDays: "0" })).validityDays).toBe(OFFER_FORM_MESSAGES.validityRange);
    expect(validateOfferForm(valid({ validityDays: "366" })).validityDays).toBe(OFFER_FORM_MESSAGES.validityRange);
    expect(validateOfferForm(valid({ validityDays: "" })).validityDays).toBe(OFFER_FORM_MESSAGES.validityRange);
    expect(validateOfferForm(valid({ validityDays: "1" })).validityDays).toBeUndefined();
    expect(validateOfferForm(valid({ validityDays: "365" })).validityDays).toBeUndefined();
  });

  it("yüzde: belirsiz nokta ('12.5') reddedilir, metin T30'daki gibi", () => {
    expect(validateOfferForm(valid({ overheadPct: "12.5" })).overheadPct).toBe(
      "Ondalık için virgül kullanın (ör. 28,50)",
    );
  });

  it("yüzde: virgüllü '12,5' kabul; 3 kesir hanesi, harf ve boş reddedilir", () => {
    expect(validateOfferForm(valid({ overheadPct: "12,5" })).overheadPct).toBeUndefined();
    expect(validateOfferForm(valid({ overheadPct: "12,555" })).overheadPct).toBe(OFFER_FORM_MESSAGES.pctFraction);
    expect(validateOfferForm(valid({ overheadPct: "abc" })).overheadPct).toBe(OFFER_FORM_MESSAGES.pctInvalid);
    expect(validateOfferForm(valid({ overheadPct: "" })).overheadPct).toBe(OFFER_FORM_MESSAGES.pctInvalid);
  });

  it("yüzde aralığı: GG/KDV 0–100; Kâr 0–999,99", () => {
    expect(validateOfferForm(valid({ overheadPct: "100" })).overheadPct).toBeUndefined();
    expect(validateOfferForm(valid({ overheadPct: "100,01" })).overheadPct).toBe(OFFER_FORM_MESSAGES.pctRange100);
    expect(validateOfferForm(valid({ vatPct: "101" })).vatPct).toBe(OFFER_FORM_MESSAGES.pctRange100);
    expect(validateOfferForm(valid({ profitPct: "999,99" })).profitPct).toBeUndefined();
    expect(validateOfferForm(valid({ profitPct: "1000" })).profitPct).toBe(OFFER_FORM_MESSAGES.pctRangeProfit);
  });

  it("'N alan eksik.' metni", () => {
    expect(missingFieldsText(2)).toBe("2 alan eksik.");
    expect(missingFieldsText(1)).toBe("1 alan eksik.");
  });
});

describe("POST /offers gövdesi", () => {
  it("payment_terms GÖNDERİLMEZ (sunucu ayardan kopyalar); price_escalation AÇIKÇA 'fixed' (K-F3-5)", () => {
    const body = buildOfferCreateBody(valid());
    expect(body).not.toHaveProperty("payment_terms");
    expect(body.price_escalation).toBe("fixed");
  });

  it("yüzdeler METİN ('12,5' → '12.5'), geçerlilik tam sayı, alanlar kırpılır", () => {
    const body = buildOfferCreateBody(valid({ overheadPct: "12,5", profitPct: "250,5", title: "  İş  " }));
    expect(body).toMatchObject({
      employer_id: "emp-1",
      title: "İş",
      offer_date: "2026-10-02",
      validity_days: 30,
      overhead_pct: "12.5",
      profit_pct: "250.5",
      vat_pct: "20",
    });
    expect(typeof body.overhead_pct).toBe("string");
  });

  it("kapsam özeti boşsa gövdeye girmez, doluysa kırpılarak girer", () => {
    expect(buildOfferCreateBody(valid({ scopeSummary: "  " }))).not.toHaveProperty("scope_summary");
    expect(buildOfferCreateBody(valid({ scopeSummary: " Kaba inşaat " })).scope_summary).toBe("Kaba inşaat");
  });

  it("teklif tarihi boşsa offer_date gönderilmez (sunucu bugünü yazar)", () => {
    expect(buildOfferCreateBody(valid({ offerDate: "" }))).not.toHaveProperty("offer_date");
  });
});
