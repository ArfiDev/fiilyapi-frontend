import type { components } from "@/lib/api/schema";
import { formatCompactCurrency } from "@/lib/format";

import { CardEmptyState } from "./CardEmptyState";
import "./dashboard.css";
import type { DeepScale } from "@/lib/api/scale";

// NOT: DASH-1 devri (backend 859ebfb) ile panelin kendi MetricPlaceholder kopyasi
// silinip kanonik projects zarfi re-export edildi; iki nitelenmis sema tek
// "MetricPlaceholder" adinda birlesti.
type MetricPlaceholder = DeepScale<components["schemas"]["MetricPlaceholder"]>;

export function KpiCard({
  label,
  emptyTitle,
  metric,
}: {
  label: string;
  emptyTitle: string;
  metric: MetricPlaceholder;
}) {
  return (
    <section className="dash-card dash-kpi">
      <h2 className="dash-card__label">{label}</h2>
      {metric.available && metric.value !== null && metric.value !== undefined ? (
        <p className="dash-kpi__value">{formatCompactCurrency(metric.value)}</p>
      ) : (
        <CardEmptyState title={emptyTitle} pendingModule={metric.pending_module} />
      )}
      <div className="dash-bar dash-bar--kpi">
        <div className="dash-bar__fill" style={{ width: "0%" }} />
      </div>
    </section>
  );
}
