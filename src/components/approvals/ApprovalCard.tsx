"use client";

import Link from "next/link";

import { Badge, Button } from "@/components/ui";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { cx } from "@/lib/cx";
import { formatDateLong, toIstanbulDateOnly } from "@/lib/format";
import type {
  ApprovalHistoryItem,
  ApprovalInboxItem,
} from "@/lib/api/hooks/useApprovals";

import { ApprovalStepStrip } from "./ApprovalStepStrip";
import {
  APPROVAL_APPROVE_LABEL,
  APPROVAL_REJECT_LABEL,
  APPROVAL_UNKNOWN_TYPE_REASON,
  UNKNOWN_VALUE,
  approvalAmountCategories,
  approvalAmountLabel,
  approvalDecisionBadge,
  approvalDecisionLine,
  approvalDetailTarget,
  approvalDocumentPresentation,
  approvalLinkChip,
  approvalNeedsPatron,
  approvalReasonLine,
  approvalSubtitleLabel,
  approvalThresholdBadgeLabel,
  isKnownApprovalDocumentType,
} from "./approval-labels";
import "./approvals.css";

/** Bekleyen kart (Benim Onayım) — Onayla/Reddet düğmeleri var. */
interface PendingApprovalCardProps {
  item: ApprovalInboxItem;
  mode?: "pending";
  isPending: boolean;
  onApprove: (item: ApprovalInboxItem) => void;
  onReject: (item: ApprovalInboxItem) => void;
}

/**
 * OKT-F1.2 · Geçmiş kartı — AYNI iskelet, Onayla/Reddet yerine karar rozeti
 * (`decision` + `decided_by` + `decided_at` + ret `reason`). Kopya kart YOK.
 */
interface HistoryApprovalCardProps {
  item: ApprovalHistoryItem;
  mode: "history";
}

export type ApprovalCardProps = PendingApprovalCardProps | HistoryApprovalCardProps;

/** Geçmiş kartının karar bloğu: rozet + `Karar: …` (+ ret ise `Gerekçe: …`). */
function ApprovalDecisionNote({ item }: { item: ApprovalHistoryItem }) {
  const badge = approvalDecisionBadge(item.decision, item.current_step_no);
  const showsDecision = item.decision !== "pending";
  const reasonLine = item.decision === "rejected" ? approvalReasonLine(item.reason) : null;

  return (
    <div className="ok-card__decision" data-testid="ok-card-decision">
      <Badge variant={badge.variant} className="ok-badge" data-testid="ok-card-decision-badge">
        {badge.label}
      </Badge>
      {showsDecision && (
        <p className="ok-card__decision-line" data-testid="ok-card-decision-by">
          {approvalDecisionLine(item.decided_by, item.decided_at)}
        </p>
      )}
      {reasonLine !== null && (
        <p className="ok-card__decision-line" data-testid="ok-card-decision-reason">
          {reasonLine}
        </p>
      )}
    </div>
  );
}

/**
 * Onay kutusu kartı — mockup `Onay Kutusu.dc.html:118-148` iskeleti (`:151-179`
 * ve `:209-238` aynı iskeletin iki varyantı).
 *
 * 🔴 BASILMAYANLAR ve ÖLÇÜLMÜŞ gerekçeleri:
 *   · `:87` `ACİL` rozeti — `ApprovalInboxItem`ta vade/son-ödeme alanı YOKTUR;
 *     aciliyeti türetecek bir taban da yok (K10: sunucu aciliyet ÜRETMEZ).
 *   · `:124` oluşturanın ROLÜ (`(Şantiye Şefi)`) — yanıtta yalnız
 *     `created_by_name` var, rol YOK.
 *   · `:106`/`:140` "⚠ Muhasebe Adımı / Sizden onay bekleniyor" kutusu — aynı
 *     bilgi adım şeridindeki `(Siz)` ile veriliyor ve `GET /approvals` YALNIZ
 *     bana düşen adımları döndürdüğü için "size düşmüyor" varyantı bu listede
 *     HİÇ OLUŞAMAZ.
 *   · `:174` alt satırı "En uygun: KarTaş ₺592K" ve `3 Teklif` sayısı —
 *     yanıtta YOK, uydurulmaz.
 *   · `:182-206` BORDRO/GÜNLÜK KAYIT kartı — `ApprovalDocumentType` o aileleri
 *     taşımaz.
 *   · `:110` "satırı DOM'dan sil" animasyonu — taklit EDİLMEZ; başarıda liste
 *     invalidate edilir, kaynak sunucudur.
 *
 * ⚠️ `:124` mockup'ta "2 gün önce" gibi GÖRELİ zaman yazar. `Date.now()`e
 * dayanan göreli zaman kareyi HER GÜN oynatırdı (görsel kapı kalıcı kırmızı) →
 * MUTLAK tarih basılır (`formatDateLong`). Onaylı sapma, raporlanır.
 */
