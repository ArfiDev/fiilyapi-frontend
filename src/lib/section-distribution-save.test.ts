import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

import {
  SECTION_DISTRIBUTION_MAX_CELLS,
  buildSectionDistributionSaveBody,
  sectionDistributionCellKey,
  sectionDistributionRejectionMessage,
  type SectionDistributionCellEdit,
} from "./section-distribution-save";

function mapOf(...values: string[]): Map<string, SectionDistributionCellEdit> {
  return new Map(
    values.map((value, index) => {
      const edit = { boqItemId: `item-${index}`, sectionId: "sec-1", value };
      return [sectionDistributionCellKey(edit.boqItemId, edit.sectionId), edit];
    }),
  );
}

describe("buildSectionDistributionSaveBody", () => {
  it("boş ya da boşluk hücre `quantity: null` olur ve ANAHTAR gövdede durur", () => {
    const { body, rejections } = buildSectionDistributionSaveBody(mapOf("", "   "));
    expect(rejections).toEqual([]);
    expect(body.allocations).toHaveLength(2);
    for (const cell of body.allocations) {
      expect("quantity" in cell).toBe(true);
      expect(cell.quantity).toBeNull();
    }
  });

  it("`0` ve `0,000` görünür ret (zero), null'a çevrilmez", () => {
    const { body, rejections } = buildSectionDistributionSaveBody(mapOf("0", "0,000"));
    expect(body.allocations).toEqual([]);
    expect(rejections.map((r) => r.reason)).toEqual(["zero", "zero"]);
  });

  it.each(["0.0004", "1e30", "123456789012", "1.2345"])("`%s` hane kuralıyla reddedilir", (raw) => {
    const { body, rejections } = buildSectionDistributionSaveBody(mapOf(raw));
    expect(body.allocations).toEqual([]);
    expect(rejections.map((r) => r.reason)).toEqual(["digits"]);
    expect(sectionDistributionRejectionMessage("digits")).toBe(
      "En çok 11 tam ve 3 ondalık hane girilebilir.",
    );
  });

  it("11 tam + 3 ondalık kabul edilir", () => {
    const { body, rejections } = buildSectionDistributionSaveBody(mapOf("12345678901.123"));
    expect(rejections).toEqual([]);
    expect(body.allocations[0].quantity).toBe("12345678901.123");
  });

  it("virgül noktaya çevrilir", () => {
    const { body } = buildSectionDistributionSaveBody(mapOf("1,5"));
    expect(body.allocations[0].quantity).toBe("1.5");
  });

  it("negatif / harf `invalid` olarak reddedilir", () => {
    const { rejections } = buildSectionDistributionSaveBody(mapOf("-5", "abc"));
    expect(rejections.map((r) => r.reason)).toEqual(["invalid", "invalid"]);
  });

  it("gövde dolu hücre başına boq_item_id + section_id taşır; yalnız verilen (kirli) hücreler girer", () => {
    const edits = mapOf("5");
    const { body } = buildSectionDistributionSaveBody(edits);
    expect(body.allocations).toEqual([{ boq_item_id: "item-0", section_id: "sec-1", quantity: "5" }]);
  });

  it("20.001 hücre reddedilir (gövde kurulmaz), 20.000 kabul edilir", () => {
    const build = (count: number) =>
      buildSectionDistributionSaveBody(mapOf(...Array.from({ length: count }, () => "1")));
    const over = build(SECTION_DISTRIBUTION_MAX_CELLS + 1);
    expect(over.cellLimitExceeded).toBe(true);
    expect(over.body.allocations).toEqual([]);
    const ok = build(SECTION_DISTRIBUTION_MAX_CELLS);
    expect(ok.cellLimitExceeded).toBe(false);
    expect(ok.body.allocations).toHaveLength(SECTION_DISTRIBUTION_MAX_CELLS);
  });

  it("girdi Map'ini mutasyona uğratmaz", () => {
    const edits = mapOf("1,5", "", "0");
    const snapshot = JSON.stringify([...edits]);
    buildSectionDistributionSaveBody(edits);
    expect(JSON.stringify([...edits])).toBe(snapshot);
  });
});

describe("SECTION_DISTRIBUTION_MAX_CELLS ↔ openapi", () => {
  it("openapi SectionDistributionSave.allocations.maxItems ile aynı", () => {
    const spec = JSON.parse(readFileSync(resolve(process.cwd(), "openapi/openapi.json"), "utf8"));
    const save = spec.components.schemas.SectionDistributionSave;
    expect(save.properties.allocations.maxItems).toBe(SECTION_DISTRIBUTION_MAX_CELLS);
    expect(save.required).toContain("allocations");
  });
});
