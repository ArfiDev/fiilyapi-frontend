"use client";

import Link from "next/link";

import { DeleteRecordButton } from "@/components/delete-confirm/DeleteRecordButton";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { Alert } from "@/components/ui/alert/Alert";
import { Badge } from "@/components/ui/badge/Badge";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { Button } from "@/components/ui";
import {
  useSubcontractorContract,
  useSubcontractorProgressPayment,
  type SubcontractorProgressPaymentDetail,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { useSite } from "@/lib/api/hooks/useSites";
import { isForbidden } from "@/lib/api/unwrap";
import { SUBCONTRACTOR_PAYMENT_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { cx } from "@/lib/cx";
import { formatCurrencyPrecise, formatPeriod } from "@/lib/format";
import { pendingModuleLabel } from "@/lib/pending-modules";

import { PaymentCalculationCard } from "./PaymentCalculationCard";
import { SubcontractorContractProgressCard } from "./SubcontractorContractProgressCard";
import { SubcontractorPaymentLineTable } from "./SubcontractorPaymentLineTable";
import { SubcontractorProgressPaymentStatusActions } from "./SubcontractorProgressPaymentStatusActions";
import { PAYMENT_STATUS_BADGE } from "./shared/status";
import "./progress-payment-detail.css";
import "./subcontractor-progress-payment-detail.css";
import { routes } from "@/lib/routes";

export interface SubcontractorProgressPaymentDetailViewProps {
  paymentId: string;
}

/**
 * F-TH T4 · Taşeron Hakediş detayı. Mockup YOK (kullanıcı kararı S1, brief
 * §Bu ekranın mockup'ı YOK) — yerleşim `Ekran 15 - İşveren Hakedişi.dc.html`nin
 * taşeron uyarlamasıdır, `ProgressPaymentDetailView` (P7 T3+T4) BİREBİR
 * emsalidir. Paylaşılan parçalar: `shared/status.ts` (rozet), `shared/
 * status-actions.ts` (aksiyon kümesi, `PaymentActionButtons` üzerinden),
 * `shared/payment-calculation-rows.ts` + `PaymentCalculationCard` (Ödeme
 * Hesabı), `progress-payment-detail.css` (pp-* yerleşim sınıfları). Farklı
 * veri şekli yüzünden AYRI yazılanlar: kalem tablosu (`SubcontractorPayment
 * LineTable` — İşveren'in önceden agrege `groups[]`i yerine ham `lines[]`),
 * durum aksiyonları (`SubcontractorProgressPaymentStatusActions` — zorunlu
 * red gerekçesi), Sözleşme İlerlemesi (`SubcontractorContractProgressCard` —
 * şemada karşılığı olmadığından HER ZAMAN pending; brief bunu İşveren'in
 * "veri yoksa kartı gizle" kuralının BİLİNÇLİ TERSİ olarak işaretliyor).
 */
export function SubcontractorProgressPaymentDetailView({
  paymentId,
}: SubcontractorProgressPaymentDetailViewProps) {
  const detailQuery = useSubcontractorProgressPayment(paymentId);
  const isAmountHidden = useCategoryHidden(SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES);
  const detail = detailQuery.data;
  // Şantiye adı yalnız sözleşme üzerinden gelir (`SubcontractorProgressPayment
  // Detail` site_id/site_name TAŞIMAZ) — `SubcontractorProgressPaymentForm`
  // (T3) ile AYNI iki basamaklı okuma (sözleşme → şantiye).
  const contractQuery = useSubcontractorContract(detail?.contract_id ?? "");
  const siteQuery = useSite(contractQuery.data?.site_id ?? "");
  // IZN-F2.x · hakediş oluştur/düzenle = taşeron hakediş ailesi Düzenler (IZN-F5b, HT).
  const canWrite = useButtonGate({
    pages: SUBCONTRACTOR_PAYMENT_EDIT,
    need: "edit",
    projectId: detail?.project_id,
  });

  if (isForbidden(detailQuery.error)) return <AccessDenied />;
  if (detailQuery.isError) return <p className="pp-detail__message">Hakediş yüklenemedi</p>;
  if (detailQuery.isLoading || !detail) {
    return <p className="pp-detail__message">Yükleniyor…</p>;
  }

  const badge = detail.is_revision_required
    ? { label: "Revize Gerekli", variant: "danger" as const }
    : PAYMENT_STATUS_BADGE[detail.status];

  return (
    <div className="pp-detail">
      <p className="pp-detail__crumb">
        <Link href={routes.progressPayments.subcontractor.list()} className="pp-detail__crumb-link">
          ← Hakedişler
        </Link>
        {" · Taşeron Hakedişi"}
      </p>

      <div className="pp-detail__header">
        <div>
          <h1 className="pp-detail__title">Taşeron Hakedişi #{detail.sequence_no}</h1>
          <p className="pp-detail__meta">
            <HeaderMeta
              detail={detail}
              siteName={siteQuery.data?.name}
              siteMissing={contractQuery.isSuccess && !contractQuery.data.site_id}
            />
          </p>
        </div>
        <div className="pp-detail__header-side">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {/* PDF/dışa aktarma ucu openapi'de YOK (brief §Durum-bazlı buton
              seti) — buton SİLİNMEZ, devre dışı + nedeni görünür basılır
              (ölü buton değil: `disabled` gerçekten tıklamayı engeller). */}
          <Button
            variant="secondary"
            disabled
            className="thd-pdf-button"
            title={pendingModuleLabel("pdf_export")}
          >
            PDF
          </Button>
          {detail.status === "draft" && canWrite && (
            <Link
              href={routes.progressPayments.subcontractor.edit({ paymentId: detail.id })}
              className={cx("btn", "btn--secondary", "btn--md")}
            >
              Düzenle
            </Link>
          )}
          <SubcontractorProgressPaymentStatusActions detail={detail} />
          {/* SIL-F2.2 — yalnız Sistem Yöneticisi görür; silince taşeron hakedişleri listesine döner. */}
          <DeleteRecordButton
            kind="subcontractor_progress_payment"
            recordId={detail.id}
            redirectTo={routes.progressPayments.subcontractor.list()}
            className="btn btn--danger btn--md"
          />
        </div>
      </div>

      {detail.rejection_reason && (
        <Alert variant="danger" className="thd-rejection-alert" data-testid="th-detail-rejection-alert">
          Reddedildi{detail.rejected_at ? ` (${formatRejectedAt(detail.rejected_at)})` : ""}:{" "}
          {detail.rejection_reason}
        </Alert>
      )}

      {detail.dropped_orphan_count > 0 && (
        <Alert variant="warning" className="pp-detail__alert" data-testid="th-detail-orphan-alert">
          Sözleşmeden kaldırılan {detail.dropped_orphan_count} kalem bu hakedişten düşürüldü.
        </Alert>
      )}

      <div className="pp-detail__kpi-strip">
        <KpiCard
          label="Bu Hakediş"
          value={formatCurrencyPrecise(detail.calculation.gross)}
          masked={isAmountHidden && detail.calculation.gross === null}
        />
        {/* "Toplam Hakediş"/"Kalan" — sözleşme kümülatifi ister
            (`SubcontractorContractDetail.progress_payment_summary`), o alan
            şemada HER ZAMAN `null` döner (brief §Sol sütun) — kart SİLİNMEZ,
            zarif düşüşle basılır, veri uydurulmaz. */}
        <KpiCard label="Toplam Hakediş" pending />
        <KpiCard label="Kalan" pending />
      </div>

      <div className="pp-detail__grid">
        <div className="pp-detail__main">
          <SubcontractorPaymentLineTable lines={detail.lines} />
        </div>
        <div className="pp-detail__side">
          {/* Final inceleme F-2: bu satır BU hakedişin brütüdür, üstteki
              "Toplam Hakediş" KPI'ı ise sözleşme KÜMÜLATİFİDİR. Aynı etiket
              iki farklı tutarda kullanılamaz (kullanıcı 2.100.000'i sözleşme
              kümülatifi sanardı) — mockup `Ekran 15 - İşveren
              Hakedişi.dc.html` satır 154 zaten "Brüt Hakediş" der. */}
          <PaymentCalculationCard
            detail={detail}
            labels={{ grossLabel: "Brüt Hakediş", netLabel: "Net Ödenecek" }}
            kind="subcontractor"
          />
          <SubcontractorContractProgressCard />
        </div>
      </div>
    </div>
  );
}

function HeaderMeta({
  detail,
  siteName,
  siteMissing,
}: {
  detail: SubcontractorProgressPaymentDetail;
  siteName: string | undefined;
  /** Sözleşmenin `site_id`si `null` — proje geneline bağlı taşeron
      sözleşmesi (nullable alan, "modül eksik" değil); yükleniyor durumuyla
      karıştırılmaz (brief §Üst şerit: halka silinmez, zarif düşüş uygulanır). */
  siteMissing: boolean;
}) {
  const SITE_MISSING_HINT = "Bu sözleşme belirli bir şantiyeye bağlı değil.";
  const projectSite = siteName ? (
    `${detail.project_name} ${siteName}`
  ) : siteMissing ? (
    <>
      {detail.project_name}{" "}
      <span className="thd-meta__pending" title={SITE_MISSING_HINT}>
        —<span className="sr-only">{SITE_MISSING_HINT}</span>
      </span>
    </>
  ) : (
    detail.project_name
  );
  const period =
    detail.period_year !== null && detail.period_month !== null ? (
      formatPeriod(detail.period_year, detail.period_month)
    ) : (
      <span className="thd-meta__pending" title="Dönem bu hakedişte belirtilmemiş">
        —<span className="sr-only">Dönem bu hakedişte belirtilmemiş</span>
      </span>
    );
  const contractNo = detail.contract_no ?? (
    <span className="thd-meta__pending" title="Sözleşme numarası bu sözleşmede girilmemiş">
      —<span className="sr-only">Sözleşme numarası bu sözleşmede girilmemiş</span>
    </span>
  );

  return (
    <>
      {projectSite} · {period} · {contractNo}
    </>
  );
}

function KpiCard({
  label,
  value,
  pending,
  masked = false,
}: {
  label: string;
  value?: string;
  pending?: boolean;
  /** IZN-F4b.2 — değer rol için gizli: "—" yanında kilit ipucu. */
  masked?: boolean;
}) {
  return (
    <div className="pp-kpi" data-testid="th-detail-kpi">
      <div className="pp-kpi__label">{label}</div>
      {pending ? (
        <div className="pp-kpi__value pp-kpi__value--pending" title={pendingModuleLabel("contract_progress")}>
          —<span className="sr-only">{pendingModuleLabel("contract_progress")}</span>
        </div>
      ) : (
        <div className="pp-kpi__value">
          {value}
          <MaskedMark isHidden={masked} values={[null]} />
        </div>
      )}
    </div>
  );
}

/**
 * `getUTC*` kullanılır (yerel saat dilimi DEĞİL) — CI/geliştirme makinesinin
 * saat dilimi farklı olabilir, `getDate()`/`getHours()` gibi yerel
 * eşdeğerleri farklı ortamlarda farklı gün/saat üretir (`formatLastLogin`in
 * `Date.now()` göreliliğinden BİLEREK ayrılan bir karar — burada mutlak,
 * tekrarlanabilir bir zaman damgası basılır).
 */
function formatRejectedAt(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}
