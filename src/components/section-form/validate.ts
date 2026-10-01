/**
 * İstemci doğrulaması — backend `app/modules/sites/guards.py::validate_section`
 * runtime'ıyla BİREBİR (brief §Doğrulama). Mesajlar birebir alınmıştır,
 * yeniden yazılmaz.
 */

import { numberOrNull } from "./build-body";
import type { SectionFormValues } from "./form-state";

export const MESSAGES = {
  nameRequired: "Bölüm adı zorunludur.",
  endBeforeStart: "Planlanan bitiş tarihi başlangıçtan önce olamaz.",
  sectionTypeRequired: "Bölüm tipi seçiniz.",
  managerRequired: "Bölüm sorumlusu seçiniz.",
  datesRequired: "Başlangıç ve planlanan bitiş tarihi zorunludur.",
  sectionCodeConflict:
    "Bu bölüm kodu bu şantiyede zaten kullanılıyor. Farklı bir kod girin veya kodu boş bırakın.",
  // F-TKV T5 — "Milestone Ekle" satırı YARIM bırakılamaz: backend
  // `SectionMilestoneInput`te `title` ve `milestone_date` ikisi de ZORUNLUDUR
  // (422). Yarım satır sessizce DÜŞÜRÜLSEYDİ kullanıcı milestone girdiğini
  // sanır, kayıt hiç oluşmazdı.
  milestoneIncomplete: "Milestone için hem ad hem tarih girilmelidir.",
  // F-KISIT · ikisi de sözleşmede `minimum: 0` — negatif değer 422 döner.
  // (BLF-F1.3: `budget_amount` kalktı — Bölüm Bedeli yalnız hesaplanır.)
  negativeSortOrder: "Sıra numarası negatif olamaz.",
  negativeWorkerCount: "Planlanan işçi sayısı negatif olamaz.",
} as const;

/**
 * 🔴 `SectionCreate.sort_order` · `planned_worker_count`
 * ikisinin de sözleşmedeki tabanı **0**dır (`form-limits.contract.test.ts`
 * ölçer). İstemcide hiçbiri denetlenmiyordu: negatif bir değer forma
 * girilebiliyor, sunucudan UYARISIZ 422 dönüyordu.
 */
export const SECTION_NUMERIC_MIN = 0;

export type SectionFormErrors = Partial<Record<keyof SectionFormValues, string>>;

export function hasSectionFormErrors(errors: SectionFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

interface ValidateOptions {
  isDraft: boolean;
  /**
   * `GET /users` yüklenemedi (site-form/user-picker deseni). Bölüm sorumlusu
   * zorunluluğu bu durumda KALKAR — kullanıcının seçemediği bir alan zorunlu
   * tutulamaz (backend kuralı "manager_user_id BOŞ VEYA manager_name BOŞ"
   * ikisinden birini ister; formda manager_name karşılığı olmadığından liste
   * yokken tek yol da kapanmış olur, bu yüzden kural gevşer).
   */
  isUserListUnavailable: boolean;
  /**
   * Düzenleme kipinde, mevcut kayıtta serbest-metin `manager_name` doluysa
   * `true` (final review I1). Backend kuralı "manager_user_id BOŞ VEYA
   * manager_name BOŞ DEĞİL" ikisinden birini yeter sayar; form `manager_name`
   * alanını ne okur ne yazar (build-body.ts PATCH gövdesine hiç sızdırmaz),
   * bu yüzden eski (yalnız-isim) sorumlu kayıtlı bölümler bu bayrak olmadan
   * "Bölüm sorumlusu seçiniz." duvarına çarpar — kullanıcı hiçbir şey
   * değiştirmese bile kaydedemez.
   */
  hasExistingManagerName: boolean;
}

/**
 * Alan hatalarını üretir. Pydantic `min_length=1` yüzünden `name` HER İKİ
 * yolda da zorunludur. Tarih tutarlılığı taslakta da uygulanır. Geri kalan
 * zorunluluklar YALNIZ `isDraft: false` (Bölümü Oluştur / yayınla) yolunda.
 */
export function validateSectionForm(
  values: SectionFormValues,
  { isDraft, hasExistingManagerName }: ValidateOptions,
): SectionFormErrors {
  const errors: SectionFormErrors = {};

  if (!values.name.trim()) errors.name = MESSAGES.nameRequired;

  // Sözleşme tabanları — taslakta DA uygulanır (eksik veri değil, YANLIŞ veri).
  const sortOrder = numberOrNull(values.sortOrder);
  if (sortOrder !== null && sortOrder < SECTION_NUMERIC_MIN) {
    errors.sortOrder = MESSAGES.negativeSortOrder;
  }
  const workerCount = numberOrNull(values.plannedWorkerCount);
  if (workerCount !== null && workerCount < SECTION_NUMERIC_MIN) {
    errors.plannedWorkerCount = MESSAGES.negativeWorkerCount;
  }

  // Tutarlılık — HER ZAMAN, taslakta da (brief §Doğrulama).
  if (
    values.startDate &&
    values.endDate &&
    values.endDate < values.startDate
  ) {
    errors.endDate = MESSAGES.endBeforeStart;
  }

  // Milestone satırı YARIM olamaz — taslakta da geçerli (backend `title`/
  // `milestone_date` ikisini de ister, taslak bayrağı bunu gevşetmez).
  const hasMilestoneTitle = values.milestoneTitle.trim().length > 0;
  const hasMilestoneDate = values.milestoneDate.trim().length > 0;
  if (hasMilestoneTitle !== hasMilestoneDate) {
    errors.milestoneTitle = MESSAGES.milestoneIncomplete;
  }

  if (!isDraft) {
    if (!values.sectionTypeId) errors.sectionTypeId = MESSAGES.sectionTypeRequired;

    // kalan-9/no287: `isUserListUnavailable` TEK BAŞINA zorunluluğu kaldırmaz.
    // OLUŞTURMA kipinde `hasExistingManagerName` her zaman false'tur ve
    // `manager_name` gövdeye hiç girmez (FORBIDDEN_KEYS); liste yokken
    // gevşetme, backend'in HER ZAMAN 422 döneceği bir istemci-onayı üretirdi.
    // Zorunluluk yalnız `hasExistingManagerName` ile (kayıtta zaten geçerli
    // bir sorumlu varsa) kalkar.
    if (!values.managerUserId && !hasExistingManagerName) {
      errors.managerUserId = MESSAGES.managerRequired;
    }

    if (!errors.endDate && (!values.startDate || !values.endDate)) {
      errors.startDate = MESSAGES.datesRequired;
    }
  }

  return errors;
}
