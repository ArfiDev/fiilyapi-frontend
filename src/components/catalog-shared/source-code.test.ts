import { describe, expect, it } from "vitest";
import { sourceCodeLabel } from "./source-code";

describe("sourceCodeLabel", () => {
  it("null / undefined / eksik alan → null", () => {
    expect(sourceCodeLabel({ source_code: null })).toBeNull();
    expect(sourceCodeLabel({ source_code: undefined })).toBeNull();
    expect(sourceCodeLabel({})).toBeNull();
  });
  it("boş ve yalnız boşluk → null", () => {
    expect(sourceCodeLabel({ source_code: "" })).toBeNull();
    expect(sourceCodeLabel({ source_code: "   " })).toBeNull();
  });
  it("değer kırpılarak döner", () => {
    expect(sourceCodeLabel({ source_code: "15.100.1001" })).toBe("15.100.1001");
    expect(sourceCodeLabel({ source_code: "  35.140.3195-D " })).toBe("35.140.3195-D");
  });
});
