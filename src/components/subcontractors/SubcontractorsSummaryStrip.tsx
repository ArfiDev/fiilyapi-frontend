import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCompactCurrency } from "@/lib/format";

import type { SubcontractorSummary } from "./subcontractor-aggregate";
import { PAYMENT_PENDING_REASON } from "./pending-reasons";
import "./subcontractors.css";

/**
 * TL 34-38 · dört KPI kartı. Etiket/sıra/renk mockup'tan BİREBİR:
 * - 35 "TOPLAM TAŞERON"  nötr    (mono YOK) → firma sayısı
 * - 36 "AKTİF SÖZLEŞME"  yeşil   (mono YOK) → aktif sözleşme sayısı
 * - 37 "BU AY ÖDEME"     KIRMIZI + mono     → içinde bulunulan dönemin hakedişleri
 * - 38 "ONAY BEKLEYEN"   kehribar (mono YOK) → "3 Hakediş" biçiminde
 *
 * 37 ve 38 hakediş listesinden türer; liste sunucu tavanında kırpılırsa
 * yanlış toplam BASILMAZ, "—" + görünür gerekçe gösterilir (F-TH korkuluğu).
 */
export interface SubcontractorsSummaryStripProps {
  summary: SubcontractorSummary;
  /**
   * Firma/sözleşme sorgusu yükleniyor/hatalıyken `true` — `summary.totalCount`
   * ve `activeContractCount` bu durumda sunucudan DEĞİL boş varsayılan
   * dizilerden türer; sahte sıfır basmak yerine "—" gösterilir (kalan-6 no 322).
   */
  isPending?: boolean;
}

const PAYMENT_COUNT_SUFFIX = "Hakediş"; // 38 "3 Hakediş"
const COUNT_PENDING_REASON = "Taşeron/sözleşme listesi henüz yüklenmedi.";

export function SubcontractorsSummaryStrip({
  summary,
  isPending = false,
}: SubcontractorsSummaryStripProps) {
  const isHidden = useCategoryHidden(SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES);
  return (
    <div className="tl-kpi" data-testid="tl-kpi-strip">
      <div className="tl-kpi__card">
        <div className="tl-kpi__label">Toplam Taşeron</div>
        {isPending ? (
          <PendingValue testId="tl-kpi-total-count" reason={COUNT_PENDING_REASON} />
        ) : (
          <div className="tl-kpi__value tl-kpi__value--neutral">{summary.totalCount}</div>
        )}
      </div>

      <div className="tl-kpi__card">
        <div className="tl-kpi__label">Aktif Sözleşme</div>
        {isPending ? (
          <PendingValue testId="tl-kpi-active-count" reason={COUNT_PENDING_REASON} />
        ) : (
          <div className="tl-kpi__value tl-kpi__value--success">
            {summary.activeContractCount}
          </div>
        )}
      </div>

      <div className="tl-kpi__card">
        <div className="tl-kpi__label">Bu Ay Ödeme</div>
        {summary.monthPaymentTotal === null ? (
          <PendingValue
            testId="tl-kpi-month-payment"
            reason={summary.isMonthPaymentMasked ? HIDDEN_FIELD_HINT : undefined}
            mark={summary.isMonthPaymentMasked && isHidden}
          />
        ) : (
          <div
            className="tl-kpi__value tl-kpi__value--danger tl-kpi__value--mono"
            data-testid="tl-kpi-month-payment"
          >
            {formatCompactCurrency(summary.monthPaymentTotal)}
          </div>
        )}
      </div>

      <div className="tl-kpi__card">
        <div className="tl-kpi__label">Onay Bekleyen</div>
        {summary.pendingApprovalCount === null ? (
          <PendingValue testId="tl-kpi-pending-approval" />
        ) : (
          <div
            className="tl-kpi__value tl-kpi__value--warning"
            data-testid="tl-kpi-pending-approval"
          >
            {summary.pendingApprovalCount} {PAYMENT_COUNT_SUFFIX}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingValue({
  testId,
  reason = PAYMENT_PENDING_REASON,
  mark = false,
}: {
  testId: string;
  reason?: string;
  /** IZN-F4b.2 — gizli (rol maskesi) nedeniyle bilinmiyorsa kilit ipucu. */
  mark?: boolean;
}) {
  return (
    <div className="tl-kpi__value tl-kpi__value--pending" title={reason} data-testid={testId}>
      —<span className="sr-only">{reason}</span>
      <MaskedMark isHidden={mark} values={[null]} />
    </div>
  );
}
