import { describe, expect, it } from "vitest";

import { approvalThresholdAboveLabel, approvalThresholdBelowLabel } from "./approval-role-admin";

describe("eşik şeridi etiketleri", () => {
  it("`≥` glifi YERİNE sözcük kullanır (kapsanmayan glif yasağı)", () => {
    expect(approvalThresholdBelowLabel("₺500.000")).toBe("₺500.000 altı");
    expect(approvalThresholdAboveLabel("₺500.000")).toBe("₺500.000 ve üstü");
    expect(approvalThresholdAboveLabel("₺500.000")).not.toContain("≥");
  });
});
