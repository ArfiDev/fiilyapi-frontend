import type { components } from "@/lib/api/schema";
import type { DeepScale } from "@/lib/api/scale";

export type SectionInput = DeepScale<components["schemas"]["SiteSectionInput"]>;

/**
 * Bölüm tablosunun İSTEMCİ satır modeli (spec §6.1).
 *
 * `id` bir istemci kimliğidir — React `key` olarak **index KULLANILAMAZ**:
 * baştaki satır silindiğinde kalan satırların girdileri birbirine karışır.
 * `estimatedAmount` **yoktur**: "Tahmini Bedel" sütunu yer tutucudur (§3.5).
 */
export interface SectionRow {
  id: string;
  name: string;
  /** Seçilen kullanıcının UUID'si; "" = seçilmedi (bölüm sorumlusuz geçerlidir). */
  managerUserId: string;
  startDate: string;
  endDate: string;
}

export type SectionIssueField = "name" | "endDate";

export interface SectionIssue {
  /** Tablodaki satır sırası (0 tabanlı); mesaj "{index + 1}. satır" olarak basılır. */
  index: number;
  field: SectionIssueField;
  message: string;
}

export const SECTION_MESSAGES = {
  nameRequired: "Bölüm adı zorunludur.",
  endBeforeStart: "Bölüm bitiş tarihi başlangıçtan önce olamaz.",
} as const;

let rowCounter = 0;

export function emptySectionRow(): SectionRow {
  rowCounter += 1;
  return { id: `section-${rowCounter}`, name: "", managerUserId: "", startDate: "", endDate: "" };
}

/** Satırın hiçbir alanı doldurulmamış mı? Böyle satırlar sessizce atılır (§6.5). */
function isBlankRow(row: SectionRow): boolean {
  return !row.name.trim() && !row.managerUserId && !row.startDate && !row.endDate;
}

/**
 * Bölüm satırlarının doğrulaması (spec §6.5).
 *
 * Taslakta ad boşluğu hata vermez (satır atılır) ama tarih sırası kuralı
 * **aynen işler**. Aynı ad iki satırda uyarı üretmez.
 */
export function validateSections(
  rows: readonly SectionRow[],
  { isDraft }: { isDraft: boolean },
): SectionIssue[] {
  const issues: SectionIssue[] = [];

  rows.forEach((row, index) => {
    if (isBlankRow(row)) return;

    if (!row.name.trim() && !isDraft) {
      issues.push({ index, field: "name", message: SECTION_MESSAGES.nameRequired });
    }
    if (row.startDate && row.endDate && row.endDate < row.startDate) {
      issues.push({ index, field: "endDate", message: SECTION_MESSAGES.endBeforeStart });
    }
  });

  return issues;
}

/**
 * Gövdeye giden bölüm dizisi (spec §6.1).
 *
 * ÜÇ alan bilinçli olarak ÜRETİLMEZ:
 * - `sort_order` — sunucu dizi sırasından atar
 * - `estimated_amount` — saklanmaz, sütun yer tutucudur
 * - `manager_name` — sunucu FK'den anlık görüntü yazar
 *
 * Boş alanlar `null` olarak değil, **hiç** gönderilmez: sorumlusuz/tarihsiz
 * bölüm geçerlidir ve backend alanı isteğe bağlıdır.
 */
export function collectSectionInputs(rows: readonly SectionRow[]): SectionInput[] {
  return rows
    .filter((row) => row.name.trim())
    .map((row) => ({
      name: row.name.trim(),
      ...(row.managerUserId ? { manager_user_id: row.managerUserId } : {}),
      ...(row.startDate ? { start_date: row.startDate } : {}),
      ...(row.endDate ? { end_date: row.endDate } : {}),
    }));
}
