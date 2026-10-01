import { describe, it, expect } from "vitest";

import { buildSectionBody, numberOrNull, textOrNull, type SectionMilestone } from "./build-body";
import { emptySectionFormValues, type SectionFormValues } from "./form-state";

/**
 * Kanıt yükümlülüğü (brief §Mockup'ta olup backend'i OLMAYAN kartlar):
 * gövde inşasının anahtar kümesi, devre dışı kartlardan (Görevli Taşeronlar,
 * Kullanılacak Makineler, Bağımlılık, Milestone, Gantt checkbox, Bölüm
 * Belgeleri, Bölüme Atanacak İş Kalemleri) HİÇBİR alan İÇERMEZ — çünkü
 * `SectionFormValues`in kendisinde bu kartların karşılığı YOKTUR ve
 * `buildSectionBody` yalnız bu tipten okur.
 */
const ALLOWED_KEYS = [
  "name",
  "code",
  "sort_order",
  "section_type_id",
  "status",
  "description",
  "manager_user_id",
  "deputy_manager_user_id",
  "planned_worker_count",
  "start_date",
  "end_date",
  "is_draft",
  // F-TKV T5 — GANTT KİLİDİ AÇILDI: bu iki alan artık gövdenin GERÇEK parçası.
  "depends_on_section_id",
  "milestones",
] as const;

const FORBIDDEN_KEYS = [
  "site_id",
  "duration_days",
  "manager_name",
  "deputy_manager_name",
  "subcontractor_ids",
  "equipment_ids",
  // Yanlış ADLAR — gerçek alanlar `depends_on_section_id` / `milestones`tir.
  "dependency_section_id",
  // Gantt onay kutusunun gövde karşılığı YOKTUR (her bölüm takvime girer).
  "gantt_auto_add",
  "documents",
  "boq_items",
  // BLF-F1.3 — Bölüm Bedeli artık yalnız HESAPLANIR (F-a): gövdede elle bedel
  // YOKTUR. Eski enum alanı da gider (`section_type_id` gelir).
  "budget_amount",
  "section_type",
];

const EXISTING: SectionMilestone[] = [
  { id: "ms-1", title: "Kat 12 döşeme", milestone_date: "2026-12-01", sort_order: 0 },
];

function values(overrides: Partial<SectionFormValues> = {}): SectionFormValues {
  return { ...emptySectionFormValues(), name: "Temel & Bodrum Katlar", ...overrides };
}

