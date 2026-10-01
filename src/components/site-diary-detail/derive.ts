import type { SiteDiaryEntryDetail } from "@/lib/api/hooks/useSiteDiary";
import { formatDateDots } from "@/lib/format";
import { formatAuditTime } from "@/lib/settings/audit-format";

/**
 * DET-1.2 · Günlük kayıt detayı başlık kartının SAF türevleri.
 *
 * 🔴 §2.7: bu modül ÇEKİRDEKTİR — `earned-value` (planlama) kodunu İTHAL
 * ETMEZ. EV kartları (KPI · Saat Dağıtımı) DET-1.3'te adaptörle gelir.
 */

/** Bölüm Detay'ın açık bölümü — "bu bölüm" bağlamı. */
export interface DiaryDetailSection {
  readonly id: string;
  readonly name: string;
}

/** Başlık bölümü seçilmemiş günün adı (`recent-entries.ts` ile AYNI cümle). */
export const DIARY_NO_SECTION_LABEL = "Bölüm seçilmedi";

/** `YYYY-MM-DD` → "24.09" (HÖ:90 gezinme kutusu). Ayrıştırılamayan girdi aynen döner. */
export function formatDayMonthDots(iso: string): string {
  const dots = formatDateDots(iso);
  return dots === iso ? iso : dots.slice(0, 5);
}

/**
 * Kural A — gün bu bölüme nasıl bağlı?
 *   - `header`: başlık bölümü bu bölüm (ya da bölüm bağlamı bilinmiyor —
 *     bağlam yokken "satırla bağlı" iddiası KURULMAZ);
 *   - `lines`: başlık başka bölüm/boş; bu bölüme miktar satırı yazılmış.
 *     Satır sayısı kaydın KENDİ satırlarından sayılır (uydurulmaz).
 */
export type DiaryDetailLinkage =
  | { readonly kind: "header" }
  | {
      readonly kind: "lines";
      readonly headerSectionName: string;
      readonly currentSectionName: string;
      readonly lineCount: number;
    };

export function diaryDetailLinkage(
  entry: Pick<SiteDiaryEntryDetail, "section_id" | "section_name" | "lines">,
  current: DiaryDetailSection | undefined,
): DiaryDetailLinkage {
  if (current === undefined || entry.section_id === current.id) return { kind: "header" };
  return {
    kind: "lines",
    headerSectionName: entry.section_name ?? DIARY_NO_SECTION_LABEL,
    currentSectionName: current.name,
    lineCount: entry.lines.filter((line) => line.section_id === current.id).length,
  };
}

/** S9 — kilit hapı ve bandı (İ:145 · İ:144-148). Kilitsiz günde `null`. */
export interface DiaryDetailLock {
  readonly pillLabel: string;
  readonly bandTitle: string;
}

export function diaryDetailLock(
  entry: Pick<SiteDiaryEntryDetail, "locked" | "lock_report_date">,
): DiaryDetailLock | null {
  if (!entry.locked) return null;
  if (entry.lock_report_date === null) {
    return { pillLabel: "Kilitli", bandTitle: "Bu gün rapor onayıyla kilitlendi." };
  }
  const date = formatDateDots(entry.lock_report_date);
  return { pillLabel: `Kilitli · ${date} raporu`, bandTitle: `Bu gün ${date} raporuyla kilitlendi.` };
}

/** Oluşturan / Gönderen satırı. Saatler Europe/Istanbul (`formatAuditTime` tek kaynağı). */
export interface DiaryDetailAuthor {
  readonly createdBy: string;
  readonly createdAt: string;
  /** Taslakta `null` — mockup (b) "Henüz gönderilmedi". */
  readonly submitted: { readonly by: string; readonly at: string | null } | null;
}

/** Adı çözülemeyen kullanıcı (silinmiş hesap) — ad UYDURULMAZ. */
const UNKNOWN_USER = "—";

export function diaryDetailAuthor(
  entry: Pick<
    SiteDiaryEntryDetail,
    "status" | "created_at" | "created_by_name" | "submitted_at" | "submitted_by_name"
  >,
): DiaryDetailAuthor {
  return {
    createdBy: entry.created_by_name ?? UNKNOWN_USER,
    createdAt: formatAuditTime(entry.created_at),
    submitted:
      entry.status === "submitted"
        ? {
            by: entry.submitted_by_name ?? UNKNOWN_USER,
            at: entry.submitted_at === null ? null : formatAuditTime(entry.submitted_at),
          }
        : null,
  };
}
