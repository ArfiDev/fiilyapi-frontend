import { computeGrossMargin } from "@/components/progress-payments/shared/margin";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import { sumDecimalStrings } from "@/lib/decimal";
import { asPercent, type Percent } from "@/lib/api/scale";

import type { DiaryAccrual } from "./payment-accrual";

/**
 * F-SD T4 · "Hakediş Özeti" modunun (mockup `Şantiye - Hakediş Özeti.dc.html`,
 * kısaltma HÖ) KPI şeridi + karlılık panelinin SAF türevleri.
 *
 * Aylık işveren/taşeron toplamları ve brüt kâr YENİDEN HESAPLANMAZ: T3'ün
 * `computeDiaryAccrual`ı zaten bu üçünü kuruş hassasiyetiyle ve F-TH
 * korkuluklarıyla (kırpılma/hata → `null` + görünür gerekçe) üretir. Bu modül
 * yalnız HÖ'nün EK türevlerini ekler:
 *   - HÖ103 "Sözleşmenin %18,75'i"  → aylık işveren tutarının sözleşme bedeline oranı
 *   - HÖ108 "4 taşeron · %55,2"     → tekil taşeron sayısı + işveren tutarına oranı
 *   - HÖ113 "%44,8 marj"            → `computeGrossMargin` (F-TH'nin tek kaynağı)
 *   - HÖ117-119 "₺8,4M / %75"       → kümülatif hakediş + ilerleme çubuğu
 *   - HÖ194/199/204                 → taşeron çubuklarının genişlik yüzdeleri
 *
 * KORKULUK: bir oranın paydası yoksa/sıfırsa ya da kaynak veri pending ise
 * sayı UYDURULMAZ — `null` döner, çağıran görünür gerekçeyi basar.
 */

/** Sözleşme bedeli / kümülatif toplam — `ProgressPaymentSummary`den. */
export interface DiarySummaryKpiInput {
  /** T3'ün ay-süzmeli türevleri (işveren toplamı, taşeron satırları, brüt kâr). */
  accrual: DiaryAccrual;
  /** `ProgressPaymentSummary.contract_amount` — sözleşmesiz projede `null`. */
  contractAmount: string | null;
  /** `ProgressPaymentSummary.cumulative_gross`. */
  cumulativeGross: string | null;
  /** `ProgressPaymentSummary.progress_pct` — backend türevi, yeniden hesaplanmaz. */
  progressPct: Percent | null;
  isSummaryLoading: boolean;
  isSummaryError: boolean;
}

/** HÖ190-204 · taşeron başına bir satır + altındaki çubuk. */
export interface DiarySummarySubcontractorBar {
  name: string;
  /** `null` = gizli (IZN-F4b.2). */
  grossTotal: string | null;
  /** Çubuk genişliği (0-100 arası, CSS `width`). Oran hesaplanamazsa `0`. */
  widthPct: number;
}

export interface DiarySummaryKpis {
  /** HÖ102 — aylık işveren brüt toplamı; `null` ⇒ pending. */
  employerTotal: string | null;
  employerPendingReason: string | null;
  /** HÖ103 — sözleşme bedeline oran ("18.75"); `null` ⇒ basılmaz. */
  employerContractSharePct: Percent | null;
  /** Oranın neden basılmadığı (GÖRÜNÜR metin) — sözleşme bedeli yoksa. */
  employerContractShareReason: string | null;

  /** HÖ107 — aylık taşeron brüt toplamı; `null` ⇒ pending. */
  subcontractorTotal: string | null;
  /** HÖ108 "4 taşeron" — tekil taşeron sayısı; `null` ⇒ pending. */
  subcontractorCount: number | null;
  /** HÖ108 "%55,2" — işveren tutarına oran; `null` ⇒ basılmaz. */
  subcontractorSharePct: Percent | null;
  subcontractorPendingReason: string | null;
  /** HÖ190-204 — panel çubukları (tutara göre azalan; `payment-accrual` sırası). */
  subcontractorBars: DiarySummarySubcontractorBar[];

  /** HÖ112 / HÖ219 — brüt kâr tutarı; `null` ⇒ pending. */
  grossProfit: string | null;
  /** HÖ113 / HÖ220 "%44,8 marj"; `null` ⇒ basılmaz. */
  grossMarginPct: Percent | null;
  /** HÖ216 "2.100.000 − 1.160.000" alt satırının iki terimi; biri yoksa `null`. */
  profitFormula: { employer: string; subcontractor: string } | null;

  /** HÖ117 — kümülatif hakediş; `null` ⇒ pending. */
  cumulativeGross: string | null;
  /** HÖ118 "Sözleşmenin %75'i"; `null` ⇒ basılmaz. */
  cumulativeProgressPct: Percent | null;
  /** HÖ119 ilerleme çubuğu genişliği (0-100). */
  cumulativeWidthPct: number;
  cumulativePendingReason: string | null;
}

