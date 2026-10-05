"use client";

import { useParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { backendErrorMessage } from "@/lib/api/error-message";
import { usePersonnelDetail } from "@/lib/api/hooks/usePersonnelDetail";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { BackendError, isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { PERSONNEL_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";

import { PersonnelDocumentsSummaryCard } from "./PersonnelDocumentsSummaryCard";
import { PersonnelHeaderCard } from "./PersonnelHeaderCard";
import { PersonnelPendingCard } from "./PersonnelPendingCard";
import {
  LEAVE_PENDING_REASON,
  PROJECT_HISTORY_PENDING_REASON,
  TIMESHEET_ALL_HREF,
  TIMESHEET_SUMMARY_PENDING_REASON,
} from "./personnel-detail-labels";
import "./personnel-detail.css";
import { routes } from "@/lib/routes";

/**
 * F-PT2 T3 · PD — `/personel/[id]` detay ekranı (kanon `Personel Detay.dc.html`).
 *
 * PD'nin KENDİ üst barı (mockup 14-25) basılmaz — kabuk canon zaten var
 * (F3 Topbar+Sidebar). Aksiyonlar (Düzenle/Bordroyu Gör) `SectionHeroCard`
 * deseniyle başlık kartına taşındı.
 */
export function PersonnelDetailView() {
  const { id } = useParams<{ id: string }>();
  const { canView: moduleCanView } = useModulePermission("personnel");
  // IZN-F5-ön · görüntüleme kapısı = ik.* sayfaları Görür (VEYA); grant yoksa modül izni.
  const canView = useButtonGate({ pages: PERSONNEL_VIEW, need: "view", fallback: moduleCanView });
  const detailQuery = usePersonnelDetail(id);
  // Proje ADI sunucudan personel kaydıyla GELMEZ (yalnız `assigned_project_id`)
  // — başlık kartının alt başlığı için `PersonnelListView` ile AYNI desen.
  const projectsQuery = useProjects();

  if (!canView || isForbidden(detailQuery.error)) return <AccessDenied />;
  if (detailQuery.isError) {
    // Kayıt 164 — 404 dışındaki hatalar (500/ağ/422) da aynı "kayıt yok"
    // cümlesiyle basılıyordu; kullanıcı gerçek nedeni (ör. sunucu hatası)
    // hiç göremiyordu. Yalnız GERÇEK 404'te sabit metin kalır.
    const isNotFound = detailQuery.error instanceof BackendError && detailQuery.error.status === 404;
    return (
      <p className="pd-message">
        {isNotFound ? "Personel bulunamadı." : backendErrorMessage(detailQuery.error, "Personel bulunamadı.")}
      </p>
    );
  }
  if (detailQuery.isLoading || !detailQuery.data) {
    return <p className="pd-message">Yükleniyor…</p>;
  }

  const personnel = detailQuery.data;
  const projectItems = projectsQuery.data?.items;
  const projectNames = projectItems
    ? Object.fromEntries(projectItems.map((project) => [project.id, project.name]))
    : undefined;

  return (
    <div className="pd">
      <PersonnelHeaderCard
        personnel={personnel}
        editHref={routes.personnel.edit({ personnelId: id })}
        projectNames={projectNames}
      />

      <div className="pd-grid">
        {/* 66-86 — kişi-bazlı puantaj özeti ucu YOK (K4); kart HİÇBİR ek
            sorgu atmaz (`DiarySummaryTrendCard` deseni), "Tümü →" GERÇEK. */}
        <PersonnelPendingCard
          title="Puantaj Özeti"
          headerLink={{ href: TIMESHEET_ALL_HREF, label: "Tümü →" }}
          reason={TIMESHEET_SUMMARY_PENDING_REASON}
          testId="personnel-timesheet-summary-card"
        />

        {/* 88-113 — İK dilimi. */}
        <PersonnelPendingCard
          title="İzin & Haklar"
          reason={LEAVE_PENDING_REASON}
          testId="personnel-leave-card"
        />

        {/* 115-128 — İK dilimi. */}
        <PersonnelPendingCard
          title="Proje Geçmişi"
          reason={PROJECT_HISTORY_PENDING_REASON}
          testId="personnel-project-history-card"
        />

        {/* 130-141 — F-İK T5'ten beri GERÇEK liste; F-BLG T2c'den beri
            "+ Ekle" de gerçek (indirme hâlâ ayrı sözleşme). */}
        <PersonnelDocumentsSummaryCard personnel={personnel} />
      </div>
    </div>
  );
}
