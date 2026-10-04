"use client";

import { useEffect } from "react";
import { useParams } from "next/navigation";

import { useSection } from "@/lib/api/hooks/useSection";
import { useSiteDiaryEntry } from "@/lib/api/hooks/useSiteDiary";
import { useSite } from "@/lib/api/hooks/useSites";
import { BackendError, isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { SITE_DIARY_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { routes } from "@/lib/routes";

import { detailWorkerSummary, isPaymentHidden } from "./cards-derive";
import type { DiaryDetailExtensionProps } from "./detail-extension";
import { DiaryDetailHeader } from "./DiaryDetailHeader";
import { DiaryDetailBasicInfo, DiaryDetailNotes, DiaryDetailPhotos, DiaryDetailSafety } from "./DiaryDetailInfoCards";
import { DiaryDetailKpis } from "./DiaryDetailKpis";
import { DiaryDetailLinesCard } from "./DiaryDetailLinesCard";
import { DiaryDetailWorkersCard } from "./DiaryDetailWorkersCard";
import { buildDetailLineGroups } from "./lines-derive";
import {
  DiaryDetailError,
  DiaryDetailForbidden,
  DiaryDetailNotFound,
  DiaryDetailSkeleton,
} from "./DiaryDetailStates";
import "./site-diary-detail.css";
import "./site-diary-detail-cards.css";

/**
 * DET-1.2 · Günlük kayıt SALT OKUNUR detay sayfası (kullanıcı isteği
 * 2026-09-25: "oluşturulan günlük kayda tıklayınca o gün ne yapıldığını
 * göreyim"). Mockup: `Şantiye - Günlük Kayıt Detay (Salt Okunur).dc.html`.
 *
 * Giriş: Bölüm Detay › Günlük Kayıt satırı. Rota bölüm altındadır
 * (`routes.projects.sites.sections.diaryEntry`); kırıntı + geri tuşu
 * bölümün Günlük Kayıt SEKMESİNE (`?sekme=gunluk-kayit`) döner.
 *
 * DET-1.3: kartlar (Yapılan İşler · Şef notu · Temel Bilgiler & Hava · İSG ·
 * Yapılan Miktarlar (Kural A) · İşçi Dağılımı · Fotoğraf) + KPI ızgarası.
 * Planlama parçaları (EV kolonları/KPI'ları, Saat Dağıtımı özeti, "Gün n ·
 * Hn") `extension` yuvasından gelir — §2.7: bu modül planlamayı İTHAL ETMEZ;
 * yuvayı `earned-value/diary-detail` adaptörü doldurur.
 */
export function SiteDiaryDetailView({ extension, onExtensionContext }: DiaryDetailExtensionProps = {}) {
  const {
    projectId: projectKey,
    siteId: siteKey,
    sectionId: sectionKey,
    entryId,
  } = useParams<{ projectId: string; siteId: string; sectionId: string; entryId: string }>();

  // Kırıntı adları bu iki sorgunun ÖNBELLEĞİNDEN çözülür (K5 — ikinci istek
  // yok); Bölüm Detay'dan gelindiyse ikisi de zaten sıcaktır.
  const siteQuery = useSite(siteKey, { project: projectKey });
  const sectionQuery = useSection(sectionKey, { site: siteKey, project: projectKey });
  const section = sectionQuery.data;
  // Önceki/sonraki BÖLÜM bağlamında döner → kayıt, bölümün kanonik kimliğiyle
  // istenir. Bölüm okunamazsa (ör. `sites` 403) sayfa takılmaz: bağlamsız istenir.
  const sectionResolved = section !== undefined || sectionQuery.isError;
  const entryQuery = useSiteDiaryEntry(entryId, { sectionId: section?.id, enabled: sectionResolved });
  const permission = useModulePermission("site_diary");
  // IZN-F2.x · "Günlük kayıtta aç" = günlük kayıt Düzenler (VEYA).
  const canWriteDiary = useButtonGate({ pages: SITE_DIARY_EDIT, need: "edit", fallback: permission.canWrite });

  const entry = entryQuery.data;
  // Adresteki şantiyeye ait olmayan kayıt (kimlik elle değiştirilmiş) —
  // backend görünür şantiyede 404 verir; burada da AYNI hâl, veri sızmaz.
  const isForeignEntry = entry !== undefined && siteQuery.data !== undefined && entry.site_id !== siteQuery.data.id;
  // S8 — "Günlük kayıtta aç" YALNIZ yazabilen + kilitsiz günde.
  const openHref =
    entry !== undefined && canWriteDiary && !entry.locked
      ? routes.projects.sites.diary({ projectId: projectKey, siteId: siteKey })
      : undefined;

  // Uzantı bağlamı (§2.7): değer değişince bildirilir; yabancı kayıtta bildirilmez.
  const contextSiteId = entry === undefined || isForeignEntry ? null : entry.site_id;
  const contextDay = entry?.entry_date ?? null;
  const contextEntryId = entry?.id ?? null;
  const currentSectionId = section?.id ?? null;
  const currentSectionName = section?.name ?? null;
  useEffect(() => {
    if (onExtensionContext === undefined || contextSiteId === null || contextDay === null || contextEntryId === null) {
      return;
    }
    onExtensionContext({
      siteId: contextSiteId,
      day: contextDay,
      entryId: contextEntryId,
      currentSectionId,
      currentSectionName,
      openHref,
    });
  }, [onExtensionContext, contextSiteId, contextDay, contextEntryId, currentSectionId, currentSectionName, openHref]);

  const sectionTabHref = routes.projects.sites.sections.detail({
    projectId: projectKey,
    siteId: siteKey,
    sectionId: sectionKey,
    sekme: "gunluk-kayit",
  });

  if (!permission.canView || isForbidden(entryQuery.error)) return <DiaryDetailForbidden />;
  if (entryQuery.error instanceof BackendError && entryQuery.error.status === 404) {
    return <DiaryDetailNotFound backHref={sectionTabHref} />;
  }
  if (entryQuery.isError) return <DiaryDetailError onRetry={() => void entryQuery.refetch()} />;

  if (entry === undefined) return <DiaryDetailSkeleton />;
  if (isForeignEntry) return <DiaryDetailNotFound backHref={sectionTabHref} />;

  const currentSection = section === undefined ? undefined : { id: section.id, name: section.name };
  const groups = buildDetailLineGroups(entry, currentSection);
  const workers = detailWorkerSummary(entry);
  const paymentHidden = isPaymentHidden({ linesTotal: entry.lines_total });

  return (
    <div className="diary-detail">
      <DiaryDetailHeader
        entry={entry}
        currentSection={currentSection}
        headerSuffix={extension?.headerSuffix}
        kpis={
          <DiaryDetailKpis
            groups={groups}
            workers={workers}
            isPaymentHidden={paymentHidden}
            extensionKpis={extension?.kpis ?? []}
          />
        }
        entryHref={(id) =>
          routes.projects.sites.sections.diaryEntry({
            projectId: projectKey,
            siteId: siteKey,
            sectionId: sectionKey,
            entryId: id,
          })
        }
        openHref={openHref}
      />
      {/* 238-297 — İ:160 iki sütunlu esnek düzen (1024'te tek sütun) */}
      <div className="diary-detail__columns">
        <div className="diary-detail__col diary-detail__col--main">
          <DiaryDetailNotes entry={entry} />
        </div>
        <div className="diary-detail__col diary-detail__col--side">
          <DiaryDetailBasicInfo entry={entry} />
          <DiaryDetailSafety entry={entry} />
        </div>
      </div>
      <DiaryDetailLinesCard
        groups={groups}
        columns={extension?.lineColumns ?? null}
        notice={extension?.linesNotice}
        isPaymentHidden={paymentHidden}
        paymentsHref={routes.projects.sites.progressPayments({ projectId: projectKey, siteId: siteKey })}
      />
      {/* 406-487 — Saat Dağıtımı özeti (uzantı) + İşçi Dağılımı */}
      <div className="diary-detail__columns">
        {extension?.fullWidthBlock !== undefined && (
          <div className="diary-detail__col diary-detail__col--main">{extension.fullWidthBlock}</div>
        )}
        <div className="diary-detail__col diary-detail__col--side">
          <DiaryDetailWorkersCard summary={workers} />
        </div>
      </div>
      <DiaryDetailPhotos />
    </div>
  );
}
