import { describe, expect, it } from "vitest";

import {
  conditionsFromRevision,
  conditionsFromSettings,
  conditionsFromTemplate,
  formatCompactNet,
  kunyeFromOffer,
  pendingStartLabel,
  pickTemplate,
  startSummaryLabel,
} from "./offer-start";
import type { OfferFormValues } from "./offer-form";

const SETTINGS = {
  default_overhead_pct: "12.00",
  default_profit_pct: "15.00",
  default_vat_pct: "20.00",
  default_validity_days: 30,
  default_payment_terms: "Ödeme koşulu",
  updated_at: "2026-10-01T09:00:00Z",
};

const VALUES: OfferFormValues = {
  employerId: "emp-1",
  title: "İş",
  scopeSummary: "Kapsam",
  offerDate: "2026-10-02",
  validityDays: "30",
  overheadPct: "12",
  profitPct: "15",
  vatPct: "20",
};

function template(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Şablon ${id}`,
    description: null,
    overhead_pct: null,
    profit_pct: null,
    is_default: false,
    group_count: 2,
    item_count: 10,
    usage_count: 0,
    updated_at: "2026-10-01T09:00:00Z",
    ...overrides,
  } as never;
}

describe("pickTemplate (önseçim)", () => {
  const list = [template("a"), template("b", { is_default: true }), template("c")];

  it("istenen kimlik listedeyse o", () => {
    expect(pickTemplate(list, "c")?.id).toBe("c");
  });
  it("istenen yoksa/silinmişse VARSAYILAN şablon", () => {
    expect(pickTemplate(list, "yok")?.id).toBe("b");
    expect(pickTemplate(list, null)?.id).toBe("b");
  });
  it("varsayılan yoksa listenin ilki; liste boşsa null", () => {
    expect(pickTemplate([template("a"), template("c")], null)?.id).toBe("a");
    expect(pickTemplate([], "a")).toBeNull();
  });
});

describe("oran doldurma", () => {
  it("şablon oranı ayarı ezer; şablonda boş oran AYARDAN gelir (şablon ?? ayar)", () => {
    const filled = conditionsFromTemplate(
      VALUES,
      template("a", { overhead_pct: "9.50", profit_pct: null }),
      SETTINGS,
    );
    expect(filled).toMatchObject({ overheadPct: "9,5", profitPct: "15", vatPct: "20", validityDays: "30" });
  });
  it("şablon doldurması künyeye (işveren, iş adı, kapsam) DOKUNMAZ", () => {
    const filled = conditionsFromTemplate(VALUES, template("a", { overhead_pct: "9.00" }), SETTINGS);
    expect(filled).toMatchObject({ employerId: "emp-1", title: "İş", scopeSummary: "Kapsam", offerDate: "2026-10-02" });
  });
  it("kaynak revizyon geçerlilik + GG + kâr + KDV'yi doldurur", () => {
    const filled = conditionsFromRevision(VALUES, {
      validity_days: 45,
      overhead_pct: "8.00",
      profit_pct: "11.25",
      vat_pct: "10.00",
    } as never);
    expect(filled).toMatchObject({ validityDays: "45", overheadPct: "8", profitPct: "11,25", vatPct: "10" });
  });
  it("ayara dönüş: geçerlilik + GG + kâr + KDV ayarda, künye korunur", () => {
    const filled = conditionsFromSettings({ ...VALUES, overheadPct: "1", validityDays: "5" }, SETTINGS);
    expect(filled).toMatchObject({ overheadPct: "12", profitPct: "15", vatPct: "20", validityDays: "30", title: "İş" });
  });
  it("girdi DEĞİŞTİRİLMEZ (immutable)", () => {
    const snapshot = JSON.stringify(VALUES);
    conditionsFromTemplate(VALUES, template("a", { overhead_pct: "9.00" }), SETTINGS);
    expect(JSON.stringify(VALUES)).toBe(snapshot);
  });
});

describe("özet etiketi (TY startLbl)", () => {
  it("boş / şablon / kopya", () => {
    expect(startSummaryLabel({ kind: "blank" }, null)).toBe("Boş teklif");
    expect(startSummaryLabel({ kind: "template", templateId: "a" }, "Konut · kaba inşaat")).toBe("Şablon · Konut · kaba inşaat");
    expect(startSummaryLabel({ kind: "copy", offerId: "o", revNo: 3 }, "TKL-2026-0011")).toBe("Kopya · TKL-2026-0011 Rev.3");
  });
});

describe("formatCompactNet", () => {
  it("milyon: '₺48,8 M'; maskeli: '—'", () => {
    expect(formatCompactNet("48750000.00")).toBe("₺48,8 M");
    expect(formatCompactNet("31420500.00")).toBe("₺31,4 M");
    expect(formatCompactNet(null)).toBe("—");
  });
  it("milyonun altında tam tutar (kuruşlu)", () => {
    expect(formatCompactNet("850000.00")).toBe("₺850.000,00");
  });
});

describe("kopya künyesi ve bekleyen etiket", () => {
  it("işveren + iş adı + kapsam satırdan; kapsam null → boş metin; koşullara DOKUNMAZ", () => {
    const filled = kunyeFromOffer(VALUES, { employer_id: "emp-2", title: "Yeni iş", scope_summary: null });
    expect(filled).toMatchObject({ employerId: "emp-2", title: "Yeni iş", scopeSummary: "", overheadPct: "12", validityDays: "30" });
  });
  it("seçim yokken etiket", () => {
    expect(pendingStartLabel("template")).toBe("Şablon · —");
    expect(pendingStartLabel("copy")).toBe("Kopya · —");
  });
});
