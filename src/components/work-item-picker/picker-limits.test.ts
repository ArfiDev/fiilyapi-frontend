// @vitest-environment node
//
// TKL-F2.3 · 200 tavanı sözleşmeden OKUNUR (form-limits.contract deseni): sabiti iki yerde
// tekrar yazan test hiçbir şeyi bekçilemez.
import { describe, expect, it } from "vitest";

import { spec } from "@/lib/api/form-limits.contract";

import { MAX_BULK_ITEMS } from "./picker-model";

interface ArraySchema {
  properties?: { items?: { maxItems?: number; minItems?: number } };
}

describe("toplu uç sınırı ↔ openapi", () => {
  it("MAX_BULK_ITEMS = EmployerContractItemsBulkCreate.items.maxItems (ve en az 1 kalem)", () => {
    const schema = spec().components.schemas["EmployerContractItemsBulkCreate"] as unknown as ArraySchema;
    expect(schema.properties?.items?.maxItems).toBeDefined();
    expect(MAX_BULK_ITEMS).toBe(schema.properties?.items?.maxItems);
    expect(schema.properties?.items?.minItems).toBe(1);
  });
});