describe("buildSectionBody", () => {
  it("gövde anahtarları izinli kümenin ALT KÜMESİDİR — devre dışı kart alanı sızmaz", () => {
    const body = buildSectionBody(values(), { isDraft: false });
    for (const key of Object.keys(body)) {
      expect(ALLOWED_KEYS).toContain(key);
    }
    for (const forbidden of FORBIDDEN_KEYS) {
      expect(body).not.toHaveProperty(forbidden);
    }
  });

  it("milestone kutusu BOŞKEN `milestones` anahtarı HİÇ gönderilmez (null = dokunma)", () => {
    const body = buildSectionBody(values(), { isDraft: false });
    expect(body).not.toHaveProperty("milestones");
  });

  it("🔴 form ASLA `milestones: []` (hepsini sil) göndermez — kayıtlılar varken de", () => {
    const body = buildSectionBody(values(), { isDraft: false, existingMilestones: EXISTING });
    expect(body).not.toHaveProperty("milestones");
  });

  it("yeni satır doluysa kayıtlılar `id`leriyle KORUNUR ve yeni satır SONA eklenir", () => {
    const body = buildSectionBody(
      values({ milestoneTitle: " Kat 14 döşeme ", milestoneDate: "2027-01-15" }),
      { isDraft: false, existingMilestones: EXISTING },
    );
    expect(body.milestones).toEqual([
      { id: "ms-1", title: "Kat 12 döşeme", milestone_date: "2026-12-01" },
      { title: "Kat 14 döşeme", milestone_date: "2027-01-15" },
    ]);
  });

  it("`sort_order` GÖVDEDEN GELMEZ — sunucu dizi sırasından atar", () => {
    const body = buildSectionBody(
      values({ milestoneTitle: "Yeni", milestoneDate: "2027-01-15" }),
      { isDraft: false, existingMilestones: EXISTING },
    );
    for (const milestone of body.milestones ?? []) {
      expect(milestone).not.toHaveProperty("sort_order");
    }
  });

  it("YARIM milestone satırı gövdeye girmez (doğrulama ayrı katmandadır)", () => {
    expect(buildSectionBody(values({ milestoneTitle: "Yalnız ad" }), { isDraft: false })).not.toHaveProperty("milestones");
    expect(buildSectionBody(values({ milestoneDate: "2027-01-15" }), { isDraft: false })).not.toHaveProperty("milestones");
  });

  it("bağımlılık seçilmemişse null gönderilir (anahtar DÜŞMEZ — bağı temizlemek mümkün)", () => {
    expect(buildSectionBody(values(), { isDraft: false }).depends_on_section_id).toBeNull();
    expect(
      buildSectionBody(values({ dependsOnSectionId: "sec-9" }), { isDraft: false })
        .depends_on_section_id,
    ).toBe("sec-9");
  });

  it("kod boşsa anahtar hiç gönderilmez (F68 — sunucu BLM-NN üretir)", () => {
    const body = buildSectionBody(values({ code: "" }), { isDraft: false });
    expect(body).not.toHaveProperty("code");
  });

  it("kod doluysa gönderilir", () => {
    const body = buildSectionBody(values({ code: "BLM-06" }), { isDraft: false });
    expect(body.code).toBe("BLM-06");
  });

  it("🔴 BLF-F1.3: gövdeye `budget_amount` ASLA girmez (taslak ve yayın, her değerde)", () => {
    for (const isDraft of [true, false]) {
      const body = buildSectionBody(values({ sectionTypeId: "t-1" }), { isDraft });
      expect(body).not.toHaveProperty("budget_amount");
    }
  });

  it("🔴 BLF-F1.3: seçili tip `section_type_id` (uuid string) olarak gider; eski `section_type` YOK", () => {
    const body = buildSectionBody(values({ sectionTypeId: "11111111-1111-4111-8111-111111111111" }), {
      isDraft: false,
    });
    expect(body.section_type_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(body).not.toHaveProperty("section_type");
  });

  it("is_draft HER ZAMAN gönderilir", () => {
    expect(buildSectionBody(values(), { isDraft: true }).is_draft).toBe(true);
    expect(buildSectionBody(values(), { isDraft: false }).is_draft).toBe(false);
  });

  it("boş tarih/sayı alanları null olarak gönderilir (anahtar düşmez, backend nullable)", () => {
    const body = buildSectionBody(values(), { isDraft: true });
    expect(body.start_date).toBeNull();
    expect(body.end_date).toBeNull();
    expect(body.planned_worker_count).toBeNull();
    expect(body.section_type_id).toBeNull();
    expect(body.description).toBeNull();
    expect(body.manager_user_id).toBeNull();
    expect(body.deputy_manager_user_id).toBeNull();
  });
});

describe("textOrNull / numberOrNull", () => {
  it("boş/boşluk metin null döner", () => {
    expect(textOrNull("")).toBeNull();
    expect(textOrNull("   ")).toBeNull();
    expect(textOrNull(" a ")).toBe("a");
  });

  it("'0' geçerli sayıdır, null DEĞİLDİR", () => {
    expect(numberOrNull("0")).toBe(0);
  });

  it("boş/sayı olmayan girişte null döner", () => {
    expect(numberOrNull("")).toBeNull();
    expect(numberOrNull("abc")).toBeNull();
  });
});
