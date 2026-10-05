"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import {
  APPROVAL_INBOX_MAX_LIMIT,
  useApprovalHistory,
  useApprovalInbox,
  useApprovalSettings,
  useApproveApprovalItem,
  type ApprovalInboxItem,
} from "@/lib/api/hooks/useApprovals";
import { isForbidden } from "@/lib/api/unwrap";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";
import { APPROVAL_TAB_PARAM } from "@/lib/routes";

import { ApprovalCard } from "./ApprovalCard";
import { ApprovalFlowStrip } from "./ApprovalFlowStrip";
import { ApprovalRejectModal } from "./ApprovalRejectModal";
import {
  APPROVAL_APPROVE_ERROR_FALLBACK,
  APPROVAL_BULK_DISABLED_REASON,
  APPROVAL_BULK_LABEL,
  APPROVAL_DEFAULT_TAB_KEY,
  APPROVAL_TABS,
  approvalTabLabel,
  parseApprovalTab,
  type ApprovalTabKey,
} from "./approval-labels";
import "./approvals.css";

const PAGE_TITLE = "Onay Kutusu";
const LOADING_MESSAGE = "Yükleniyor…";
const LIST_ERROR_FALLBACK = "Onay kutusu yüklenemedi.";
const SETTINGS_ERROR_FALLBACK = "Onay eşiği yüklenemedi; akış şeridinde eşik gösterilemiyor.";

/**
 * F-OK T5 · `/onay-kutusu` — kanon `projedesign/Onay Kutusu.dc.html`
 * (yorumlardaki sayılar O dosyanın SATIR numaralarıdır).
 *
 * Mockup'ın KENDİ üst barı (`:23-35`) ve sol menüsü BASILMAZ: kabuk canon'u
 * kazanır (F3 Topbar + Sidebar) — emsal `FinancialInstrumentsView`. Üst barın
 * yalnız iki parçası sayfaya TAŞINDI: `:32` "{total} bekleyen" ve `:33`
 * "Tümünü Onayla" (devre dışı, gerekçesi görünür).
 *
 * 🔴 ÖN YETKİ KAPISI YOKTUR (`useModulePermission` KULLANILMAZ). Sözleşme bunu
 * açıkça yasaklar (`GET /approvals` açıklaması, openapi.json):
 *   "Ayri bir yetki kapisi YOKTUR ve olmamalidir: donen kume zaten 'bu adim
 *    SANA dustu' olgusuyla sinirlidir; `approvals` izni dusuk olan bir rol de
 *    kendine dusen imzayi gormek zorundadir (matriste sef/saha/IK = `_OWN`)."
 * `useModulePermission(...).canView` seviye `"none"` olduğunda kapatır — yani
 * zincirde adımı olan ama modül izni `none` olan bir kullanıcıyı KENDİ
 * İMZASINDAN kilitlerdi. Geriye yalnız 403 TÜREVLİ `AccessDenied` kalır.
 *
 * ⚠️ İKİ BAĞIMSIZ VERİ KAYNAĞI (`/approvals` + `/approvals/settings`): her biri
 * KENDİ yükleme/hata yolunu işletir ve "yüklendi" bayrağı KAYNAK BAŞINA basılır
 * — tek bayrak ikincisinin hâlâ pending olduğunu GİZLERDİ (F-İK dersi).
 */
