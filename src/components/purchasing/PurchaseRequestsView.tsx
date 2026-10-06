"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { usePurchaseRequests } from "@/lib/api/hooks/usePurchaseRequests";
import { usePurchasingSummary } from "@/lib/api/hooks/usePurchasingSummary";
import { isForbidden } from "@/lib/api/unwrap";
import { PURCHASE_REQUEST_EDIT, PROCUREMENT_VIEW_PAGES } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";
import { pendingModuleLabel } from "@/lib/pending-modules";

import { PurchaseRequestsTable, QUANTITY_PENDING_MODULE, QUOTE_COUNT_PENDING_MODULE } from "./PurchaseRequestsTable";
import { PurchasingKpiStrip } from "./PurchasingKpiStrip";
import { PurchasingTabs, type PurchasingTab } from "./PurchasingTabs";
import {
  NEW_PURCHASE_REQUEST_HREF,
  parsePurchaseRequestStatus,
  PROJECT_PARAM,
  PURCHASING_EYEBROW,
  PURCHASING_LIST_MAX_LIMIT,
  QUERY_PARAM,
  STATUS_PARAM,
} from "./purchasing-labels";
import "./purchasing.css";

/**
 * SAT · `/satinalma` — mockup `Satınalma & Teklif.dc.html` (kanonik).
 * Yorumlardaki sayılar O dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın KENDİ üst barı (20-33) ve sol menüsü (36-59) BASILMAZ: kabuk
 * canon kazanır (F3 Topbar + Sidebar). Sidebar'daki "Satınalma & Teklif"
 * (50) artık ComingSoon'a değil bu rotaya düşer — nav'a YENİ ÖĞE EKLENMEZ,
 * öğe zaten vardı; yalnız hedefi gerçek bir sayfa oldu.
 *
 * ⚠️ Üç süzgecin ÜÇÜ DE SUNUCUYA gider (`status`/`project_id`/`q`), istemcide
 * süzülen hiçbir şey yoktur — aksi hâlde sayfalanan kümenin dışındaki
 * kayıtlar sessizce kaybolurdu.
 *
 * ⚠️ KPI'lar sekmeden BAĞIMSIZDIR (uç durum süzgeci almaz) — bkz.
 * `PurchasingKpiStrip`.
 */
