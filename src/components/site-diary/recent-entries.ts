import { formatCurrencyPrecise, formatDayMonth } from "@/lib/format";
import type { SiteDiaryEntryListItem } from "@/lib/api/hooks/useSiteDiary";

import type { DiarySectionOption } from "./DiaryBasicInfoCard";
import { DIARY_STATUS_LABELS } from "./diary-labels";

/**
 * GK356-386 · "Son Kayıtlar" kartının SAF türevleri (bileşenden ayrı test
 * edilir — WORKFLOW §4 "saf türevler ayrı .ts").
 */

/** Mockup üç satır basar (GK359-384) — kart yüksekliği o üç satıra göredir. */
export const DIARY_RECENT_ENTRY_LIMIT = 3;

export interface DiaryRecentEntryRow {
  id: string;
  /** ISO gün — satıra tıklanınca AÇILACAK kaydın günü. */
  entryDate: string;
  /** GK360: "16 Temmuz". */
  dateLabel: string;
  /** GK361: "Gönderildi" / "Taslak". */
  statusLabel: string;
  isSubmitted: boolean;
  /** GK372: hava `rainy` ise kırmızı "Yağışlı" rozeti (frontend türevi). */
  isRainy: boolean;
  /** GK363 ilk parça: "42 işçi". */
  workerLabel: string;
  /** GK363 ikinci parça — mockup'ta serbest iş metni; backend LİSTE ucunda
   * karşılığı BÖLÜM adıdır (`section_id`; liste `work_done` taşımaz). Bölüm
   * seçilmemişse "Bölüm seçilmedi", adı çözülemiyorsa `null` (çağıran pending
   * gösterir). */
  sectionLabel: string | null;
  /**
   * GK364: "₺ 182.400 hakediş katkısı" — `lines_total`. İlerleme görünümünde
   * (İ:313-327) bu satır YOKTUR → `null`. Maskeli rolde (IZN-F4d.2) `lines_total` `null` → "— hakediş katkısı" (0 DEĞİL).
   */
  amountLabel: string | null;
}

/**
 * Satırın hangi mockup'a göre basıldığı. `default` = GK (Bölüm Detay'ın
 * günlük sekmesi de bunu kullanır — görsel tabanı değişmez); `progress` =
 * İ:313-327 ("Gönderilmedi" etiketi, ₺ satırı yok).
 */
export type DiaryRecentEntryVariant = "default" | "progress";

/** İ:315 — taslak kayıt "Gönderilmedi" rozetiyle basılır. */
export const DIARY_NOT_SUBMITTED_LABEL = "Gönderilmedi";

/**
 * Liste ucunun sırası zaten `entry_date DESC`tir; yine de burada YENİDEN
 * sıralanır — kart bir sunucu sırasına GÜVENMEZ (filtre/sayfalama değişirse
 * sessizce yanlış "son" kayıtlar basılırdı).
 */
export function buildRecentEntryRows(
  items: readonly SiteDiaryEntryListItem[],
  sections: readonly DiarySectionOption[],
  limit: number = DIARY_RECENT_ENTRY_LIMIT,
  variant: DiaryRecentEntryVariant = "default",
): DiaryRecentEntryRow[] {
  const isProgress = variant === "progress";
  const sectionNameById = new Map(sections.map((section) => [section.id, section.name]));
  return [...items]
    .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
    .slice(0, limit)
    .map((item) => ({
      id: item.id,
      entryDate: item.entry_date,
      dateLabel: formatDayMonth(item.entry_date),
      statusLabel:
        isProgress && item.status === "draft" ? DIARY_NOT_SUBMITTED_LABEL : DIARY_STATUS_LABELS[item.status],
      isSubmitted: item.status === "submitted",
      isRainy: item.weather === "rainy",
      workerLabel: `${item.worker_total} işçi`,
      sectionLabel:
        item.section_id === null
          ? "Bölüm seçilmedi"
          : (sectionNameById.get(item.section_id) ?? null),
      amountLabel: isProgress ? null : `${formatCurrencyPrecise(item.lines_total)} hakediş katkısı`,
    }));
}
