// @vitest-environment node
import { describe, it, expect } from "vitest";
import { collectScaleSuspectFields, resolveEnumValues, schemaKey } from "./openapi-scale-fields";
import { SCALE_TABLE } from "@/lib/api/scale-table";

describe("openapi-scale-fields · resolveEnumValues", () => {
  it("KpiPf.pf_cum_band → PfBand enum üyeleri (anyOf[$ref, null] çözülür)", () => {
    expect(resolveEnumValues("KpiPf", "pf_cum_band")).toEqual(["red", "amber", "green", "high"]);
  });

  it("SCALE_TABLE'daki TÜM enum satırları için bir enum listesi çözülür (boş değil)", () => {
    const enumRows = SCALE_TABLE.filter((r) => r.scale === "enum");
    expect(enumRows.length).toBeGreaterThan(0);
    for (const row of enumRows) {
      const values = resolveEnumValues(row.schema, row.field);
      expect(values, `${schemaKey(row.schema, row.field)} enum'a çözülemedi`).not.toBeNull();
      expect(values!.length).toBeGreaterThan(0);
    }
  });

  it("var olmayan alan için null döner", () => {
    expect(resolveEnumValues("KpiPf", "hic_yok")).toBeNull();
  });

  it("enum olmayan bir alan (percent) için null döner", () => {
    const percentRow = SCALE_TABLE.find((r) => r.scale === "percent");
    expect(percentRow).toBeDefined();
    expect(resolveEnumValues(percentRow!.schema, percentRow!.field)).toBeNull();
  });
});

describe("openapi-scale-fields · collectScaleSuspectFields (regresyon)", () => {
  it("238 satırla birebir aynı kümeyi üretir", () => {
    const openApiKeys = new Set(collectScaleSuspectFields().map((r) => schemaKey(r.schema, r.field)));
    expect(openApiKeys.size).toBe(238);
  });
});
