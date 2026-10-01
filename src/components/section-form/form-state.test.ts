import { describe, it, expect } from "vitest";

import type { SectionDetailResponse } from "@/lib/api/hooks/useSection";
import { emptySectionFormValues, sectionFormValuesFromDetail } from "./form-state";

const PLACEHOLDER = { available: false, value: null, pending_module: "boq" };
const COUNT_PLACEHOLDER = { available: false, count: null, pending_module: "boq" };

const DETAIL: SectionDetailResponse = {
  id: "sec-1",
  site_id: "site-1",
  code: "BLM-06",
  name: "Kat 11–14 Kaba İnşaat",
  status: "active",
  manager_user_id: "user-1",
  manager_name: "Sercan Öztürk",
  deputy_manager_user_id: "user-2",
  deputy_manager_name: "Kadir Yıldız",
  start_date: "2026-10-01",
  end_date: "2027-03-31",
  sort_order: 6,
  depends_on_section_id: "sec-9",
  milestones: [{ id: "ms-1", title: "Kat 12 döşeme", milestone_date: "2026-12-01", sort_order: 0 }],
  section_type: { id: "type-structural", name: "Kaba İnşaat" },
  description: "Kat 11–14 arası betonarme, kalıp ve demir imalatı.",
  planned_worker_count: 42,
  is_draft: false,
  progress_pct: PLACEHOLDER,
  boq_item_count: COUNT_PLACEHOLDER,
  budget: PLACEHOLDER,
  worker_count: COUNT_PLACEHOLDER,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("emptySectionFormValues", () => {
  it("bos degerler, sort_order '0' ve status 'planned' ile baslar", () => {
    const values = emptySectionFormValues();
    expect(values.name).toBe("");
    expect(values.sortOrder).toBe("0");
    expect(values.status).toBe("planned");
  });
});

describe("sectionFormValuesFromDetail", () => {
  it("duzenleme kipinde mevcut bolumden tum alanlari doldurur", () => {
    const values = sectionFormValuesFromDetail(DETAIL);
    expect(values).toEqual({
      name: "Kat 11–14 Kaba İnşaat",
      code: "BLM-06",
      sortOrder: "6",
      // BLF-F1.3: tip artık {id,name}; forma YALNIZ id taşınır.
      sectionTypeId: "type-structural",
      status: "active",
      description: "Kat 11–14 arası betonarme, kalıp ve demir imalatı.",
      managerUserId: "user-1",
      deputyManagerUserId: "user-2",
      plannedWorkerCount: "42",
      startDate: "2026-10-01",
      endDate: "2027-03-31",
      // F-TKV T5 — bağımlılık DETAYDAN gelir (kilit açıldı).
      dependsOnSectionId: "sec-9",
      // 🔴 Milestone satırı EKLEME kutusudur: kayıtlı satırlar buraya
      // TOHUMLANMAZ (tek satırlık kutu 1'den fazlasını temsil edemez) —
      // korunmaları `build-body.ts`nin `existingMilestones` yolundan gelir.
      milestoneTitle: "",
      milestoneDate: "",
    });
  });

  it("nullable alanlar bosken bos string/'' olarak doldurulur", () => {
    const sparse: SectionDetailResponse = {
      ...DETAIL,
      code: null,
      manager_user_id: null,
      deputy_manager_user_id: null,
      section_type: null,
      description: null,
      planned_worker_count: null,
      start_date: null,
      end_date: null,
    };
    const values = sectionFormValuesFromDetail(sparse);
    expect(values.code).toBe("");
    expect(values.managerUserId).toBe("");
    expect(values.deputyManagerUserId).toBe("");
    expect(values.sectionTypeId).toBe("");
    expect(values.description).toBe("");
    expect(values.plannedWorkerCount).toBe("");
    expect(values.startDate).toBe("");
    expect(values.endDate).toBe("");
    expect(values).not.toHaveProperty("budgetAmount");
  });

  it("planned_worker_count 0 iken '0' olarak kalir (bos string DEĞİL)", () => {
    const values = sectionFormValuesFromDetail({ ...DETAIL, planned_worker_count: 0 });
    expect(values.plannedWorkerCount).toBe("0");
  });
});
