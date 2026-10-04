"use client";

import { useState } from "react";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { PersonnelTabsStrip } from "@/components/personnel/PersonnelTabsStrip";
import { Button } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useApproveLeaveRequest } from "@/lib/api/hooks/useLeaveMutations";
import {
  useHrLeavesSummary,
  usePendingLeaveRequests,
  type LeaveRequestResponse,
} from "@/lib/api/hooks/useLeaves";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { LEAVE_APPROVE, PERSONNEL_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import {
  APPROVE_ERROR_FALLBACK,
  LEAVES_EYEBROW,
  LEAVES_PAGE_TITLE,
  NEW_REQUEST_ACTION_LABEL,
  REQUESTS_ERROR_PREFIX,
  SUMMARY_ERROR_PREFIX,
} from "./leaves-labels";
import { LeaveBalancesTable } from "./LeaveBalancesTable";
import { LeaveRejectModal } from "./LeaveRejectModal";
import { LeaveRequestFormModal } from "./LeaveRequestFormModal";
import { LeavesKpiStrip } from "./LeavesKpiStrip";
import { PendingLeaveRequestsTable } from "./PendingLeaveRequestsTable";
import "./leaves.css";

/**
 * F-IZN T3 · İZ — `/personel/izinler` (İzin Yönetimi) ekranı; kanon
 * `İK - İzin Yönetimi.dc.html` (parantez içi sayılar o dosyanın SATIR
 * numaralarıdır).
 *
 * ⚠️ Kabuk canon'u: mockup'ın KENDİ üst barı (14-22) ve KENDİ sol menüsü
 * (25-40) BASILMAZ — kabuk uygulamadan gelir (HrDocumentsView emsali). ANA
 * SIDEBAR'A ÖĞE EKLENMEZ; bu ekrana erişim `/personel` sekme şeridindendir.
 * Breadcrumb (19) kabuktan gelir.
 *
 * ⚠️ İKİ uç okunur ve ikisi de gereklidir: özet (KPI + bakiye tablosu) ve
 * `status=pending` talep listesi. Bakiye dizisi AYNI ZAMANDA talep tablosunun
 * "Kalan Hak" sütununun kaynağıdır (K4 istemci JOIN'i).
 *
 * ⚠️ İzin modülü `personnel`dır: izin kayıtları personelin alt kaynağıdır.
 */
const YEAR_OPTION_COUNT = 2;

function buildYearOptions(currentYear: number): number[] {
  // 120 — mockup iki yıl listeler (2026/2025): içinde bulunulan yıl + bir önceki.
  return Array.from({ length: YEAR_OPTION_COUNT }, (_, index) => currentYear - index);
}

export interface LeavesViewProps {
  /** Testler için sabitlenebilir "bugün"ün yılı. */
  currentYear?: number;
}

/**
 * 🔴 T4 · KARAR AKIŞININ SAHİBİ BU BİLEŞENDİR.
 *
 * T3 karar geri çağrılarını PROP olarak dışarı açmıştı ("henüz bağlanmadı"
 * gerekçesiyle birlikte). T4'te akış BURADA kapanır: onay gövdesizdir ve
 * doğrudan çağrılır, red diyalog açar. Geri çağrılar prop olarak DIŞARIDA
 * BIRAKILMAZ — iki çağıran iki farklı karar akışı kurabilirdi. Tablo yine
 * sunumsaldır (prop alır), kap bileşen budur.
 */
export function LeavesView({ currentYear = new Date().getFullYear() }: LeavesViewProps = {}) {
  const permission = useModulePermission("personnel");
  // IZN-F2.x · bugün KAPISIZ düğmeler (fallback true): talep = ik.* Düzenler; Onayla/Reddet = ik.izin_yonetimi Onaylar.
  const canRequestLeave = useButtonGate({ pages: PERSONNEL_EDIT, need: "edit", fallback: true });
  const canDecideLeave = useButtonGate({ pages: LEAVE_APPROVE, need: "approve", fallback: true });
  const [year, setYear] = useState(currentYear);
  const summaryQuery = useHrLeavesSummary(year);
  /**
   * 🔴 KAYIT NO 145 — `PendingLeaveRequestsTable`in bakiye JOIN'i (aşağıda
   * `balances=`) BAKİYE TABLOSUNUN yıl seçicisine BAĞLI OLAMAZ: bekleyen
   * talepler HER ZAMAN bugünün yılına aittir (`LeaveRequestFormModal` da
   * `currentYear`e sabitlenir — aynı gerekçe). Kullanıcı bakiye tablosunda
   * geçmiş bir yıl seçtiğinde `summaryQuery` o yılın bakiyesini döner ve
   * bekleyen talepler yanlış yılın bakiyesiyle eşleşirdi. `year === currentYear`
   * iken react-query aynı anahtarı paylaşır, ikinci bir ağ isteği doğmaz.
   */
  const currentYearSummaryQuery = useHrLeavesSummary(currentYear);
  const requestsQuery = usePendingLeaveRequests();
  const approveRequest = useApproveLeaveRequest();

  /** Açık diyaloglar — ikisi de aynı anda açılmaz (tetikleyicileri ayrı). */
  const [isRequestFormOpen, setRequestFormOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<LeaveRequestResponse | null>(null);
  /** 🔴 Onayın 409'u (çakışma · hak aşımı · kalan hesaplanamıyor) YUTULMAZ. */
  const [decisionError, setDecisionError] = useState<string | null>(null);

  function handleApprove(request: LeaveRequestResponse) {
    setDecisionError(null);
    // Onay GÖVDESİZDİR ve diyalog gerektirmez (spec §5 K4).
    approveRequest.mutate(request.id, {
      onError: (error) => setDecisionError(backendErrorMessage(error, APPROVE_ERROR_FALLBACK)),
    });
  }

  if (
    !permission.canView ||
    isForbidden(summaryQuery.error) ||
    isForbidden(requestsQuery.error)
  ) {
    return <AccessDenied />;
  }

  const summary = summaryQuery.data;
  const summaryError = summaryQuery.isError
    ? `${SUMMARY_ERROR_PREFIX}: ${backendErrorMessage(summaryQuery.error)}`
    : undefined;
  const requestsError = requestsQuery.isError
    ? `${REQUESTS_ERROR_PREFIX}: ${backendErrorMessage(requestsQuery.error)}`
    : undefined;

  return (
    <div className="iz">
      <p className="iz__eyebrow">{LEAVES_EYEBROW}</p>
      {/* F-IZN T5 şef ölçümü: mockup düğmeyi ÇİZER (`İK - İzin Yönetimi.dc.html:21`
          — "+ İzin Talebi"); T4'ün "mockup çizmez" gerekçesi YANLIŞTI, etiket
          buna göre düzeltildi. Diyaloğun BAŞLIĞI ayrı sabit ("Yeni İzin
          Talebi", `Form - Izin Talebi.dc.html:71`) ve DEĞİŞMEDİ. */}
      <div className="iz__title-row">
        <h1 className="iz__title">{LEAVES_PAGE_TITLE}</h1>
        {canRequestLeave && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setRequestFormOpen(true)}
            data-testid="iz-new-request"
          >
            {NEW_REQUEST_ACTION_LABEL}
          </Button>
        )}
      </div>

      {/* `/personel` ile ORTAK sekme şeridi. F-IZN T5: "İzin Yönetimi" artık
          GERÇEK rotaya bağlı — bu ekran aktif sekmesini kendisi bildirir (aktif
          sekme kendi sayfasına bağlanmaz, düz metne düşer; şerit bileşeninin
          KENDİSİ bu dilimde DEĞİŞTİRİLMEZ, yalnız parametre verilir). */}
      <PersonnelTabsStrip activeTab="İzin Yönetimi" />

      {/* 45-51 */}
      <LeavesKpiStrip summary={summary} />

      {/* 54-113 */}
      <PendingLeaveRequestsTable
        rows={requestsQuery.data?.items}
        total={requestsQuery.data?.total}
        balances={currentYearSummaryQuery.data?.balances}
        isLoading={requestsQuery.isLoading}
        errorMessage={requestsError}
        // 🔴 ÇİFT GÖNDERİM: onay gövdesizdir ve diyalog açmaz — düğme ile uç
        // arasındaki TEK kapı budur. İki diyalogun kurduğu `isPending` kilidi
        // onay yolunda da kurulur; yoksa iki hızlı tıklama iki POST üretir ve
        // ikincisinin 409'u başarılı onayı başarısız gibi gösterir.
        isApprovePending={approveRequest.isPending}
        canDecide={canDecideLeave}
        onApproveRequest={handleApprove}
        onRejectRequest={setRejectTarget}
      />

      {/* 🔴 Onayın sunucu reddi (409) EKRANDA okunur — sessizce yutulmaz. */}
      {decisionError !== null && (
        <p className="iz-decision-error" data-testid="iz-decision-error">
          {decisionError}
        </p>
      )}

      {/* 116-171 */}
      <LeaveBalancesTable
        rows={summary?.balances}
        isLoading={summaryQuery.isLoading}
        errorMessage={summaryError}
        year={year}
        yearOptions={buildYearOptions(currentYear)}
        onYearChange={setYear}
      />

      {/* Talep formu bakiye kartını İÇİNDE BULUNULAN yıldan okur: bakiye
          tablosunun yıl seçicisi geçmişe alındığında yeni talep geçmiş yılın
          hakkıyla değerlendirilemez. */}
      {isRequestFormOpen && (
        <LeaveRequestFormModal year={currentYear} onClose={() => setRequestFormOpen(false)} />
      )}

      {rejectTarget !== null && (
        <LeaveRejectModal
          request={rejectTarget}
          balances={summary?.balances}
          onClose={() => setRejectTarget(null)}
        />
      )}
    </div>
  );
}
