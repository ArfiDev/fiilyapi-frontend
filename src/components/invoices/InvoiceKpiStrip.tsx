import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { INVOICE_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCompactCurrencyTight } from "@/lib/format";
import type { InvoiceSummaryResponse } from "@/lib/api/hooks/useInvoices";

import { vatDifferenceHint } from "./invoice-labels";

/**
 * FY:69-75 KPI şeridi — BEŞ kart, mockup sırasıyla.
 *
 * 🔴 İlk üç kart {tutar, adet} ÇİFTİ taşır (`InvoiceSummaryMetric`);
 * "Onay Bekleyen" (FY:74) ADETTİR, tutar değildir ve `₺` BASILMAZ.
 * "KDV Farkı" (FY:73) tek para değeridir ve NEGATİF olabilir (devreden KDV) —
 * sıfıra KIRPILMAZ, eksi işaretiyle basılır.
 *
 * Veri gelmeden sayı UYDURULMAZ: kart iskeleti durur, değer yerine "—" basılır.
 */
export function InvoiceKpiStrip({ summary }: { summary: InvoiceSummaryResponse | undefined }) {
  const dash = "—";
  const isHidden = useCategoryHidden(INVOICE_HIDDEN_CATEGORIES);
  return (
    <div className="fat-kpis" data-testid="fat-kpis">
      {/* FY:70 */}
      <div className="fat-kpi fat-kpi--success" data-testid="fat-kpi-issued">
        <div className="fat-kpi__label">Kesilen (Bu Ay)</div>
        <div className="fat-kpi__value fat-kpi__value--success">
          {summary ? formatCompactCurrencyTight(summary.issued_this_month.amount) : dash}
          <MaskedMark isHidden={isHidden} values={[summary?.issued_this_month.amount]} />
        </div>
        <div className="fat-kpi__hint">
          {summary ? `${summary.issued_this_month.count} fatura` : dash}
        </div>
      </div>

      {/* FY:71 */}
      <div className="fat-kpi fat-kpi--danger" data-testid="fat-kpi-received">
        <div className="fat-kpi__label">Gelen (Bu Ay)</div>
        <div className="fat-kpi__value fat-kpi__value--danger">
          {summary ? formatCompactCurrencyTight(summary.received_this_month.amount) : dash}
          <MaskedMark isHidden={isHidden} values={[summary?.received_this_month.amount]} />
        </div>
        <div className="fat-kpi__hint">
          {summary ? `${summary.received_this_month.count} fatura` : dash}
        </div>
      </div>

      {/* FY:72 */}
      <div className="fat-kpi" data-testid="fat-kpi-receivable">
        <div className="fat-kpi__label">Tahsil Edilecek</div>
        <div className="fat-kpi__value fat-kpi__value--warning">
          {summary ? formatCompactCurrencyTight(summary.receivable.amount) : dash}
          <MaskedMark isHidden={isHidden} values={[summary?.receivable.amount]} />
        </div>
        <div className="fat-kpi__hint">
          {summary ? `${summary.receivable.count} fatura vadeli` : dash}
        </div>
      </div>

      {/* FY:73 */}
      <div className="fat-kpi" data-testid="fat-kpi-vat">
        <div className="fat-kpi__label">KDV Farkı</div>
        <div className="fat-kpi__value fat-kpi__value--primary">
          {summary ? formatCompactCurrencyTight(summary.vat_difference) : dash}
          <MaskedMark isHidden={isHidden} values={[summary?.vat_difference]} />
        </div>
        <div className="fat-kpi__hint">
          {summary ? vatDifferenceHint(summary.vat_difference) : "Ödenecek KDV"}
        </div>
      </div>

      {/* FY:74 — ADET, para DEĞİL. */}
      <div className="fat-kpi fat-kpi--warning" data-testid="fat-kpi-pending">
        <div className="fat-kpi__label">Onay Bekleyen</div>
        <div className="fat-kpi__value fat-kpi__value--count">
          {summary ? summary.pending_approval : dash}
        </div>
        <div className="fat-kpi__hint">Gelen fatura</div>
      </div>
    </div>
  );
}
