import { describe, it, expect } from "vitest";

import { PHYSICAL_RESTRICTED_LABEL, physicalLabel } from "./physicalLabel";

describe("physicalLabel (DSC-F3a)", () => {
  it("sabit metin CEO kararıdır", () => {
    expect(PHYSICAL_RESTRICTED_LABEL).toBe("Fiziksel (disiplinlerim)");
  });

  it("kısıtlıda taban metin ne olursa olsun sabit etiketi döndürür", () => {
    expect(physicalLabel("İlerleme", true)).toBe("Fiziksel (disiplinlerim)");
    expect(physicalLabel("Fiziksel İlerleme", true)).toBe("Fiziksel (disiplinlerim)");
  });

  it("kısıtsızda taban metni AYNEN döndürür (bayt aynı)", () => {
    expect(physicalLabel("İlerleme", false)).toBe("İlerleme");
    expect(physicalLabel("Fiziksel İlerleme", false)).toBe("Fiziksel İlerleme");
  });
});
