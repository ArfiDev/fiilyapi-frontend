"use client";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { navGroupHeadingFor } from "@/components/shell/nav-config";
import { routes } from "@/lib/routes";
import { PersonnelTabsStrip } from "@/components/personnel/PersonnelTabsStrip";
import { Button } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useHrDocumentsSummary } from "@/lib/api/hooks/useHrDocuments";
import { isForbidden } from "@/lib/api/unwrap";
import { PERSONNEL_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import {
  APPOINTMENT_PENDING_REASON,
  buildCriticalAlert,
  HR_DOCUMENTS_TAB_LABEL,
  UPLOAD_PENDING_REASON,
} from "./hr-documents-labels";
import { HrDocumentsFilterBar } from "./HrDocumentsFilterBar";
import { HrDocumentsKpiStrip } from "./HrDocumentsKpiStrip";
import { HrDocumentTypeBreakdownCard } from "./HrDocumentTypeBreakdownCard";
import { HrExpiredDocumentsTable } from "./HrExpiredDocumentsTable";
import { HrExpiringDocumentsTable } from "./HrExpiringDocumentsTable";
import "./hr-documents.css";

/**
 * F-İK T5 · BT — `/personel/belgeler` (Belge & Sertifika) ekranı; kanon
 * `İK - Belge Takibi.dc.html` (parantez içi sayılar o dosyanın SATIR
 * numaralarıdır).
 *
 * ⚠️ Ekranın TEK kaynağı `GET /hr/documents/summary`tir: beş KPI, iki liste
 * ve tip dağılımı AYNI gövdeden gelir — ikinci bir istek ATILMAZ.
 *
 * ⚠️ Kabuk canon'u: BT'nin kendi üst barı (14-25) ve kendi sol menüsü (28-43)
 * BASILMAZ (PD emsali). ANA SIDEBAR'A YENİ ÖĞE EKLENMEZ (şef kararı: kabuk
 * canon'u mockup sidebar'ından üstündür) — bu ekrana erişim `/personel`
 * sekme şeridinden olur. Breadcrumb (18-20) kabuktan gelir.
 *
 * ⚠️ İzin modülü `personnel`dır: belge kayıtları personelin alt kaynağıdır,
 * ayrı bir modül anahtarı yoktur.
 */
export function HrDocumentsView() {
  const canViewPersonnel = useButtonGate({ pages: PERSONNEL_VIEW, need: "view" });
  const summaryQuery = useHrDocumentsSummary();

  if (!canViewPersonnel || isForbidden(summaryQuery.error)) return <AccessDenied />;

  const summary = summaryQuery.data;
  const errorMessage = summaryQuery.isError ? backendErrorMessage(summaryQuery.error) : undefined;

  // 48-55 — ŞEF KARARI: bant BELGE sayaçlarından kurulur; mockup'ın PERSONEL
  // sayısı sunucuda yok ve `expired_documents` listesinden TÜRETİLMEZ.
  const alert = summary
    ? buildCriticalAlert({ expired: summary.expired, expiring: summary.expiring })
    : null;

  return (
    <div className="bt">
      <p className="bt__eyebrow">{navGroupHeadingFor(routes.personnel.list())}</p>
      <div className="bt__head">
        <h1 className="bt__title">{HR_DOCUMENTS_TAB_LABEL}</h1>
        {/* 22-23 — ikisinin de ucu/form mockup'ı yok: devre-dışı + gerekçe */}
        <div className="bt__actions">
          <Button variant="secondary" disabled title={APPOINTMENT_PENDING_REASON}>
            Toplu Randevu
          </Button>
          <Button variant="primary" disabled data-testid="bt-upload-button">
            + Belge Yükle
          </Button>
        </div>
      </div>

      {/* F-BLG T3/G7 — gerekçe EKRANDA basılır (`title`da saklanmaz) ve
          kullanıcıyı Personel Detay'daki GERÇEK girişe yönlendirir. */}
      <p className="bt__pending-reason" data-testid="bt-upload-reason">
        {UPLOAD_PENDING_REASON}
      </p>

      {/* Kayıt 123 — "Toplu Randevu" gerekçesi önceden yalnız `title`da
          duruyordu (klavye/ekran okuyucuyla erişilemez); F-BLG T3/G7
          kanonuyla EKRANDA basılır. Aynı gerekçe aşağıdaki bant düğmesi
          (99-107) için de geçerlidir. */}
      <p className="bt__pending-reason" data-testid="bt-appointment-reason">
        {APPOINTMENT_PENDING_REASON}
      </p>

      {/* `/personel` ile ORTAK sekme şeridi; burada bu sekme AKTİFtir. */}
      <PersonnelTabsStrip activeTab={HR_DOCUMENTS_TAB_LABEL} />

      {errorMessage && (
        <p className="bt-filters__note bt-filters__note--danger" data-testid="bt-summary-error">
          Belge özeti yüklenemedi: {errorMessage}
        </p>
      )}

      {/* 48-55 — `expired === 0` ise bant HİÇ basılmaz */}
      {alert && (
        <div className="bt-alert" data-testid="bt-critical-alert">
          <span className="bt-alert__icon" aria-hidden="true">
            🚨
          </span>
          <div className="bt-alert__body">
            <p className="bt-alert__title">{alert.title}</p>
            {alert.detail && <p className="bt-alert__detail">{alert.detail}</p>}
          </div>
          {/* 54 — uç YOK: silinmez, devre-dışı basılır */}
          <Button
            variant="danger"
            size="sm"
            disabled
            title={APPOINTMENT_PENDING_REASON}
            className="bt-alert__action"
          >
            Toplu Randevu Al
          </Button>
        </div>
      )}

      {/* 58-64 */}
      <HrDocumentsKpiStrip summary={summary} />

      {/* 67-76 */}
      <HrDocumentsFilterBar summary={summary} />

      {/* 79-133 */}
      <HrExpiredDocumentsTable
        rows={summary?.expired_documents}
        isLoading={summaryQuery.isLoading}
        errorMessage={errorMessage}
        totalCount={summary?.expired}
      />

      {/* 136-186 */}
      <div className="bt-grid">
        <HrExpiringDocumentsTable
          rows={summary?.expiring_documents}
          isLoading={summaryQuery.isLoading}
          errorMessage={errorMessage}
          totalCount={summary?.expiring}
        />
        <HrDocumentTypeBreakdownCard summary={summary} />
      </div>
    </div>
  );
}
