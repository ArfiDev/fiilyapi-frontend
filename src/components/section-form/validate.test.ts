import { describe, it, expect } from "vitest";

import { emptySectionFormValues, type SectionFormValues } from "./form-state";
import { MESSAGES, validateSectionForm } from "./validate";

function values(overrides: Partial<SectionFormValues> = {}): SectionFormValues {
  return { ...emptySectionFormValues(), ...overrides };
}

const AVAILABLE = { isUserListUnavailable: false, hasExistingManagerName: false };

function opts(overrides: { isDraft?: boolean } = {}) {
  return { isDraft: false, ...AVAILABLE, ...overrides };
}

describe("validateSectionForm — taslak (is_draft: true)", () => {
  it("ad HARİÇ hiçbir zorunluluk uygulanmaz", () => {
    const errors = validateSectionForm(values({ name: "Temel" }), { isDraft: true, ...AVAILABLE });
    expect(errors).toEqual({});
  });

  it("ad boşsa taslakta da hata verir (Pydantic min_length=1 her iki yolda)", () => {
    const errors = validateSectionForm(values({ name: "" }), { isDraft: true, ...AVAILABLE });
    expect(errors.name).toBe(MESSAGES.nameRequired);
  });

  it("tarih tutarlılığı taslakta da UYGULANIR", () => {
    const errors = validateSectionForm(
      values({ name: "Temel", startDate: "2026-05-01", endDate: "2026-04-01" }),
      { isDraft: true, ...AVAILABLE },
    );
    expect(errors.endDate).toBe(MESSAGES.endBeforeStart);
  });

  it("section_type/manager/tarih boş olsa da taslakta hata YOK", () => {
    const errors = validateSectionForm(values({ name: "Temel" }), { isDraft: true, ...AVAILABLE });
    expect(errors.sectionTypeId).toBeUndefined();
    expect(errors.managerUserId).toBeUndefined();
    expect(errors.startDate).toBeUndefined();
  });
});