/** Payda `0`/sayı değilse oran UYDURULMAZ. Sonuç iki ondalıklı string. */
function ratioPct(part: string, whole: string): Percent | null {
  const wholeValue = Number(whole);
  const partValue = Number(part);
  if (!Number.isFinite(wholeValue) || wholeValue === 0) return null;
  if (!Number.isFinite(partValue)) return null;
  // toPoints dönüşü — kanonik ×100 türetimi (bkz. escape-hatch-inventory-guard).
  return asPercent(((partValue / wholeValue) * 100).toFixed(2));
}

/** CSS genişliği: 0-100 arasına kırpılır; hesaplanamayan oran `0` basar. */
export function clampWidthPct(value: Percent | string | null): number {
  if (value === null) return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(Math.max(numeric, 0), 100);
}

export function computeDiarySummaryKpis(input: DiarySummaryKpiInput): DiarySummaryKpis {
  const { accrual } = input;

  // Taşeron toplamı satırlardan toplanır (`Number` toplamı YASAK — kuruş
  // hassasiyeti). Satırlar pending ise toplam da yoktur.
  const subcontractorTotal =
    accrual.subcontractorRows === null
      ? null
      : sumDecimalStrings(accrual.subcontractorRows.map((row) => row.grossTotal));

  const employerContractShareReason = contractShareReason(input);
  const employerContractSharePct =
    accrual.employerTotal !== null && input.contractAmount !== null
      ? ratioPct(accrual.employerTotal, input.contractAmount)
      : null;

  const subcontractorSharePct =
    subcontractorTotal !== null && accrual.employerTotal !== null
      ? ratioPct(subcontractorTotal, accrual.employerTotal)
      : null;

  const grossMarginPct =
    accrual.employerTotal !== null && subcontractorTotal !== null
      ? computeGrossMargin(accrual.employerTotal, subcontractorTotal, true)
      : null;

  const cumulativePendingReason = cumulativeReason(input);
  const cumulativeGross = cumulativePendingReason === null ? input.cumulativeGross : null;
  const cumulativeProgressPct = cumulativePendingReason === null ? input.progressPct : null;

  return {
    employerTotal: accrual.employerTotal,
    employerPendingReason: accrual.employerPendingReason,
    employerContractSharePct,
    employerContractShareReason,

    subcontractorTotal,
    subcontractorCount: accrual.subcontractorRows?.length ?? null,
    subcontractorSharePct,
    // 🔴 IZN-F4b.2: satırlar var ama toplam null ise bir taşeron tutarı rol için gizlidir.
    subcontractorPendingReason:
      accrual.subcontractorPendingReason ??
      (subcontractorTotal === null && accrual.subcontractorRows !== null && accrual.subcontractorRows.length > 0
        ? HIDDEN_FIELD_HINT
        : null),
    subcontractorBars: buildBars(accrual, accrual.employerTotal),

    grossProfit: accrual.grossProfit,
    grossMarginPct,
    profitFormula:
      accrual.employerTotal !== null && subcontractorTotal !== null
        ? { employer: accrual.employerTotal, subcontractor: subcontractorTotal }
        : null,

    cumulativeGross,
    cumulativeProgressPct,
    cumulativeWidthPct: clampWidthPct(cumulativeProgressPct),
    cumulativePendingReason,
  };
}

/**
 * HÖ194/199/204 · çubuk genişliği taşeron tutarının AYLIK İŞVEREN TUTARINA
 * oranıdır (mockup: 640.000/2.100.000 ≈ %30, 320.000 ≈ %15, 200.000 ≈ %9).
 * İşveren tutarı yoksa çubuklar sıfır genişlikte basılır — satırın kendisi
 * (isim + tutar) yine görünür.
 */
function buildBars(
  accrual: DiaryAccrual,
  employerTotal: string | null,
): DiarySummarySubcontractorBar[] {
  if (accrual.subcontractorRows === null) return [];
  return accrual.subcontractorRows.map((row) => ({
    name: row.name,
    grossTotal: row.grossTotal,
    widthPct:
      employerTotal === null || row.grossTotal === null
        ? 0
        : clampWidthPct(ratioPct(row.grossTotal, employerTotal)),
  }));
}

function contractShareReason(input: DiarySummaryKpiInput): string | null {
  if (input.isSummaryLoading) return "Sözleşme bedeli yükleniyor…";
  if (input.isSummaryError) return "Sözleşme bedeli okunamadı — oran gösterilemiyor.";
  if (input.contractAmount === null) {
    return "Projede sözleşme bedeli tanımlı değil — oran gösterilemiyor.";
  }
  return null;
}

function cumulativeReason(input: DiarySummaryKpiInput): string | null {
  if (input.isSummaryLoading) return "Kümülatif hakediş yükleniyor…";
  if (input.isSummaryError) return "Kümülatif hakediş yüklenemedi — tutar gösterilemiyor.";
  return null;
}
