import type { components } from "@/lib/api/schema";
import { formatCurrency } from "@/lib/format";

import { CardEmptyState } from "./CardEmptyState";
import "./dashboard.css";
import type { DeepScale } from "@/lib/api/scale";

// NOT: DASH-1 devri (backend 859ebfb) ile panelin kendi MetricPlaceholder kopyasi
// silinip kanonik projects zarfi re-export edildi; iki nitelenmis sema tek
// "MetricPlaceholder" adinda birlesti.
type MetricPlaceholder = DeepScale<components["schemas"]["MetricPlaceholder"]>;

export function PortfolioCard({ metric }: { metric: MetricPlaceholder }) {
  return (
    <section className="dash-card dash-portfolio">
      <h2 className="dash-card__label">Portföy · Toplam Hakediş</h2>
      {metric.available && metric.value !== null && metric.value !== undefined ? (
        <p className="dash-portfolio__value">{formatCurrency(metric.value)}</p>
      ) : (
        <CardEmptyState
          title="Henüz hakediş verisi yok"
          pendingModule={metric.pending_module}
        />
      )}
      {/* Mockup'taki alan grafigi kutusu; veri gelene kadar bos cizim alani. */}
      <svg
        className="dash-portfolio__chart"
        viewBox="0 0 500 80"
        preserveAspectRatio="none"
        aria-hidden="true"
      />
    </section>
  );
}
