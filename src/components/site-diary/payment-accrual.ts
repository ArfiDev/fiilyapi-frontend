import { computeGrossProfit } from "@/components/progress-payments/shared/margin";
import { computeSiteSubcontractorTotals } from "@/components/progress-payments/shared/site-subcontractor-totals";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import { sumDecimalStrings } from "@/lib/decimal";
import { listTruncationMessage, type ListTruncation } from "@/lib/list-truncation";
import type { ProgressPaymentListItem } from "@/lib/api/hooks/useProgressPayments";
import type { SiteSubcontractorPaymentItem } from "@/lib/api/hooks/useSiteSubcontractorPayments";

/**
 * GK387-413 · "💰 <Ay> Hakediş Birikimi" kartının SAF türevleri.
 *
 * Backend'de AYLIK, çapraz-modül bir birikim ucu YOKTUR; kart iki listeden
 * türetilir (F-TH deseninin aynısı — `SiteProgressPaymentsView`):
 *   - işveren: `GET /progress-payments?project_id=…` (hakediş PROJE düzeyi bir
 *     kayıttır — F-TH kararı S4; şantiye kırılımı satırdadır, bu yüzden
 *     `site_id` süzmesi KULLANILMAZ ve kart bunu görünür bir notla söyler)
 *   - taşeron: `useSiteSubcontractorPayments` (U2, sunucuda `site_id` süzmesi)
 * Ay süzmesi İSTEMCİDE yapılır: iki liste öğesi de dönem taşır (işveren
 * ucunda dönem query parametresi yoktur).
 *
 * KORKULUK (F-TH kararı S2 + final inceleme F-3): taşeron listesi sunucu
 * tavanında KIRPILDIYSA ya da uç hata verdiyse taşeron satırları ve brüt kâr
 * SESSİZCE BASILMAZ — `pendingReason` dolar, çağıran görünür gerekçe gösterir.
 */

export interface DiaryAccrualInput {
  employerItems: readonly ProgressPaymentListItem[];
  isEmployerLoading: boolean;
  isEmployerError: boolean;
  subcontractorItems: readonly SiteSubcontractorPaymentItem[];
  isSubcontractorLoading: boolean;
  isSubcontractorError: boolean;
  subcontractorTruncation: ListTruncation;
  year: number;
  month: number;
}

export interface DiaryAccrualSubcontractorRow {
  /** GK395: "Taşeron — Akın İnşaat". */
  name: string;
  /** `null` = taşeronun en az bir hakedişi rol için gizli (IZN-F4b.2) — toplam bilinmez, 0 sayılmaz. */
  grossTotal: string | null;
}

export interface DiaryAccrual {
  /** GK391 — işveren brüt toplamı; `null` ise basılmaz (pending). */
  employerTotal: string | null;
  /** İşveren satırının neden basılmadığı — GÖRÜNÜR metin. */
  employerPendingReason: string | null;
  /** GK395-403 — taşeron başına brüt toplam; `null` ise güvenilmez (pending). */
  subcontractorRows: DiaryAccrualSubcontractorRow[] | null;
  /** Taşeron satırlarının/kârın neden basılmadığı — GÖRÜNÜR metin. */
  subcontractorPendingReason: string | null;
  /** GK410 "Brüt Kar (Bu Ay)" — `null` ise basılmaz (pending). */
  grossProfit: string | null;
}

/**
 * İki liste şemasında da `period_year`/`period_month` NULLABLE'dır. Dönemi
 * olmayan hakediş bir aya atfedilemez — bu yüzden aylık birikime GİRMEZ
 * (sessiz atlama değil: onlar zaten "bu ay" değildir).
 */
function isInPeriod(
  year: number,
  month: number,
  itemYear: number | null,
  itemMonth: number | null,
): boolean {
  return itemYear === year && itemMonth === month;
}

export function computeDiaryAccrual(input: DiaryAccrualInput): DiaryAccrual {
  const loadReason = employerReason(input);
  const employerTotal =
    loadReason !== null
      ? null
      : sumDecimalStrings(
          input.employerItems
            .filter((item) => isInPeriod(input.year, input.month, item.period_year, item.period_month))
            .map((item) => item.gross_total),
        );
  // 🔴 IZN-F4b.2: toplam `null` ise (yükleme/hata YOKKEN) bir hakediş tutarı rol için gizlidir.
  const employerPendingReason =
    loadReason ?? (employerTotal === null ? HIDDEN_FIELD_HINT : null);

  const subcontractorPendingReason = subcontractorReason(input);
  if (subcontractorPendingReason !== null) {
    return {
      employerTotal,
      employerPendingReason,
      subcontractorRows: null,
      subcontractorPendingReason,
      grossProfit: null,
    };
  }

  const monthItems = input.subcontractorItems.filter((item) =>
    isInPeriod(input.year, input.month, item.periodYear, item.periodMonth),
  );
  const subcontractorRows = groupBySubcontractor(monthItems);
  const { grossTotal } = computeSiteSubcontractorTotals([...monthItems]);
  const grossProfit =
    employerTotal === null ? null : computeGrossProfit(employerTotal, grossTotal, true);

  return {
    employerTotal,
    employerPendingReason,
    subcontractorRows,
    subcontractorPendingReason: null,
    grossProfit,
  };
}

/**
 * Aynı taşeronun BİRDEN ÇOK hakedişi tek satırda toplanır (mockup satır başına
 * bir taşeron gösterir). Sıra: tutarı büyükten küçüğe, eşitlikte ada göre —
 * kart her yüklemede AYNI sırayı basar.
 */
function groupBySubcontractor(
  items: readonly SiteSubcontractorPaymentItem[],
): DiaryAccrualSubcontractorRow[] {
  const byName = new Map<string, (string | null)[]>();
  for (const item of items) {
    byName.set(item.subcontractorName, [
      ...(byName.get(item.subcontractorName) ?? []),
      item.grossTotal,
    ]);
  }
  return [...byName.entries()]
    .map(([name, totals]) => ({ name, grossTotal: sumDecimalStrings(totals) }))
    .sort(
      (a, b) => amountForSort(b.grossTotal) - amountForSort(a.grossTotal) || a.name.localeCompare(b.name, "tr"),
    );
}

/** Gizli (null) tutar sıralamada SONA düşer; `Number(null)` 0 olup gerçek sıfırla karışırdı. */
function amountForSort(value: string | null): number {
  return value === null ? Number.NEGATIVE_INFINITY : Number(value);
}

function employerReason(input: DiaryAccrualInput): string | null {
  if (input.isEmployerLoading) return "İşveren hakedişleri yükleniyor…";
  if (input.isEmployerError) return "İşveren hakedişleri yüklenemedi — tutar gösterilemiyor.";
  return null;
}

function subcontractorReason(input: DiaryAccrualInput): string | null {
  if (input.isSubcontractorLoading) return "Taşeron hakedişleri yükleniyor…";
  if (input.isSubcontractorError) {
    return "Taşeron hakedişleri yüklenemedi — taşeron ödemeleri ve brüt kâr gösterilemiyor.";
  }
  if (input.subcontractorTruncation.isTruncated) {
    return `${listTruncationMessage(input.subcontractorTruncation)} Taşeron ödemeleri ve brüt kâr bu yüzden gösterilmiyor.`;
  }
  return null;
}
