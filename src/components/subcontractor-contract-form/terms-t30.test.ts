import { describe, it, expect } from "vitest";

import { REF_PRICE_AMBIGUOUS_DOT } from "@/lib/tr-decimal";
import type { SubcontractorContractDetail } from "@/lib/api/hooks/useSubcontractorProgressPayments";

import { buildContractCreateBody, buildContractTermsUpdateBody } from "./build-body";
import { contractTermsFromDetail, emptySubcontractorContractFormValues } from "./form-state";
import { MESSAGES, validateContractForm, validateContractTerms } from "./validate";

/** TKL-F7a · T42 — Sözleşme Şartları: Gecikme Cezası (para), Avans %, Teminat % Türkçe (T30). */
function values(overrides: Partial<ReturnType<typeof emptySubcontractorContractFormValues>>) {
  return { ...emptySubcontractorContractFormValues(), projectId: "p-1", ...overrides };
}

describe("Şartlar — gövde (T30)", () => {
  it("'1.234,5' → gecikme \"1234.50\", avans \"12.5\", teminat \"7.5\"", () => {
    const body = buildContractCreateBody(
      values({ latePenaltyDaily: "1.234,5", advancePct: "12,5", retainagePct: "7,5" }),
      { isDraft: true },
    );
    expect(body.late_penalty_daily).toBe("1234.50");
    expect(body.advance_pct).toBe("12.5");
    expect(body.retainage_pct).toBe("7.5");
  });

  it("'3,5' gecikme → \"3.50\"; boş gecikme → null; boş oran → şema varsayılanı", () => {
    expect(buildContractCreateBody(values({ latePenaltyDaily: "3,5" }), { isDraft: true }).late_penalty_daily).toBe("3.50");
    const empty = buildContractCreateBody(values({ latePenaltyDaily: "", advancePct: "", retainagePct: "" }), { isDraft: true });
    expect(empty.late_penalty_daily).toBeNull();
    expect(empty.advance_pct).toBe("10");
    expect(empty.retainage_pct).toBe("5");
  });

  it("TSD PATCH gövdesi de aynı okumayı kullanır", () => {
    const body = buildContractTermsUpdateBody(
      values({ latePenaltyDaily: "1.234,5", advancePct: "12,5", retainagePct: "7,5" }),
    );
    expect(body.late_penalty_daily).toBe("1234.50");
    expect(body.advance_pct).toBe("12.5");
    expect(body.retainage_pct).toBe("7.5");
  });
});

describe("Şartlar — doğrulama (T30)", () => {
  it("'0.500' / '28.5' / '1.50' → REF_PRICE_AMBIGUOUS_DOT (üç alan)", () => {
    for (const raw of ["0.500", "28.5", "1.50"]) {
      const errors = validateContractForm(
        values({ latePenaltyDaily: raw, advancePct: raw, retainagePct: raw }),
        { isDraft: true },
      );
      expect(errors.latePenaltyDaily).toBe(REF_PRICE_AMBIGUOUS_DOT);
      expect(errors.advancePct).toBe(REF_PRICE_AMBIGUOUS_DOT);
      expect(errors.retainagePct).toBe(REF_PRICE_AMBIGUOUS_DOT);
    }
    expect(validateContractTerms(values({ advancePct: "0.500" })).advancePct).toBe(REF_PRICE_AMBIGUOUS_DOT);
  });

  it("geçerli Türkçe girdi hata üretmez; mevcut aralık/negatif kuralları korunur", () => {
    const ok = validateContractForm(
      values({ latePenaltyDaily: "1.234,5", advancePct: "12,5", retainagePct: "100" }),
      { isDraft: true },
    );
    expect(ok.latePenaltyDaily).toBeUndefined();
    expect(ok.advancePct).toBeUndefined();
    expect(ok.retainagePct).toBeUndefined();
    const bad = validateContractForm(
      values({ latePenaltyDaily: "-1", advancePct: "100,5", retainagePct: "-1" }),
      { isDraft: true },
    );
    expect(bad.latePenaltyDaily).toBe(MESSAGES.latePenaltyInvalid);
    expect(bad.advancePct).toBe(MESSAGES.pctRange);
    expect(bad.retainagePct).toBe(MESSAGES.pctRange);
  });
});

describe("Şartlar — sunucu değeri gösterimi (T30)", () => {
  const detail = {
    contract_no: null,
    signature_date: null,
    is_notarized: false,
    start_date: null,
    end_date: null,
    late_penalty_daily: "5000.00",
    advance_pct: "12.50",
    retainage_pct: "5.00",
    payment_period: "monthly",
    payment_term_days: 30,
    materials_by_contractor: false,
    subcontractor_files_own_sgk: false,
    vat_withholding: false,
  } as unknown as SubcontractorContractDetail;

  it("'5000.00' → '5.000,00', '12.50' → '12,5', '5.00' → '5'", () => {
    const terms = contractTermsFromDetail(detail);
    expect(terms.latePenaltyDaily).toBe("5.000,00");
    expect(terms.advancePct).toBe("12,5");
    expect(terms.retainagePct).toBe("5");
  });

  it("dokunulmadan geri okununca doğrulama geçer ve değer kayıpsızdır", () => {
    const terms = contractTermsFromDetail(detail);
    expect(Object.keys(validateContractTerms(terms))).toHaveLength(0);
    const body = buildContractTermsUpdateBody(terms);
    expect(body.late_penalty_daily).toBe("5000.00");
    expect(body.advance_pct).toBe("12.5");
  });

  it("boş gecikme cezası boş kalır", () => {
    expect(contractTermsFromDetail({ ...detail, late_penalty_daily: null }).latePenaltyDaily).toBe("");
  });
});
