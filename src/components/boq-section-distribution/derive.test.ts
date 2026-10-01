import { describe, it, expect } from "vitest";

import { sectionDistributionCellKey } from "@/lib/section-distribution-save";

import {
  allocationQuantityForSection,
  buildUnallocatedWarning,
  hasNoAllocation,
  isSectionDistributionMetrajHidden,
  liveUnallocated,
  sectionColumnTitle,
  toDistributeRemainingItem,
} from "./derive";
import {
  SECTION_DISTRIBUTION_FIXTURE,
  maskedSectionDistribution,
} from "./section-distribution.fixture";

const items = SECTION_DISTRIBUTION_FIXTURE.groups.flatMap((group) => group.items);
const [beton, demir, seramik, mantolama] = items;
const sectionIds = SECTION_DISTRIBUTION_FIXTURE.sections.map((section) => section.id);

describe("buildUnallocatedWarning — K3/K5 uyarı metni", () => {
  it("normal rolde kalem listesi: kod + atanmamış miktar + birim, BOQ sırası", () => {
    expect(buildUnallocatedWarning(SECTION_DISTRIBUTION_FIXTURE)).toBe(
      "3 kalemde atanmamış miktar var: 03.001 (500 m³), 04.001 (1.200 m²), 04.002 (600 m²)",
    );
  });

  it("tam dağıtılmış kalem (atanmamış 0) listeye girmez", () => {
    expect(buildUnallocatedWarning(SECTION_DISTRIBUTION_FIXTURE)).not.toContain("03.002");
  });

  it("maskeli rolde yalnız kodlar, virgülle", () => {
    expect(buildUnallocatedWarning(maskedSectionDistribution())).toBe(
      "3 kalemde atanmamış miktar var: 03.001, 04.001, 04.002",
    );
  });

  it("unallocated_item_count 0 ise uyarı YOK", () => {
    expect(
      buildUnallocatedWarning({ ...SECTION_DISTRIBUTION_FIXTURE, unallocated_item_count: 0 }),
    ).toBeNull();
  });
});

describe("liveUnallocated — canlı atanmamış (KDG kuralı)", () => {
  const key = sectionDistributionCellKey;

  it("taslak yokken sunucu değeri", () => {
    expect(liveUnallocated(beton, sectionIds, new Map())).toBe("500.000");
  });

  it("kirli hücre varsa quantity − Σ etkin", () => {
    const drafts = new Map([[key("bi-1", "sec-1"), "450"]]);
    // 1200 − (450 + 300) = 450
    expect(liveUnallocated(beton, sectionIds, drafts)).toBe("450.000");
  });

  it("boşaltılan hücre 0 sayılır", () => {
    const drafts = new Map([[key("bi-1", "sec-1"), ""]]);
    expect(liveUnallocated(beton, sectionIds, drafts)).toBe("900.000");
  });

  it("geçersiz taslakta sunucu değerine döner", () => {
    const drafts = new Map([[key("bi-1", "sec-1"), "abc"]]);
    expect(liveUnallocated(beton, sectionIds, drafts)).toBe("500.000");
  });

  it("maskeli kalemde (quantity null) hesap yok → null", () => {
    const masked = maskedSectionDistribution().groups[0].items[0];
    const drafts = new Map([[key("bi-1", "sec-1"), "10"]]);
    expect(liveUnallocated(masked, sectionIds, drafts)).toBeNull();
  });
});

describe("sectionColumnTitle", () => {
  it("kod yoksa yalnız ad", () => {
    expect(sectionColumnTitle({ code: null, name: "Kat 1-5" })).toBe("Kat 1-5");
  });

  it("kod varsa 'kod · ad'", () => {
    expect(sectionColumnTitle({ code: "B1", name: "Kat 1-5" })).toBe("B1 · Kat 1-5");
  });

  it("taslak bölüm normal başlık alır (rozet/ikon yok)", () => {
    const draft = SECTION_DISTRIBUTION_FIXTURE.sections[2];
    expect(draft.is_draft).toBe(true);
    expect(sectionColumnTitle(draft)).toBe("Kat 11-15");
  });
});

describe("isSectionDistributionMetrajHidden — some, fail-closed", () => {
  it("maskesiz fikstür → false", () => {
    expect(isSectionDistributionMetrajHidden(SECTION_DISTRIBUTION_FIXTURE.groups)).toBe(false);
  });

  it("tek kalemde quantity null ise bile true", () => {
    const groups = SECTION_DISTRIBUTION_FIXTURE.groups.map((group, groupIndex) => ({
      ...group,
      items: group.items.map((item, itemIndex) =>
        groupIndex === 1 && itemIndex === 1 ? { ...item, quantity: null } : item,
      ),
    }));
    expect(isSectionDistributionMetrajHidden(groups)).toBe(true);
  });

  it("tam maskeli → true", () => {
    expect(isSectionDistributionMetrajHidden(maskedSectionDistribution().groups)).toBe(true);
  });

  it("kalem yoksa false", () => {
    expect(isSectionDistributionMetrajHidden([])).toBe(false);
  });
});

describe("hücre ve kalem yardımcıları", () => {
  it("allocationQuantityForSection: pay yoksa null", () => {
    expect(allocationQuantityForSection(beton, "sec-1")).toBe("400.000");
    expect(allocationQuantityForSection(beton, "sec-3")).toBeNull();
  });

  it("hasNoAllocation yalnız hiç payı olmayan kalemde true", () => {
    expect(hasNoAllocation(seramik)).toBe(true);
    expect(hasNoAllocation(demir)).toBe(false);
    expect(hasNoAllocation(mantolama)).toBe(false);
  });

  it("toDistributeRemainingItem: payları Map'e alır, maskelide null", () => {
    const mapped = toDistributeRemainingItem(beton);
    expect(mapped?.quantity).toBe("1200.000");
    expect([...(mapped?.shares ?? [])]).toEqual([
      ["sec-1", "400.000"],
      ["sec-2", "300.000"],
    ]);
    expect(toDistributeRemainingItem(maskedSectionDistribution().groups[0].items[0])).toBeNull();
  });
});
