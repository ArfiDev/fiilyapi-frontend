"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import {
  useSubcontractorProgressPayments,
  useSubcontractorProgressPaymentSummary,
} from "@/lib/api/hooks/useSubcontractorProgressPayments";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { PROGRESS_PAYMENTS_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";

import { ProgressPaymentsTabs } from "./shared/ProgressPaymentsTabs";
import { SubcontractorProgressPaymentsFilters } from "./SubcontractorProgressPaymentsFilters";
import { SubcontractorProgressPaymentsTotals } from "./SubcontractorProgressPaymentsTotals";
import { SubcontractorProgressPaymentsTable } from "./SubcontractorProgressPaymentsTable";
import { parseSubcontractorFilters } from "./subcontractor-filters";
import "./subcontractor-progress-payments.css";
import { routes } from "@/lib/routes";

/**
 * Ekran 2 · Taşeron Hakedişi (F-TH T2). Mockup `Ekran 2 - Taşeron
 * Hakedişi.dc.html` birebir: başlık + "+ Yeni Hakediş" (rota T3'te açılacak,
 * brief'in izniyle şimdiden link basılır) + filtre çubuğu (URL state) + 4
 * KPI kartı + 8 kolonlu tablo. İzin kapısı İşveren tarafıyla AYNI modül
 * anahtarını kullanır (`progress_payments`) — backend iki router'ı da AYNI
 * izin satırına bağlar (T1/T2 araştırması, ayrı bir `subcontractor_progress_
 * payments` satırı YOK).
 */
export function SubcontractorProgressPaymentsView() {
  const searchParams = useSearchParams();
  const filters = parseSubcontractorFilters(searchParams);

  const listFilter = {
    project_id: filters.projectId ?? undefined,
    period_year: filters.periodYear ?? undefined,
    period_month: filters.periodMonth ?? undefined,
    status: filters.status ?? undefined,
    q: filters.q || undefined,
  };

  const paymentsQuery = useSubcontractorProgressPayments(listFilter);
  const summaryQuery = useSubcontractorProgressPaymentSummary(listFilter);
  const { canWrite: moduleCanWrite } = useModulePermission("progress_payments");
  // IZN-F2.x · hakediş oluştur/düzenle = hakediş sayfaları Düzenler (VEYA).
  const canWrite = useButtonGate({ pages: PROGRESS_PAYMENTS_EDIT, need: "edit", fallback: moduleCanWrite });

  if (isForbidden(paymentsQuery.error)) return <AccessDenied />;

  // Final inceleme F-3: uç varsayılan `limit` 50'dir — 50'den fazla hakediş
  // olan projede tablo sessizce eksik kalırdı. KPI şeridi ayrı `summary`
  // ucundan (sunucu hesabı) geldiği için ETKİLENMEZ; eksik olan YALNIZ
  // tablodur ve bu görünür kılınır.
  const truncation = buildListTruncation(
    paymentsQuery.data?.items.length ?? 0,
    paymentsQuery.data?.total,
  );

  return (
    <div className="thk">
      <ProgressPaymentsTabs active="subcontractor" />
      <div className="thk__title-row">
        <h1 className="thk__title">Taşeron Hakedişi</h1>
        {canWrite && (
          <Link href={routes.progressPayments.subcontractor.new()} className="thk__new-btn">
            + Yeni Hakediş
          </Link>
        )}
      </div>

      <SubcontractorProgressPaymentsFilters />

      <SubcontractorProgressPaymentsTotals summary={summaryQuery.data} />

      <SubcontractorProgressPaymentsTable
        isError={paymentsQuery.isError}
        isLoading={paymentsQuery.isLoading}
        data={paymentsQuery.data}
        newActionLabel={canWrite ? "+ Yeni Hakediş" : null}
      />

      {truncation.isTruncated && (
        <p className="thk-limit-note" data-testid="thk-limit-note">
          {listTruncationMessage(truncation)}
        </p>
      )}
    </div>
  );
}