export function ApprovalCard(props: ApprovalCardProps) {
  const { item } = props;
  const isAmountHidden = useCategoryHidden(approvalAmountCategories(item.document_type), item.project_id);
  const presentation = approvalDocumentPresentation(item.document_type);
  const detail = approvalDetailTarget(item.document_type, item.document_id);
  const chip = approvalLinkChip(item.document_type, item.document_id);
  const needsPatron = approvalNeedsPatron(item.steps);
  const subtitle = approvalSubtitleLabel(item.subtitle);
  const isHistory = props.mode === "history";
  // Bilinmeyen tip onay/ret düğmelerini devre dışı bırakır; geçmişte karar zaten verilmiştir.
  const canDecide = isHistory || isKnownApprovalDocumentType(item.document_type);
  // IZN-B3b: Onayla/Reddet GÖRÜNÜRLÜĞÜ sunucunun `can_decide`ındadır (projedeki
  // rol ataması). GECE KARARI: geçmiş kartı rozet modunda kalır, eylem YOK.
  const { Icon } = presentation;

  return (
    <article
      className={cx("ok-card", needsPatron && "ok-card--patron")}
      data-testid="ok-card"
      data-document-type={item.document_type}
    >
      <div className="ok-card__row">
        {/* :120 · 42x42 ikon kutusu — emoji DEĞİL SVG (glif yasağı). */}
        <span className={cx("ok-card__icon", presentation.iconClassName)} aria-hidden="true">
          <Icon width={20} height={20} />
        </span>

        <div className="ok-card__body">
          {/* :122-124 */}
          <div className="ok-card__meta-row">
            <Badge
              variant={presentation.badgeVariant}
              className={cx("ok-badge", presentation.badgeClassName)}
              data-testid="ok-card-type"
            >
              {presentation.badgeLabel}
            </Badge>
            {needsPatron && (
              <Badge
                variant="success"
                className="ok-badge ok-badge--esik"
                data-testid="ok-card-threshold"
              >
                {approvalThresholdBadgeLabel(item.threshold_snapshot)}
              </Badge>
            )}
            <span className="ok-card__meta" data-testid="ok-card-meta">
              {formatDateLong(toIstanbulDateOnly(item.created_at))} ·{" "}
              {item.created_by_name ?? UNKNOWN_VALUE}
            </span>
          </div>

          {/* :126 */}
          <p className="ok-card__title" data-testid="ok-card-title">
            {item.title ?? UNKNOWN_VALUE}
          </p>
          {/* :127 — dönem `MM/YYYY` gömülü gelir, Türkçeleştirilir. */}
          {subtitle !== null && <p className="ok-card__subtitle">{subtitle}</p>}

          {/* :129-135 */}
          <ApprovalStepStrip
            steps={item.steps}
            currentStepNo={item.current_step_no}
            canDecide={item.can_decide}
          />

          {/* :137-141 */}
          <div className="ok-amounts">
            <span className="ok-amount" data-testid="ok-card-gross">
              <span className="ok-amount__label">{presentation.grossLabel}</span>
              <span className="ok-amount__value">
                {approvalAmountLabel(item.gross_amount)}
                <MaskedMark isHidden={isAmountHidden} values={[item.gross_amount]} />
              </span>
            </span>
            {presentation.netLabel !== null && (
              <span className="ok-amount" data-testid="ok-card-net">
                <span className="ok-amount__label">{presentation.netLabel}</span>
                <span className="ok-amount__value">
                  {approvalAmountLabel(item.net_amount)}
                  <MaskedMark isHidden={isAmountHidden} values={[item.net_amount]} />
                </span>
              </span>
            )}
            {chip !== null && (
              <Link
                href={chip.href}
                className={cx(
                  "ok-chip",
                  item.document_type === "purchase_request" && "ok-chip--primary",
                )}
                data-testid="ok-card-chip"
              >
                {chip.label}
              </Link>
            )}
          </div>
        </div>

        {/* :143-146 */}
        <div className="ok-card__actions">
          {props.mode === "history" ? (
            <ApprovalDecisionNote item={props.item} />
          ) : (
            item.can_decide && (
              <>
                <Button
                  variant={item.document_type === "subcontractor_progress_payment" ? "success" : "primary"}
                  className={cx("ok-btn", presentation.approveClassName)}
                  disabled={props.isPending || !canDecide}
                  title={canDecide ? undefined : APPROVAL_UNKNOWN_TYPE_REASON}
                  onClick={() => props.onApprove(item)}
                  data-testid="ok-card-approve"
                >
                  {APPROVAL_APPROVE_LABEL}
                </Button>
                <Button
                  variant="secondary"
                  className="ok-btn ok-btn--reject"
                  disabled={props.isPending || !canDecide}
                  title={canDecide ? undefined : APPROVAL_UNKNOWN_TYPE_REASON}
                  onClick={() => props.onReject(item)}
                  data-testid="ok-card-reject"
                >
                  {APPROVAL_REJECT_LABEL}
                </Button>
              </>
            )
          )}
          {/* :145 · Detay — hedef rota `document_type`+`document_id`den kurulur.
              Rotası OLMAYAN (`purchase_request`) hedef SİLİNMEZ, devre-dışı +
              GÖRÜNÜR gerekçeyle basılır (F-TH kanonu). Düğme dili İCAT
              EDİLMEZ: `Link`e `btn btn--secondary btn--md` verilir (SalesView
              emsali). */}
          {detail.href !== null ? (
            <Link
              href={detail.href}
              className="btn btn--secondary btn--md ok-btn ok-btn--detail"
              data-testid="ok-card-detail"
            >
              {detail.label}
            </Link>
          ) : (
            <Button
              variant="secondary"
              className="ok-btn ok-btn--detail"
              disabled
              title={detail.reason ?? undefined}
              data-testid="ok-card-detail"
            >
              {detail.label}
              <span className="sr-only"> — {detail.reason}</span>
            </Button>
          )}
        </div>
      </div>

      {(detail.reason !== null || !canDecide) && (
        <p className="ok-card__reason" data-testid="ok-card-reason">
          {[detail.reason, canDecide ? null : APPROVAL_UNKNOWN_TYPE_REASON]
            .filter((part): part is string => part !== null)
            .join(" ")}
        </p>
      )}
    </article>
  );
}
