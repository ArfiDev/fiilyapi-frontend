"use client";

import Link from "next/link";

import { DeleteRecordButton } from "@/components/delete-confirm/DeleteRecordButton";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { Alert } from "@/components/ui/alert/Alert";
import { Badge } from "@/components/ui/badge/Badge";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { EMPLOYER_PAYMENT_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import {
  useProgressPayment,
  useProgressPaymentSummary,
  type ProgressPaymentDetail,
} from "@/lib/api/hooks/useProgressPayments";
import { isForbidden } from "@/lib/api/unwrap";
import { EMPLOYER_PAYMENT_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { cx } from "@/lib/cx";
import { formatCurrencyPrecise } from "@/lib/format";

import { PaymentCalculationCard } from "./PaymentCalculationCard";
import { PaymentGroupTable } from "./PaymentGroupTable";
import { PaymentProgressCard } from "./PaymentProgressCard";
import { ProgressPaymentStatusActions } from "./ProgressPaymentStatusActions";
import { PROGRESS_PAYMENT_STATUS_BADGE } from "./status";
import { formatPaymentTitle } from "./title";
import "./progress-payment-detail.css";
import { routes } from "@/lib/routes";

export interface ProgressPaymentDetailViewProps {
  paymentId: string;
}

// Ekran 15 · İşveren Hakedişi detayı (P7 T3+T4). Mockup
// `Ekran 15 - İşveren Hakedişi.dc.html` satır 61-193: breadcrumb + başlık
// şeridi (62-73), üç KPI kartı (79-92), kalem tablosu (94-145), Ödeme
// Hesabı (150-174) ve Sözleşme İlerlemesi (177-191) kartları. Durum aksiyon
// butonları (70-71: PDF/Onaya Gönder) mockup'ta YOK — kullanıcı kararı S1
// ile durum makinesinden türetildi (P7 T4 brief §Bağlam).
export function ProgressPaymentDetailView({ paymentId }: ProgressPaymentDetailViewProps) {
  const detailQuery = useProgressPayment(paymentId);
  const isAmountHidden = useCategoryHidden(EMPLOYER_PAYMENT_HIDDEN_CATEGORIES);
  // Özet sorgusu detay yüklenmeden ağa çıkmaz — hook'un `enabled` kapısı bos
  // id'yi zaten engelliyor (brief §Belirsizlik çözümü).
  const summaryQuery = useProgressPaymentSummary(detailQuery.data?.project_id ?? "");
  // IZN-F2.x · hakediş oluştur/düzenle = işveren hakediş ailesi Düzenler (IZN-F5b, HI).
  const canWrite = useButtonGate({
    pages: EMPLOYER_PAYMENT_EDIT,
    need: "edit",
    projectId: detailQuery.data?.project_id,
  });

  if (isForbidden(detailQuery.error)) return <AccessDenied />;
  if (detailQuery.isError) return <p className="pp-detail__message">Hakediş yüklenemedi</p>;
  if (detailQuery.isLoading || !detailQuery.data) {
    return <p className="pp-detail__message">Yükleniyor…</p>;
  }

  const detail = detailQuery.data;
  const badge = PROGRESS_PAYMENT_STATUS_BADGE[detail.status];
  // Özet hata verirse (403 dahil) SAYFA KIRILMAZ — yalnız özetten gelen iki
  // KPI basılmaz, geri kalan bölümler detay yanıtından normal render edilir
  // (brief §Belirsizlik çözümü).
  const summary = summaryQuery.isSuccess ? summaryQuery.data : undefined;
  const remaining = summary?.remaining ?? null;

  return (
    <div className="pp-detail">
      <p className="pp-detail__crumb">
        <Link href={routes.progressPayments.list()} className="pp-detail__crumb-link">
          ← Hakedişler
        </Link>
        {" · İşveren Hakedişi"}
      </p>

      <div className="pp-detail__header">
        <div>
          <h1 className="pp-detail__title">{formatPaymentTitle(detail)}</h1>
          <p className="pp-detail__meta">{headerMeta(detail)}</p>
        </div>
        <div className="pp-detail__header-side">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {/* FİNAL İNCELEME düzeltmesi #1 · ONAYLI SAPMA: mockup'ta "Düzenle"
              butonu YOK, ama `/hakedisler/{id}/duzenle` rotasına (pivot
              tablosu, "Fiyatları Tazele", PUT …/lines) hiçbir giriş noktası
              yoktu — form yalnız doğrudan URL ile ulaşılabiliyordu. Yalnız
              `draft` durumunda (düzenleme yalnız orada anlamlı, bkz.
              `ProgressPaymentForm`) VE yazma izni varken görünür; bilinmezlik
              kuralı `useModulePermission.canWrite` üzerinden zaten uygulanır. */}
          {detail.status === "draft" && canWrite && (
            <Link
              href={routes.progressPayments.edit({ paymentId: detail.id })}
              className={cx("btn", "btn--secondary", "btn--md")}
            >
              Düzenle
            </Link>
          )}
          <ProgressPaymentStatusActions detail={detail} />
          {/* SIL-F2.2 — yalnız Sistem Yöneticisi görür; silince işveren hakedişleri listesine döner. */}
          <DeleteRecordButton
            kind="progress_payment"
            recordId={detail.id}
            redirectTo={routes.progressPayments.list()}
            className="btn btn--danger btn--md"
          />
        </div>
      </div>

      {detail.dropped_orphan_count > 0 && (
        <Alert variant="warning" className="pp-detail__alert" data-testid="pp-detail-orphan-alert">
          Sözleşmeden kaldırılan {detail.dropped_orphan_count} kalem bu hakedişten düşürüldü.
        </Alert>
      )}

      <div className="pp-detail__kpi-strip">
        <KpiCard
          label="Bu Hakediş"
          value={formatCurrencyPrecise(detail.calculation.gross)}
          variant="primary"
          masked={isAmountHidden && detail.calculation.gross === null}
        />
        {summary && (
          <KpiCard
            label="Toplam Hakediş"
            value={formatCurrencyPrecise(summary.cumulative_gross)}
            masked={isAmountHidden && summary.cumulative_gross === null}
          />
        )}
        {/* IZN-F4b.2: `remaining` gizliyse (null + kategori gizli) kart "—" + kilitle KALIR; aksi hâlde
            null = sözleşme bedeli yok → kart basılmaz (eski davranış). */}
        {(remaining !== null || (isAmountHidden && summary !== undefined)) && (
          <KpiCard
            label="Kalan"
            value={formatCurrencyPrecise(remaining)}
            variant="warning"
            masked={isAmountHidden && remaining === null}
          />
        )}
      </div>

      <div className="pp-detail__grid">
        <div className="pp-detail__main">
          <PaymentGroupTable groups={detail.groups} />
        </div>
        <div className="pp-detail__side">
          <PaymentCalculationCard detail={detail} />
          <PaymentProgressCard progress={detail.progress} />
        </div>
      </div>
    </div>
  );
}

// Alt başlık: proje adı + (varsa) açıklama. Mockup 66'daki blok adı ve
// sözleşme numarası (`SZL-2025-001`) şemada YOK — `ProgressPaymentDetail`
// site/sözleşme referansı taşımıyor, uydurulmadı (BOQ ekranının "onaylı
// sapma C" ile aynı karar).
function headerMeta(detail: ProgressPaymentDetail): string {
  return detail.description ? `${detail.project_name} · ${detail.description}` : detail.project_name;
}

function KpiCard({
  label,
  value,
  variant,
  masked = false,
}: {
  label: string;
  value: string;
  variant?: "primary" | "warning";
  /** IZN-F4b.2 — değer rol için gizli: "—" yanında kilit ipucu. */
  masked?: boolean;
}) {
  return (
    <div className="pp-kpi" data-testid="pp-detail-kpi">
      <div className="pp-kpi__label">{label}</div>
      <div className={cx("pp-kpi__value", variant && `pp-kpi__value--${variant}`)}>
        {value}
        <MaskedMark isHidden={masked} values={[null]} />
      </div>
    </div>
  );
}
