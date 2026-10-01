import { formatCompactCurrency, formatQuantity } from "@/lib/format";
import type { SectionDistributionSectionSummary } from "@/lib/api/hooks/useSectionDistribution";
import { distributionSiteAccent } from "../contracts/distribution-derive";

import "../contracts/contract-distribution.css";

/**
 * BDG · bölüm özeti kartları (sözleşme `…SiteSummaries`ın karşılığı). Birim
 * artık şemada (`unit`) — sözleşmedeki kod-join'i YOK. Maskeli (`null`) miktar
 * ve toplam "—" basılır, birim eklenmez. Accent sırası sözleşmeyle aynı.
 */
export interface SectionSummariesProps {
  summaries: readonly SectionDistributionSectionSummary[];
}

export function SectionSummaries({ summaries }: SectionSummariesProps) {
  if (summaries.length === 0) return null;

  return (
    <div className="cdist-summaries">
      {summaries.map((summary, index) => (
        <section
          key={summary.section_id}
          className={`cdist-summary cdist-accent-${distributionSiteAccent(index)}`}
          aria-labelledby={`bdg-summary-${summary.section_id}`}
          data-testid="bdg-summary-card"
        >
          <h2 className="cdist-summary__title" id={`bdg-summary-${summary.section_id}`}>
            {summary.section_name} — Bölüm Özeti
          </h2>

          <div className="cdist-summary__rows">
            {summary.items.length === 0 ? (
              <p className="cdist-summary__empty">Bu bölüme henüz miktar atanmadı.</p>
            ) : (
              summary.items.map((item) => (
                <div className="cdist-summary__row" key={item.boq_item_id}>
                  <span className="cdist-summary__row-label">{item.description}</span>
                  <span className="cdist-summary__row-value" data-testid="bdg-summary-qty">
                    {item.quantity === null
                      ? formatQuantity(null)
                      : `${formatQuantity(item.quantity)} ${item.unit}`}
                  </span>
                </div>
              ))
            )}
            <div className="cdist-summary__total">
              <span>{summary.section_name} Toplam Bedel</span>
              <span className="cdist-summary__total-value" data-testid="bdg-summary-total">
                {formatCompactCurrency(summary.total_amount)}
              </span>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
