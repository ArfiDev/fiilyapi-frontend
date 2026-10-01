import { describe, it, expect } from "vitest";

import {
  SECTION_STATUS_LABELS,
  SECTION_STATUS_CLASS_SUFFIX,
} from "./section-labels";

describe("section-labels — bölüm durumu eşlemesi (4 durum, birebir)", () => {
  it("dört durumun tümü Türkçe etiket taşır", () => {
    expect(SECTION_STATUS_LABELS).toEqual({
      planned: "Planlandı",
      active: "Aktif",
      on_hold: "Beklemede",
      completed: "Tamamlandı",
    });
  });
});

describe("section-labels — durum sınıf eki (tek kaynak, on_hold artık planned kopyası değil)", () => {
  it("on_hold kendi sınıf ekine sahiptir, planned'dan farklıdır", () => {
    expect(SECTION_STATUS_CLASS_SUFFIX.on_hold).toBe("on-hold");
    expect(SECTION_STATUS_CLASS_SUFFIX.on_hold).not.toBe(SECTION_STATUS_CLASS_SUFFIX.planned);
  });

  it("dört durumun tümü sınıf ekine sahiptir", () => {
    expect(SECTION_STATUS_CLASS_SUFFIX).toEqual({
      completed: "completed",
      active: "active",
      planned: "planned",
      on_hold: "on-hold",
    });
  });
});
