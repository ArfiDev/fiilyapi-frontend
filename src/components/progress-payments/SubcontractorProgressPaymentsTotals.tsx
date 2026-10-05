import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCompactCurrency } from "@/lib/format";
import type { SubcontractorProgressPaymentSummary } from "@/lib/api/hooks/useSubcontractorProgressPayments";

import "./subcontractor-progress-payments.css";

/**
 * KPI şeridi (brief §KPI kartları, mockup satır 105-122) — DÖRT kart, hepsi
 * `SubcontractorProgressPaymentSummary`den gelir (üçü zarif düşüşle ilgisi
 * YOK — bu şema alanların TAMAMINI taşıyor, `ProgressPaymentsTotalsStrip`teki
 * gibi bir pending kart burada YOK). Renkler mockup'ta karta özel: Toplam
 * nötr, Onay Bekliyor amber, Bu Ay Ödenen yeşil, Aktif Taşeron nötr — dört
 * kartın hepsi AYNI nötr rengi kullanan işveren şeridinden (`ppt__value`)
 * FARKLI olduğundan yeni sınıf ailesi (`thk-kpi`) kullanılır, `ppt`
 * KOPYALANMAZ.
 */
export interface SubcontractorProgressPaymentsTotalsProps {
  summary?: SubcontractorProgressPaymentSummary;
}

interface KpiCard {
  label: string;
  value: string;
  /** IZN-F4b.2 — kaynak değer `null` (rol için gizli) → kart değeri `—`. */
  raw: string | number | null;
  tone: "neutral" | "warning" | "success";
}

function cardsFrom(summary: SubcontractorProgressPaymentSummary): KpiCard[] {
  return [
    { label: "Toplam Hakediş", value: formatCompactCurrency(summary.total_gross), raw: summary.total_gross, tone: "neutral" },
    { label: "Onay Bekliyor", value: formatCompactCurrency(summary.pending_gross), raw: summary.pending_gross, tone: "warning" },
    { label: "Bu Ay Ödenen", value: formatCompactCurrency(summary.paid_period_gross), raw: summary.paid_period_gross, tone: "success" },
    { label: "Aktif Taşeron", value: String(summary.active_subcontractor_count), raw: 0, tone: "neutral" },
  ];
}

export function SubcontractorProgressPaymentsTotals({
  summary,
}: SubcontractorProgressPaymentsTotalsProps) {
  const isHidden = useCategoryHidden(SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES);
  if (!summary) return null;

  return (
    <div className="thk-kpi" data-testid="thk-kpi-strip">
      {cardsFrom(summary).map((card) => (
        <div key={card.label} className="thk-kpi__card">
          <div className="thk-kpi__label">{card.label}</div>
          <div className={`thk-kpi__value thk-kpi__value--${card.tone}`} data-testid="thk-kpi-value">
            {card.value}
            <MaskedMark isHidden={isHidden} values={[card.raw]} />
          </div>
        </div>
      ))}
    </div>
  );
}