export function ApprovalsView() {
  // OKT-F1.2 — açık sekme URL'dedir (`?sekme=`, parametresiz = Benim Onayım):
  // paylaşılabilir/yenilemeye dayanıklı; tek kaynak URL, yerel kopya yok.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = parseApprovalTab(searchParams.get(APPROVAL_TAB_PARAM));

  // Kırpma korkuluğu (TB3/F-TH): tavan AÇIKÇA gönderilir, eksik kalan kayıt
  // `total` üzerinden GÖRÜNÜR bir bantla bildirilir. Mockup sayfalama çubuğu
  // ÇİZMEZ (K5, mockup kazanır) — tavanı aşan kullanıcı bandı görür.
  //
  // Bekleyen kutusu HER sekmede çalışır: başlıktaki "{total} bekleyen" sayacının
  // kaynağıdır. Geçmiş sorguları YALNIZ aktif sekme için istek atar (`enabled`);
  // ziyaret edilmiş sekmenin önbelleği yalnız sayaç için okunur.
  const inboxQuery = useApprovalInbox({ limit: APPROVAL_INBOX_MAX_LIMIT });
  const allHistory = useApprovalHistory(
    { decision: "all", limit: APPROVAL_INBOX_MAX_LIMIT },
    { enabled: activeTab.key === "tumu" },
  );
  const approvedHistory = useApprovalHistory(
    { decision: "approved", limit: APPROVAL_INBOX_MAX_LIMIT },
    { enabled: activeTab.key === "onaylanan" },
  );
  const rejectedHistory = useApprovalHistory(
    { decision: "rejected", limit: APPROVAL_INBOX_MAX_LIMIT },
    { enabled: activeTab.key === "reddedilen" },
  );
  const settingsQuery = useApprovalSettings();
  const approveItem = useApproveApprovalItem();

  const [rejectTarget, setRejectTarget] = useState<ApprovalInboxItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const historyQueries = {
    tumu: allHistory,
    onaylanan: approvedHistory,
    reddedilen: rejectedHistory,
  } as const;
  const isHistoryTab = activeTab.historyFilter !== null;
  const historyQuery = activeTab.key === "benim" ? undefined : historyQueries[activeTab.key];
  const activeQuery = historyQuery ?? inboxQuery;

  if (isForbidden(activeQuery.error) || isForbidden(inboxQuery.error) || isForbidden(settingsQuery.error)) {
    return <AccessDenied />;
  }

  const items = activeQuery.data?.items;
  const total = inboxQuery.data?.total;
  const truncation = buildListTruncation(items?.length ?? 0, activeQuery.data?.total);
  const tabCounts: Partial<Record<ApprovalTabKey, number>> = {
    benim: total,
    tumu: allHistory.data?.total,
    onaylanan: approvedHistory.data?.total,
    reddedilen: rejectedHistory.data?.total,
  };

  /** `replace` — sekme geçişi geçmişi ŞİŞİRMEZ; varsayılan sekme parametreyi siler. */
  function selectTab(key: ApprovalTabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === APPROVAL_DEFAULT_TAB_KEY) params.delete(APPROVAL_TAB_PARAM);
    else params.set(APPROVAL_TAB_PARAM, key);
    const next = params.toString();
    router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  function handleApprove(item: ApprovalInboxItem) {
    setActionError(null);
    approveItem.mutate(
      { documentType: item.document_type, documentId: item.document_id },
      { onError: (error) => setActionError(backendErrorMessage(error, APPROVAL_APPROVE_ERROR_FALLBACK)) },
    );
  }

  return (
    <div className="ok">
      <div className="ok__head">
        <h1 className="ok__title">{PAGE_TITLE}</h1>
        {/* :32 — sayı SUNUCUNUN `total`idir, uydurulmaz. */}
        {total !== undefined && (
          <span className="ok__pending" data-testid="ok-pending-count">
            {total} bekleyen
          </span>
        )}
        {/* :33 — rotası/ucu olmayan mockup öğesi SİLİNMEZ, DEVRE DIŞI basılır
            ve gerekçesi hem `title` hem `sr-only` hem GÖRÜNÜR bantla taşınır. */}
        <Button
          variant="success"
          disabled
          title={APPROVAL_BULK_DISABLED_REASON}
          data-testid="ok-bulk-approve"
        >
          {APPROVAL_BULK_LABEL}
          <span className="sr-only"> — {APPROVAL_BULK_DISABLED_REASON}</span>
        </Button>
      </div>
      <p className="ok-notice" data-testid="ok-bulk-reason">
        {APPROVAL_BULK_DISABLED_REASON}
      </p>

      {/* :42-68 — eşik ayarı KENDİ hata yolunu işletir; liste onsuz da yaşar. */}
      {settingsQuery.isError && (
        <p className="ok-notice ok-notice--danger" data-testid="ok-settings-error">
          {backendErrorMessage(settingsQuery.error, SETTINGS_ERROR_FALLBACK)}
        </p>
      )}
      <ApprovalFlowStrip threshold={settingsQuery.data?.approval_threshold_try} />

      {/* :71-76 — DÖRT sekme de çalışır (OKT-F1.2). */}
      <ApprovalTabs activeKey={activeTab.key} counts={tabCounts} onSelect={selectTab} />

      {truncation.isTruncated && (
        <p className="ok-notice" data-testid="ok-truncation">
          {listTruncationMessage(truncation)}
        </p>
      )}

      {actionError !== null && (
        <p className="ok-notice ok-notice--danger" data-testid="ok-action-error">
          {actionError}
        </p>
      )}

      {activeQuery.isError && (
        <p className="ok-notice ok-notice--danger" data-testid="ok-list-error">
          {backendErrorMessage(activeQuery.error, LIST_ERROR_FALLBACK)}
        </p>
      )}

      {/* :79-240 */}
      {activeQuery.isLoading ? (
        <p className="ok-empty" data-testid="ok-loading">
          {LOADING_MESSAGE}
        </p>
      ) : items !== undefined && items.length === 0 ? (
        <p className="ok-empty" data-testid="ok-empty">
          {activeTab.emptyMessage}
        </p>
      ) : (
        <div className="ok-list" data-testid="ok-list">
          {isHistoryTab
            ? historyQuery?.data?.items.map((item) => (
                <ApprovalCard key={item.chain_id} mode="history" item={item} />
              ))
            : inboxQuery.data?.items.map((item) => (
                <ApprovalCard
                  key={item.chain_id}
                  item={item}
                  isPending={approveItem.isPending}
                  onApprove={handleApprove}
                  onReject={(target) => {
                    setActionError(null);
                    setRejectTarget(target);
                  }}
                />
              ))}
        </div>
      )}

      {rejectTarget !== null && (
        <ApprovalRejectModal item={rejectTarget} onClose={() => setRejectTarget(null)} />
      )}

      {/* Görsel spec "yüklendi" iddiasını KAYNAK BAŞINA kurar (liste = AKTİF sekme). */}
      {activeQuery.data !== undefined && <span hidden data-testid="ok-loaded-list" />}
      {settingsQuery.data !== undefined && <span hidden data-testid="ok-loaded-settings" />}
    </div>
  );
}

/**
 * :71-76 · sekme şeridi — OKT-F1.2'de DÖRDÜ de tıklanır. Sayı yalnız o sekmenin
 * verisi yüklendiyse basılır (`counts[key]`); yüklenmemiş sekme sayaçsızdır.
 */
function ApprovalTabs({
  activeKey,
  counts,
  onSelect,
}: {
  activeKey: ApprovalTabKey;
  counts: Partial<Record<ApprovalTabKey, number>>;
  onSelect: (key: ApprovalTabKey) => void;
}) {
  return (
    <div className="ok-tabs" role="tablist" aria-label="Onay kutusu sekmeleri">
      {APPROVAL_TABS.map((tab) => {
        const isActive = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            className="ok-tab"
            aria-selected={isActive}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onSelect(tab.key)}
            data-testid={`ok-tab-${tab.key}`}
          >
            {approvalTabLabel(tab, counts[tab.key])}
          </button>
        );
      })}
    </div>
  );
}
