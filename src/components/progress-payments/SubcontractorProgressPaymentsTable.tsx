"use client";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge/Badge";
import { formatCurrencyPrecise, formatPeriodShort } from "@/lib/format";
import { pendingModuleLabel } from "@/lib/pending-modules";
import { PAYMENT_STATUS_BADGE } from "./shared/status";
import type {
  SubcontractorProgressPaymentListItem,
  SubcontractorProgressPaymentListResponse,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";

import "./subcontractor-progress-payments.css";
import { routes } from "@/lib/routes";

export interface SubcontractorProgressPaymentsTableProps {
  isError: boolean;
  isLoading: boolean;
  data?: SubcontractorProgressPaymentListResponse;
  /**
   * no 183 · `ProgressPaymentsList.tsx::newActionLabel` deseniyle AYNI: boş
   * durum ipucundaki eylem metni. Çağıran kendi "+ Yeni Hakediş" düğmesiyle
   * AYNI sabitten geçirir; `null` (varsayılan) = eylem HİÇ VAAT EDİLMEZ —
   * salt-okunur kullanıcı, ekranda olmayan bir düğmeyi tarif eden metin
   * GÖRMEZ.
   */
  newActionLabel?: string | null;
}

export function SubcontractorProgressPaymentsTable({
  isError,
  isLoading,
  data,
  newActionLabel = null,
}: SubcontractorProgressPaymentsTableProps) {
  const isAmountHidden = useCategoryHidden(SUBCONTRACTOR_PAYMENT_HIDDEN_CATEGORIES);
  if (isError) return <p className="thk-message">Taşeron hakedişleri yüklenemedi</p>;
  if (isLoading || !data) return <p className="thk-message">Yükleniyor…</p>;
  if (data.items.length === 0) {
    return (
      <section className="thk-empty">
        <p className="thk-empty__title">Henüz taşeron hakedişi oluşturulmadı</p>
        <p className="thk-empty__hint">
          {newActionLabel
            ? `${newActionLabel} ile başlayın`
            : "Yeni Hakediş ekranından oluşturulan kayıtlar burada listelenir"}
        </p>
      </section>
    );
  }

  return (
    <section className="thk-card">
      <table className="thk-table">
        <thead>
          <tr>
            <th className="thk-table__th thk-table__th--left">Taşeron</th>
            <th className="thk-table__th thk-table__th--left">Hakediş No</th>
            <th className="thk-table__th thk-table__th--left">Dönem</th>
            <th className="thk-table__th thk-table__th--right">
              Brüt Tutar
              <MaskedMark isHidden={isAmountHidden} values={data.items.map((item) => item.gross_total)} />
            </th>
            <th className="thk-table__th thk-table__th--right">KDV</th>
            <th className="thk-table__th thk-table__th--right">
              Net Ödeme
              <MaskedMark isHidden={isAmountHidden} values={data.items.map((item) => item.net_total)} />
            </th>
            <th className="thk-table__th thk-table__th--center">Durum</th>
            <th className="thk-table__th thk-table__th--center">İlerleme</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <SubcontractorPaymentRow key={item.id} item={item} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SubcontractorPaymentRow({ item }: { item: SubcontractorProgressPaymentListItem }) {
  const router = useRouter();
  const href = routes.progressPayments.subcontractor.detail({ paymentId: item.id });
  const badge = PAYMENT_STATUS_BADGE[item.status];
  const subcontractorName = item.subcontractor_name ?? "—";

  return (
    <tr
      className="thk-row"
      onClick={() => router.push(href)}
      aria-label={`${subcontractorName} — Hakediş #${item.sequence_no}`}
    >
      <td className="thk-table__td">
        <Link href={href} className="thk-table__name-link" onClick={(event) => event.stopPropagation()}>
          {subcontractorName}
        </Link>
        {/* İş kategorisi — `SubcontractorProgressPaymentListItem.work_category`
            SEMADA VARDIR (O5a-194); SiteSubcontractorPaymentsPanel kardeş
            bileşeniyle AYNI alan doğrudan basılır, TÜRETME/uydurma yok.
            Mockup satır 141'de isim altında ikinci satır olarak durur. */}
        <div className="thk-table__category">{item.work_category ?? "—"}</div>
      </td>
      <td className="thk-table__td thk-table__td--mono">#{item.sequence_no}</td>
      <td className="thk-table__td">
        {item.period_year && item.period_month ? formatPeriodShort(item.period_year, item.period_month) : "—"}
      </td>
      <td className="thk-table__td thk-table__td--right thk-table__td--mono thk-table__td--strong">
        {formatCurrencyPrecise(item.gross_total)}
      </td>
      {/* Zarif düşüş 2/3: KDV tutarı — şemada YOK. `net - gross` gibi bir
          TÜRETME YASAK (brief), bu yüzden hesaplanmaz, pending gösterilir. */}
      <td
        className="thk-table__td thk-table__td--right thk-table__td--pending"
        title={pendingModuleLabel("vat")}
      >
        —<span className="sr-only">{pendingModuleLabel("vat")}</span>
      </td>
      <td className="thk-table__td thk-table__td--right thk-table__td--mono thk-table__td--strong">
        {formatCurrencyPrecise(item.net_total)}
      </td>
      <td className="thk-table__td thk-table__td--center">
        {item.is_revision_required ? (
          <Badge variant="danger">Revize Gerekli</Badge>
        ) : (
          <Badge variant={badge.variant}>{badge.label}</Badge>
        )}
      </td>
      {/* Zarif düşüş 3/3: ilerleme yüzdesi — şemada YOK. Çubuk/yüzde
          TAHMİN EDİLMEZ, tüm hücre pending gösterilir. */}
      <td
        className="thk-table__td thk-table__td--center thk-table__td--pending"
        title={pendingModuleLabel("progress")}
      >
        —<span className="sr-only">{pendingModuleLabel("progress")}</span>
      </td>
    </tr>
  );
}
