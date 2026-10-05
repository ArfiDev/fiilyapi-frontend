"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Badge, Button, Input, Select } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { INVOICE_LIST_MAX_LIMIT, useInvoices, useInvoiceSummary } from "@/lib/api/hooks/useInvoices";
import { useInvoiceAction } from "@/lib/api/hooks/useInvoiceMutations";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { INVOICE_APPROVE, INVOICING_EDIT, INVOICING_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { formatMonthName } from "@/lib/format";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";

import { IncomingInvoicesTable } from "./IncomingInvoicesTable";
import { InvoiceKpiStrip } from "./InvoiceKpiStrip";
import { OutgoingInvoicesTable } from "./OutgoingInvoicesTable";
import {
  INVOICE_CREATE_URL,
  INVOICE_PERMISSION_MODULE,
  monthRangeOf,
  OUTGOING_STATUS_FILTERS,
  REASONS,
  statusForFilterValue,
} from "./invoice-labels";
import "./invoices.css";

const TAB_PARAM = "tab";
const STATUS_PARAM = "durum";
const SEARCH_PARAM = "ara";

type TabKey = "giden" | "gelen";

const WRITE_DISABLED_REASON = "Fatura yönetiminde yazma yetkiniz yok.";

/**
 * FY · `/faturalar` — mockup `Fatura Yönetimi.dc.html` (kanonik). Yorumlardaki
 * sayılar O dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın kendi üst barı (14-26) ve sol menüsü (29-57) BASILMAZ: kabuk canon
 * kazanır (F3 Topbar + Sidebar).
 *
 * ⚠️ VERİ KAYNAKLARI (T3 görsel spec'i için): KPI özeti · giden liste · gelen
 * liste. "Giden Faturalar" sekmesinde ÜÇÜ de canlıdır; "Gelen Faturalar"
 * sekmesinde giden sorgusu KAPALIDIR (2 kaynak). Her biri kendi
 * yükleme/hata yolunu işletir — biri patlayınca diğerleri yaşar.
 *
 * ⚠️ SÜZGEÇLER SUNUCUYA GİDER (`status`, `q`, `date_from`/`date_to`);
 * istemcide süzülen hiçbir şey YOKTUR — aksi hâlde sayfalanan kümenin
 * dışındaki kayıtlar sessizce kaybolurdu.
 */
export function InvoicesView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const permission = useModulePermission(INVOICE_PERMISSION_MODULE);
  const canViewInvoicing = useButtonGate({ pages: INVOICING_VIEW, need: "view", fallback: permission.canView });
  // IZN-F2.x · Yeni Fatura = mali.fatura Düzenler; gelen faturada Onayla = mali.fatura Onaylar.
  const canCreateInvoice = useButtonGate({ pages: INVOICING_EDIT, need: "edit", fallback: permission.canWrite });
  const canApproveInvoice = useButtonGate({ pages: INVOICE_APPROVE, need: "approve", fallback: permission.canWrite });

  // 📅 Dönem penceresinin TEK referansı; mount başına bir kez üretilir
  // (`PurchaseOrdersView` deseni) — bileşenler `new Date()` çağırmaz, testler
  // ve görsel kareler deterministik kalır.
  const [today] = useState(() => new Date());
  const month = monthRangeOf(today);

  const tab: TabKey = searchParams.get(TAB_PARAM) === "gelen" ? "gelen" : "giden";
  const statusFilterValue = searchParams.get(STATUS_PARAM) ?? "";
  const search = searchParams.get(SEARCH_PARAM) ?? "";
  const [searchDraft, setSearchDraft] = useState(search);

  const summaryQuery = useInvoiceSummary();

  // FY:90 başlığı bir AY yazar → liste de o aya süzülür (başlık yalan
  // söylemesin). Kırpma korkuluğu: tavan AÇIKÇA gönderilir.
  const outgoingQuery = useInvoices({
    enabled: tab === "giden",
    direction: "outgoing",
    limit: INVOICE_LIST_MAX_LIMIT,
    dateFrom: month.from,
    dateTo: month.to,
    ...(statusForFilterValue(statusFilterValue) !== undefined
      ? { status: statusForFilterValue(statusFilterValue) }
      : {}),
    ...(search.length > 0 ? { q: search } : {}),
  });

  // FY:150 "Onay Bekleyen (3)" — giden sekmesinde YALNIZ `pending` gelenler
  // listelenir; "Gelen Faturalar" sekmesinde durum süzgeci kalkar.
  const incomingQuery = useInvoices({
    direction: "incoming",
    limit: INVOICE_LIST_MAX_LIMIT,
    ...(tab === "giden" ? { status: "pending" as const } : {}),
  });

  const approveMutation = useInvoiceAction();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  if (!canViewInvoicing || isForbidden(outgoingQuery.error) || isForbidden(incomingQuery.error)) {
    return <AccessDenied />;
  }

  const outgoingRows = outgoingQuery.data?.items;
  const outgoingTruncation = buildListTruncation(
    outgoingRows?.length ?? 0,
    outgoingQuery.data?.total,
  );
  const incomingRows = incomingQuery.data?.items;
  const incomingTruncation = buildListTruncation(
    incomingRows?.length ?? 0,
    incomingQuery.data?.total,
  );

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value.length === 0) params.delete(key);
    else params.set(key, value);
    const next = params.toString();
    router.replace(next.length > 0 ? `${pathname}?${next}` : pathname, { scroll: false });
  }

  /**
   * FY:171 "Onayla" — fatura kimliği mutation DEĞİŞKENİDİR (satır başına hook
   * açılamaz, Rules of Hooks). Hata YUTULMAZ: sunucunun Türkçe `detail` metni
   * (ör. kalemsiz faturada 422) tablonun üstünde basılır.
   */
  function handleApprove(invoiceId: string) {
    setApprovingId(invoiceId);
    setApproveError(null);
    approveMutation.mutate({ invoiceId, action: "approve" }, {
      onSettled: () => setApprovingId(null),
      onError: (error) =>
        setApproveError(backendErrorMessage(error, "Fatura onaylanamadı.")),
    });
  }

  return (
    <div className="fat">
      {/* 19 — kabuktaki breadcrumb'ın metin karşılığı */}
      <p className="fat__eyebrow">Mali</p>

      <div className="fat__head">
        <div className="fat__title-row">
          <h1 className="fat__title">Fatura Yönetimi</h1>
          {/* 20 "GİB Bağlı ✓" — karşılığı YOK; rozet SİLİNMEZ, solgun basılır. */}
          <span className="fat-disabled-surface" title={REASONS.gib} data-testid="fat-gib-badge">
            <Badge variant="neutral">
              GİB Bağlı<span className="sr-only"> — {REASONS.gib}</span>
            </Badge>
          </span>
        </div>
        <div className="fat__actions">
          {/* 23 — devre dışı, gerekçesi görünür. */}
          <Button disabled title={REASONS.gib} data-testid="fat-gib-pull">
            GİB&apos;den Çek
          </Button>
          {/* 24 — GERÇEK rota. */}
          <Link href={INVOICE_CREATE_URL} data-testid="fat-create-link">
            <Button variant="primary" disabled={!canCreateInvoice} title={canCreateInvoice ? undefined : WRITE_DISABLED_REASON}>
              + Fatura Kes
            </Button>
          </Link>
        </div>
      </div>

      <p className="fat-notice" data-testid="fat-gib-reason">
        {REASONS.gib} {REASONS.tabCounts}
      </p>

      {/* 61-66 — DÖRT sekme; ikisi canlı, ikisi devre dışı (gerekçeli). */}
      <div className="fat-tabs" role="tablist" aria-label="Fatura sekmeleri">
        <button
          type="button"
          className="fat-tab"
          aria-current={tab === "giden" ? "page" : undefined}
          data-testid="fat-tab-giden"
          onClick={() => setParam(TAB_PARAM, "")}
        >
          Giden Faturalar
          {tab === "giden" && outgoingQuery.data ? ` (${outgoingQuery.data.total})` : ""}
        </button>
        <button
          type="button"
          className="fat-tab"
          aria-current={tab === "gelen" ? "page" : undefined}
          data-testid="fat-tab-gelen"
          onClick={() => setParam(TAB_PARAM, "gelen")}
        >
          Gelen Faturalar
          {tab === "gelen" && incomingQuery.data ? ` (${incomingQuery.data.total})` : ""}
        </button>
        {/* 64 · 65 — SİLİNMEZ, devre dışı + gerekçe. */}
        <button
          type="button"
          className="fat-tab"
          disabled
          title={REASONS.earchiveTab}
          data-testid="fat-tab-earsiv"
        >
          e-Arşiv<span className="sr-only"> — {REASONS.earchiveTab}</span>
        </button>
        <button
          type="button"
          className="fat-tab"
          disabled
          title={REASONS.disputeTab}
          data-testid="fat-tab-itiraz"
        >
          İtiraz/İade<span className="sr-only"> — {REASONS.disputeTab}</span>
        </button>
      </div>

      {/* 69-75 */}
      {summaryQuery.isError && (
        <p className="fat-notice fat-notice--danger" data-testid="fat-summary-error">
          {backendErrorMessage(summaryQuery.error, "KPI özeti yüklenemedi.")}
        </p>
      )}
      <InvoiceKpiStrip summary={summaryQuery.data} />

      {/* 78-85 — otomasyon bandı: metni durur, GERÇEKLİĞİ düzeltilir. */}
      <p className="fat-notice fat-notice--info" data-testid="fat-automation-notice">
        Hakediş &rarr; Fatura otomasyonu: {REASONS.automation}
      </p>

      {tab === "giden" && (
        <section className="fat-panel" aria-label="Giden Faturalar">
          {/* 89-95 */}
          <div className="fat-panel__head">
            <span className="fat-panel__title">
              Giden Faturalar — {formatMonthName(month.month)} {month.year}
            </span>
            {/* 91 — ham <select> YASAK; `Select` primitive'i. */}
            <Select
              size="row"
              aria-label="Durum süzgeci"
              value={statusFilterValue}
              data-testid="fat-status-filter"
              onChange={(event) => setParam(STATUS_PARAM, event.target.value)}
            >
              <option value="">Tüm Durumlar</option>
              {OUTGOING_STATUS_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            {/* 92-95 */}
            <form
              className="fat-panel__search"
              onSubmit={(event) => {
                event.preventDefault();
                setParam(SEARCH_PARAM, searchDraft.trim());
              }}
            >
              <Input
                size="row"
                aria-label="Fatura ara"
                placeholder="Fatura ara..."
                value={searchDraft}
                data-testid="fat-search"
                onChange={(event) => setSearchDraft(event.target.value)}
              />
            </form>
          </div>

          <div className="fat-panel__body">
            {statusFilterValue === "due" && (
              <p className="fat-notice" data-testid="fat-due-filter-notice">
                “Vadeli” ayrı bir durum değildir: vadesi girilmiş “Gönderildi”
                faturalardır, bu yüzden sunucuya aynı süzgeç gider.
              </p>
            )}
            {outgoingTruncation.isTruncated && (
              <p className="fat-notice" data-testid="fat-outgoing-truncation">
                {listTruncationMessage(outgoingTruncation)}
              </p>
            )}
            <OutgoingInvoicesTable
              rows={outgoingRows}
              isLoading={outgoingQuery.isLoading}
              errorMessage={
                outgoingQuery.isError
                  ? backendErrorMessage(outgoingQuery.error, "Giden fatura listesi yüklenemedi.")
                  : undefined
              }
            />
            <p className="fat-notice" data-testid="fat-outgoing-pending-notice">
              “GİB” sütununun karşılığı yok: {REASONS.gib} “Kaynak” sütunu yalnız
              türü gösterir: {REASONS.sourceNumber}
            </p>
          </div>
        </section>
      )}

      <section className="fat-panel" aria-label="Gelen Faturalar">
        {/* 149-152 */}
        <div className="fat-panel__head fat-panel__head--incoming">
          <span className="fat-panel__title fat-panel__title--incoming">
            {tab === "giden" ? "Gelen Faturalar — Onay Bekleyen" : "Gelen Faturalar"}
            {incomingQuery.data ? ` (${incomingQuery.data.total})` : ""}
          </span>
          <span className="fat-panel__hint">Hakediş ve sipariş eşleştirmesi yapılmalı</span>
        </div>
        <div className="fat-panel__body">
          {approveError !== null && (
            <p className="fat-notice fat-notice--danger" data-testid="fat-approve-error">
              {approveError}
            </p>
          )}
          {incomingTruncation.isTruncated && (
            <p className="fat-notice" data-testid="fat-incoming-truncation">
              {listTruncationMessage(incomingTruncation)}
            </p>
          )}
          <IncomingInvoicesTable
            rows={incomingRows}
            isLoading={incomingQuery.isLoading}
            errorMessage={
              incomingQuery.isError
                ? backendErrorMessage(incomingQuery.error, "Gelen fatura listesi yüklenemedi.")
                : undefined
            }
            onApprove={handleApprove}
            approvingId={approvingId}
            canWrite={canApproveInvoice}
            writeDisabledReason={WRITE_DISABLED_REASON}
            tab={tab}
          />
        </div>
      </section>

      {/* Görsel spec (T3) "yüklendi" iddiasını KAYNAK BAŞINA kurar — tek bayrak
          ikinci kaynağın hâlâ pending olduğunu GİZLERDİ (F-İK dersi). */}
      {summaryQuery.data !== undefined && <span hidden data-testid="fat-loaded-summary" />}
      {outgoingQuery.data !== undefined && <span hidden data-testid="fat-loaded-outgoing" />}
      {incomingQuery.data !== undefined && <span hidden data-testid="fat-loaded-incoming" />}
    </div>
  );
}
