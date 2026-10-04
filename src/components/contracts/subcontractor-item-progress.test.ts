import { describe, it, expect } from "vitest";

import type { SubcontractorContractItemResponse } from "@/lib/api/hooks/useSubcontractorContractMutations";
import type { SubcontractorProgressPaymentLineRead } from "@/lib/api/hooks/useSubcontractorProgressPayments";

import {
  buildItemProgressPct,
  tsdProgressTone,
  TSD_PROGRESS_LOW_THRESHOLD,
} from "./subcontractor-item-progress";

function item(
  overrides: Partial<SubcontractorContractItemResponse> & { id: string },
): SubcontractorContractItemResponse {
  return {
    contract_id: "sc-1",
    source_contract_item_id: null,
    code: "03.001",
    source_code: null,
    description: "Poz",
    unit: "m³",
    quantity: "100.000",
    unit_price: "1200.00",
    sort_order: 0,
    group: null,
    line_total: "120000.00",
    ...overrides,
  };
}

function line(
  overrides: Partial<SubcontractorProgressPaymentLineRead> & { id: string },
): SubcontractorProgressPaymentLineRead {
  return {
    contract_item_id: null,
    code: "03.001",
    source_code: null,
    description: "Poz",
    unit: "m³",
    contract_unit_price: "1200.00",
    coefficient: "1.00",
    quantity: "0.000",
    group_name: null,
    sort_order: 0,
    quantity_source: "manual",
    adjusted_unit_price: "1200.00",
    line_total: "0.00",
    ...overrides,
  };
}

describe("buildItemProgressPct", () => {
  it("kümülatif hakediş miktarını sözleşme miktarına oranlar", () => {
    // Arrange
    const items = [item({ id: "sci-1", quantity: "100.000" })];
    const lines = [
      line({ id: "l-1", contract_item_id: "sci-1", quantity: "40.000" }),
      line({ id: "l-2", contract_item_id: "sci-1", quantity: "35.000" }),
    ];

    // Act
    const pct = buildItemProgressPct(items, lines);

    // Assert
    expect(pct.get("sci-1")).toBeCloseTo(75);
  });

  it("hiç hakedişi olmayan poz %0'dır (haritadan DÜŞMEZ)", () => {
    const pct = buildItemProgressPct([item({ id: "sci-1" })], []);
    expect(pct.get("sci-1")).toBe(0);
  });

  it("sözleşme kalemine bağlı OLMAYAN satır hiçbir poza yazılmaz", () => {
    const pct = buildItemProgressPct(
      [item({ id: "sci-1", quantity: "100.000" })],
      [line({ id: "l-1", contract_item_id: null, quantity: "50.000" })],
    );
    expect(pct.get("sci-1")).toBe(0);
  });

  it("sözleşme miktarı 0 olan poz HARİTAYA GİRMEZ — oran uydurulmaz", () => {
    const pct = buildItemProgressPct(
      [item({ id: "sci-1", quantity: "0.000" })],
      [line({ id: "l-1", contract_item_id: "sci-1", quantity: "5.000" })],
    );
    expect(pct.has("sci-1")).toBe(false);
  });
});

describe("tsdProgressTone", () => {
  it("mockup kanıtı: 48 kehribar, 55/60/75/80 mavidir (eşik 50)", () => {
    expect(tsdProgressTone(48)).toBe("low");
    expect(tsdProgressTone(55)).toBe("normal");
    expect(tsdProgressTone(60)).toBe("normal");
    expect(tsdProgressTone(75)).toBe("normal");
    // SZL'nin dört tonlu kuralında 80 MOR olurdu; TSD 157'de MAVİdir.
    expect(tsdProgressTone(80)).toBe("normal");
    expect(TSD_PROGRESS_LOW_THRESHOLD).toBe(50);
  });
});
