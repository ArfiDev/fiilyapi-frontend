import type { SectionDetailResponse } from "@/lib/api/hooks/useSection";
import type { SectionStatus } from "@/lib/section-labels";

/**
 * Bölüm formunun tüm alanları — hepsi KONTROLLÜ ve string tabanlı (sayı ve
 * tarih alanları da), site-form deseniyle aynı. Dönüşüm (boş → `null`,
 * `Number(...)`) `build-body.ts`nin işidir.
 */
export interface SectionFormValues {
  name: string;
  code: string;
  sortOrder: string;
  /** `GET /section-types` satırının id'si (BLF-F1.3: enum DEĞİL, string uuid). */
  sectionTypeId: string;
  status: SectionStatus;
  description: string;
  managerUserId: string;
  deputyManagerUserId: string;
  plannedWorkerCount: string;
  startDate: string;
  endDate: string;
  /**
   * F-TKV T5 — Bağımlılık seçici (F115-118). P11 uçları açıldı
   * (`SectionCreate.depends_on_section_id`), kontrol artık GERÇEK.
   */
  dependsOnSectionId: string;
  /**
   * F-TKV T5 — "Milestone Ekle" satırı (F119-123). Mockup TEK satır çizer ve
   * etiketi "EKLE"dir → bu iki alan EKLEME kutusudur, mevcut listenin editörü
   * DEĞİLDİR. Boş bırakılırsa gövdeye `milestones` anahtarı HİÇ girmez
   * (`null` = dokunma) ve kayıtlı milestone'lar korunur.
   */
  milestoneTitle: string;
  milestoneDate: string;
}

export function emptySectionFormValues(): SectionFormValues {
  return {
    name: "",
    code: "",
    sortOrder: "0",
    sectionTypeId: "",
    status: "planned",
    description: "",
    managerUserId: "",
    deputyManagerUserId: "",
    plannedWorkerCount: "",
    startDate: "",
    endDate: "",
    dependsOnSectionId: "",
    milestoneTitle: "",
    milestoneDate: "",
  };
}

/**
 * Düzenleme kipinde mevcut bölümden form değerlerini doldurur (brief §Teknik
 * kurallar). `manager_name`/`deputy_manager_name` serbest metin karşılıkları
 * yalnız eski (kullanıcı bağlı olmayan) kayıtları temsil etmek için OKUNUR —
 * formda YAZILABİLİR bir karşılığı yoktur (bkz. `SectionForm.tsx` sorumlu
 * seçici kararı); bu yüzden burada state'e taşınmaz, kaybolmaz çünkü
 * `manager_user_id` boşken `manager_name` gövdede DOKUNULMADAN kalır (PATCH'te
 * hiç gönderilmez).
 */
export function sectionFormValuesFromDetail(detail: SectionDetailResponse): SectionFormValues {
  return {
    name: detail.name,
    code: detail.code ?? "",
    sortOrder: String(detail.sort_order),
    sectionTypeId: detail.section_type?.id ?? "",
    status: detail.status,
    description: detail.description ?? "",
    managerUserId: detail.manager_user_id ?? "",
    deputyManagerUserId: detail.deputy_manager_user_id ?? "",
    plannedWorkerCount:
      detail.planned_worker_count === null || detail.planned_worker_count === undefined
        ? ""
        : String(detail.planned_worker_count),
    startDate: detail.start_date ?? "",
    endDate: detail.end_date ?? "",
    dependsOnSectionId: detail.depends_on_section_id ?? "",
    // Ekleme kutusu HER ZAMAN boş açılır — mevcut milestone'lar
    // `build-body.ts`de `existingMilestones` üzerinden korunur.
    milestoneTitle: "",
    milestoneDate: "",
  };
}