export function PurchaseRequestsView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // IZN-F2.x · talep oluştur = stok.satinalma_talepleri Düzenler.
  const canCreateRequest = useButtonGate({ pages: PURCHASE_REQUEST_EDIT, need: "edit" });
  // IZN-F5-ön · görüntüleme kapısı = stok.* satınalma sayfaları Görür (VEYA); grant yoksa modül izni.
  const canViewProcurement = useButtonGate({
    pages: PROCUREMENT_VIEW_PAGES,
    need: "view",
  });

  const status = parsePurchaseRequestStatus(searchParams.get(STATUS_PARAM));
  const projectId = searchParams.get(PROJECT_PARAM) ?? "";
  const query = searchParams.get(QUERY_PARAM) ?? "";

  // Kırpılma korkuluğu (ARCHITECTURE §5): tavan AÇIKÇA gönderilir, eksiklik
  // `total` ile GÖRÜNÜR kılınır.
  const requestsQuery = usePurchaseRequests({
    limit: PURCHASING_LIST_MAX_LIMIT,
    ...(status !== undefined ? { status } : {}),
    ...(projectId ? { projectId } : {}),
    ...(query ? { q: query } : {}),
  });
  const summaryQuery = usePurchasingSummary(projectId || undefined);
  // Satır yalnız `project_id` taşır; "Proje" sütununun adı buradan çözülür.
  const projectsQuery = useProjects();

  if (!canViewProcurement || isForbidden(requestsQuery.error)) return <AccessDenied />;

  const rows = requestsQuery.data?.items;
  const truncation = buildListTruncation(rows?.length ?? 0, requestsQuery.data?.total);
  const hasFilter = status !== undefined || projectId.length > 0 || query.length > 0;
  const projectNames = new Map(
    (projectsQuery.data?.items ?? []).map((project) => [project.id, project.name]),
  );

  // "Teklifler" sekmesi SAT tablosunun `quote_wait` süzgülü hâlidir (spec K3):
  // aktiflik ROTADAN DEĞİL süzgeç değerinden belirlenir. Tek anahtar
  // üretildiği için iki sekme aynı anda aktif GÖRÜNEMEZ (F-SD çift-aktiflik
  // dersi) — `PurchasingTabs.test.tsx` bunu ayrıca doğrular.
  const activeTab: PurchasingTab = status === "quote_wait" ? "quotes" : "requests";

  /**
   * Proje/arama süzgecini URL'den DÜŞÜRÜR; sekmenin `durum` anahtarına
   * DOKUNMAZ (sekme bir süzgeç değil, gezinme durumudur).
   */
  function clearSideFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(PROJECT_PARAM);
    params.delete(QUERY_PARAM);
    const next = params.toString();
    router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  return (
    <div className="sat">
      {/* 62 */}
      <p className="sat__eyebrow">{PURCHASING_EYEBROW}</p>

      {/* 63-66 */}
      <div className="sat__head">
        <h1 className="sat__title">Satınalma &amp; Teklif</h1>
        <div className="sat__actions">
          {/* 65 — talep formu T3'ün rotası (spec K1) */}
          {canCreateRequest && (
            <Link href={NEW_PURCHASE_REQUEST_HREF} className="btn btn--primary btn--md">
              + Satın Alma Talebi
            </Link>
          )}
        </div>
      </div>

      {/* 68-86 */}
      <PurchasingKpiStrip summary={summaryQuery.data} />

      {/* 89-94 */}
      <PurchasingTabs active={activeTab} />

      {/* Kaynağı olmayan İKİ sütun tek bantta ADIYLA sayılır — sessiz atlama
          YASAK (WORKFLOW §3). Hücreler de kendi `title`/`sr-only` gerekçesini
          taşır; bant görünür olanıdır. */}
      <p className="sat__notice sat__notice--muted" data-testid="sat-pending-notice">
        “Miktar” ve “Teklif” sütunları liste ucundan gelmiyor (talep satırı
        kalem taşımaz): {pendingModuleLabel(QUANTITY_PENDING_MODULE)} ·{" "}
        {pendingModuleLabel(QUOTE_COUNT_PENDING_MODULE)}. Değerler talebin
        teklif ekranında görünür.
      </p>

      {truncation.isTruncated && (
        <p className="sat__notice" data-testid="sat-truncation-notice">
          {listTruncationMessage(truncation)} Süzgeçleri daraltarak listenin
          tamamını görebilirsiniz.
        </p>
      )}

      {/* Mockup SAT'ta proje/arama süzgeci ÇİZMEZ (yalnız sekme şeridi var) —
          bu yüzden bir süzgeç çubuğu İCAT EDİLMEZ. Ama iki süzgeç URL'den
          gelebilir (paylaşılan bağlantı, T4'ün tedarikçi/proje geçişleri):
          etkin olduklarında GÖRÜNÜR bir bant + temizleme düğmesi basılır,
          yoksa kullanıcı eksik listeye "boş" der. */}
      {(projectId.length > 0 || query.length > 0) && (
        <div className="sat__notice sat__filter-notice" data-testid="sat-filter-notice">
          <span>
            Süzgeç etkin:
            {projectId.length > 0 &&
              ` proje = ${projectNames.get(projectId) ?? projectId}`}
            {projectId.length > 0 && query.length > 0 && " ·"}
            {query.length > 0 && ` arama = “${query}”`}
          </span>
          <Button variant="secondary" size="sm" onClick={clearSideFilters}>
            Süzgeci temizle
          </Button>
        </div>
      )}

      {/* 97-156 */}
      <PurchaseRequestsTable
        rows={rows}
        projectNames={projectNames}
        isLoading={requestsQuery.isLoading}
        isError={requestsQuery.isError}
        errorMessage={
          requestsQuery.isError
            ? backendErrorMessage(requestsQuery.error, "Talep listesi yüklenemedi.")
            : undefined
        }
        hasFilter={hasFilter}
      />
    </div>
  );
}