describe("validateSectionForm — taslak dışı (is_draft: false, Bölümü Oluştur)", () => {
  const base = { name: "Temel", sectionTypeId: "t-1", managerUserId: "u1", startDate: "2026-01-01", endDate: "2026-02-01" };

  it("tüm alanlar doluysa hata yok", () => {
    const errors = validateSectionForm(values(base), { isDraft: false, ...AVAILABLE });
    expect(errors).toEqual({});
  });

  it("section_type boşsa 'Bölüm tipi seçiniz.'", () => {
    const errors = validateSectionForm(values({ ...base, sectionTypeId: "" }), { isDraft: false, ...AVAILABLE });
    expect(errors.sectionTypeId).toBe(MESSAGES.sectionTypeRequired);
  });

  it("managerUserId boşsa 'Bölüm sorumlusu seçiniz.' (liste mevcutken)", () => {
    const errors = validateSectionForm(values({ ...base, managerUserId: "" }), { isDraft: false, ...AVAILABLE });
    expect(errors.managerUserId).toBe(MESSAGES.managerRequired);
  });

  // kalan-9/no287: OLUŞTURMA kipinde `hasExistingManagerName` HER ZAMAN
  // false'tur (SectionForm.tsx) ve build-body `manager_name` ASLA göndermez
  // (FORBIDDEN_KEYS). `isUserListUnavailable` TEK BAŞINA zorunluluğu
  // kaldırırsa istemci "OK" der ama backend guards.py SECTION_MANAGER_REQUIRED
  // ile HER ZAMAN 422 döner — kaçınılmaz bir çıkmaz. Zorunluluk yalnız
  // `hasExistingManagerName` (kayıtta zaten geçerli bir sorumlu varsa) ile
  // kalkabilir.
  it("kullanici listesi yuklenemedi AMA hasExistingManagerName yoksa sorumlu YINE zorunlu (garanti 422 tuzagi kapali)", () => {
    const errors = validateSectionForm(values({ ...base, managerUserId: "" }), {
      isDraft: false,
      isUserListUnavailable: true,
      hasExistingManagerName: false,
    });
    expect(errors.managerUserId).toBe(MESSAGES.managerRequired);
  });

  // final review I1: sec-2 senaryosu (mock-backend.ts) — manager_user_id
  // null, manager_name "M. Arslan" dolu, eski (serbest-metin) sorumlulu
  // kayıt. Backend "manager_user_id BOŞ VEYA manager_name BOŞ DEĞİL"
  // ikisinden birini yeter sayar; form bu bayrak olmadan böyle kayıtları
  // asla kaydedemezdi.
  it("hasExistingManagerName true iken managerUserId boş olsa da hata YOK (eski serbest-metin sorumlu)", () => {
    const errors = validateSectionForm(values({ ...base, managerUserId: "" }), {
      isDraft: false,
      isUserListUnavailable: false,
      hasExistingManagerName: true,
    });
    expect(errors.managerUserId).toBeUndefined();
  });

  it("startDate boşsa 'Başlangıç ve planlanan bitiş tarihi zorunludur.'", () => {
    const errors = validateSectionForm(values({ ...base, startDate: "" }), { isDraft: false, ...AVAILABLE });
    expect(errors.startDate).toBe(MESSAGES.datesRequired);
  });

  it("endDate boşsa aynı mesaj startDate alanına düşer", () => {
    const errors = validateSectionForm(values({ ...base, endDate: "" }), { isDraft: false, ...AVAILABLE });
    expect(errors.startDate).toBe(MESSAGES.datesRequired);
  });

  it("🔴 BLF-F1.3: bölüm bedeli ARTIK zorunlu değil — alan form durumunda yok, hata üretilemez", () => {
    const errors = validateSectionForm(values(base), { isDraft: false, ...AVAILABLE });
    expect(errors).not.toHaveProperty("budgetAmount");
    expect(Object.keys(values(base))).not.toContain("budgetAmount");
    expect(MESSAGES).not.toHaveProperty("budgetRequired");
    expect(MESSAGES).not.toHaveProperty("negativeBudget");
  });

  it("tarih sırası ters ise startDate/endDate zorunluluğundan ÖNCE tutarlılık hatası basılır", () => {
    const errors = validateSectionForm(
      values({ ...base, startDate: "2026-05-01", endDate: "2026-04-01" }),
      { isDraft: false, ...AVAILABLE },
    );
    expect(errors.endDate).toBe(MESSAGES.endBeforeStart);
    expect(errors.startDate).toBeUndefined();
  });
});

describe("milestone satırı (F-TKV T5)", () => {
  it("iki alan da BOŞsa hata yoktur", () => {
    expect(validateSectionForm(values(), opts()).milestoneTitle).toBeUndefined();
  });

  it("iki alan da DOLUysa hata yoktur", () => {
    const errors = validateSectionForm(
      values({ milestoneTitle: "Kat 14 döşeme", milestoneDate: "2027-01-15" }),
      opts(),
    );
    expect(errors.milestoneTitle).toBeUndefined();
  });

  it("YALNIZ ad girilirse hata verir — satır sessizce DÜŞÜRÜLMEZ", () => {
    expect(
      validateSectionForm(values({ milestoneTitle: "Kat 14 döşeme" }), opts()).milestoneTitle,
    ).toBe(MESSAGES.milestoneIncomplete);
  });

  it("YALNIZ tarih girilirse hata verir", () => {
    expect(validateSectionForm(values({ milestoneDate: "2027-01-15" }), opts()).milestoneTitle).toBe(
      MESSAGES.milestoneIncomplete,
    );
  });

  it("TASLAK yolunda da uygulanır (backend her iki alanı da ister)", () => {
    expect(
      validateSectionForm(values({ milestoneTitle: "Yarım" }), opts({ isDraft: true }))
        .milestoneTitle,
    ).toBe(MESSAGES.milestoneIncomplete);
  });
});
