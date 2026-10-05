import { UNSECTIONED_LABEL } from "@/components/site-diary/diary-lines-tree";
import type { SiteDiaryEntryDetail, SiteDiaryLineRead } from "@/lib/api/hooks/useSiteDiary";
import { isZeroDecimalString, subtractDecimalStrings, sumDecimalStrings } from "@/lib/decimal";

import type { DiaryDetailSection } from "./derive";

/**
 * DET-1.3 · "📋 Yapılan Miktarlar" salt okunur tablosunun SAF türevleri.
 *
 * Kural A (kullanıcı kararı): ÖNCE açık bölümün satırları + ara toplam, SONRA
 * "Diğer bölümler · aynı gün" (soluk, AÇIK — S5), altta günün toplamı ve
 * "Bugünkü Hakediş Katkısı" (K16). Tutarlar YANITTAN okunur: satır tutarı
 * `line_amount`, gün toplamı `lines_total`; yalnız bölüm ara toplamı satır
 * tutarlarının toplamıdır (backend bölüm payını taşımıyor).
 *
 * 🔴 §2.7: planlama (kazanılmış/PF) burada YOK — uzantı yuvasıyla gelir.
 */
export interface DetailLineRow {
  lineId: string;
  boqItemId: string | null;
  sectionId: string | null;
  name: string;
  code: string;
  /** Satırın bölümü ("Kat 1–5") ya da "Bölümsüz". */
  sectionLabel: string;
  unit: string;
  /** IZN-F4d.2 — `null` = gizli (maskeli rol); 0 DEĞİL. */
  unitPrice: string | null;
  today: string;
  cumulative: string;
  planned: string | null;
  remaining: string | null;
  /** Planlı aşıldıysa aşım miktarı (İ:236-237); aşılmadıysa `null`. */
  overrunExcess: string | null;
  overrunReason: string | null;
  /** `null` = gizli. */
  amount: string | null;
}

export interface DetailCurrentGroup {
  sectionId: string;
  sectionName: string;
  rows: DetailLineRow[];
  /** Bu bölümün Hakediş ₺ ara toplamı; satırlardan biri gizliyse `null` (0 SAYILMAZ). */
  amountTotal: string | null;
}

export interface DetailLineGroups {
  /** Açık bölümün grubu; bölüm bağlamı yoksa `null` (Kural A kurulmaz). */
  current: DetailCurrentGroup | null;
  /** Diğer bölümlerin satırları — bağlam yoksa TÜM satırlar. */
  others: DetailLineRow[];
  totalCount: number;
  /** Günün tümü (`lines_total`); gizliyse `null`. */
  dayAmountTotal: string | null;
}

function isPositive(value: string): boolean {
  return !value.trim().startsWith("-") && !isZeroDecimalString(value);
}

function toRow(line: SiteDiaryLineRead): DetailLineRow {
  const cumulative = line.leaf_cumulative_quantity ?? line.cumulative_quantity;
  const planned = line.planned_quantity ?? null;
  const remaining = line.remaining_quantity ?? (planned === null ? null : subtractDecimalStrings(planned, cumulative));
  const excess = planned === null ? null : subtractDecimalStrings(cumulative, planned);
  return {
    lineId: line.id,
    boqItemId: line.boq_item_id,
    sectionId: line.section_id ?? null,
    name: line.description,
    code: line.code,
    sectionLabel: line.section_id ? (line.section_name ?? UNSECTIONED_LABEL) : UNSECTIONED_LABEL,
    unit: line.unit,
    unitPrice: line.unit_price,
    today: line.quantity,
    cumulative,
    planned,
    remaining,
    overrunExcess: excess !== null && isPositive(excess) ? excess : null,
    overrunReason: line.overrun_reason ?? null,
    amount: line.line_amount,
  };
}

export function buildDetailLineGroups(
  entry: Pick<SiteDiaryEntryDetail, "lines" | "lines_total">,
  current: DiaryDetailSection | undefined,
): DetailLineGroups {
  const rows = entry.lines.map(toRow);
  const base = { totalCount: rows.length, dayAmountTotal: entry.lines_total };
  if (current === undefined) return { ...base, current: null, others: rows };
  const mine = rows.filter((row) => row.sectionId === current.id);
  return {
    ...base,
    current: {
      sectionId: current.id,
      sectionName: current.name,
      rows: mine,
      amountTotal: sumDecimalStrings(mine.map((row) => row.amount)),
    },
    others: rows.filter((row) => row.sectionId !== current.id),
  };
}
