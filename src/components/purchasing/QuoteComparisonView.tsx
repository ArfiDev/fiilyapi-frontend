"use client";

import { useState } from "react";
import Link from "next/link";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { ConfirmDialog } from "@/components/settings/ConfirmDialog";
import { Alert, Badge, Button } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useProjects } from "@/lib/api/hooks/useProjects";
import { usePurchaseRequest } from "@/lib/api/hooks/usePurchaseRequests";
import { useSelectQuoteAndOrder } from "@/lib/api/hooks/useQuoteMutations";
import { useQuotes } from "@/lib/api/hooks/useQuotes";
import { downloadQuoteComparisonExport } from "@/lib/api/purchase-quote-client";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { PROCUREMENT_EDIT, QUOTE_ORDER_APPROVE } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { formatDateDots, formatQuantity } from "@/lib/format";

import { QuoteComparisonCard } from "./QuoteComparisonCard";
import { QuoteComparisonSummary } from "./QuoteComparisonSummary";
import { QuoteCreateModal } from "./QuoteCreateModal";
import { bestPriceQuotes, requestMaterialLabel, requestQuantityUnit } from "./quote-comparison";
import {
  PROJECT_NAME_UNRESOLVED_REASON,
  PURCHASE_PRIORITY_LABELS,
  PURCHASING_ROOT_HREF,
  PURCHASING_PERMISSION_MODULE,
} from "./purchasing-labels";
import "./purchasing.css";

/**
 * TEK · `/satinalma/talepler/[id]/teklifler` — mockup
 * `Satınalma - Teklifler.dc.html` (kanonik). Yorumlardaki sayılar O dosyanın
 * SATIR numaralarıdır.
 *
 * Mockup'ın kendi üst barı (14-22) ve sol menüsü (24-32) BASILMAZ: kabuk canon
 * kazanır (F3 Topbar + Sidebar).
 *
 * ⚠️ Ekran İKİ ucu birden okur: talep detayı (`GET /purchase-requests/{id}` —
 * özet şeridinin kalemleri; liste satırı KALEM TAŞIMAZ) ve teklifler
 * (`GET …/quotes`). Rozet/toplam türevleri SUNUCUDAN gelir.
 */

const MESSAGES = {
  noWritePermission: "Bu modülde yazma yetkiniz yok.",
  alreadyOrdered: "Bu talep için sipariş zaten oluşturulmuş.",
  noBestPrice: "Sunucu henüz bir “en iyi fiyat” damgası vermedi.",
  bestPriceTied: "Birden çok teklif aynı toplamda — kartlardan birini seçin.",
  exportFailed: "Excel dışa aktarımı başarısız oldu.",
  selectFailed: "Sipariş oluşturulamadı.",
} as const;

/** Talebin durumu siparişe kapalı mı — sunucu 409'una düşmeden önce ekranda. */
const CLOSED_STATUSES = new Set(["ordered", "delivered"]);

export interface QuoteComparisonViewProps {
  requestId: string;
}

export function QuoteComparisonView({ requestId }: QuoteComparisonViewProps) {
  const permission = useModulePermission(PURCHASING_PERMISSION_MODULE);
  // IZN-F2.x · teklif ekle = stok.teklif_karsilastirma Düzenler; Seç ve Sipariş Ver = stok.teklif_karsilastirma Onaylar.
  const canAddQuote = useButtonGate({ pages: PROCUREMENT_EDIT, need: "edit", fallback: permission.canWrite });
  const canOrder = useButtonGate({ pages: QUOTE_ORDER_APPROVE, need: "approve", fallback: permission.canWrite });

  const requestQuery = usePurchaseRequest(requestId);
  const quotesQuery = useQuotes(requestId);
  const projectsQuery = useProjects();
  const selectAndOrder = useSelectQuoteAndOrder(requestId);

  const [pendingQuoteId, setPendingQuoteId] = useState<string | null>(null);
  const [isQuoteDialogOpen, setIsQuoteDialogOpen] = useState(false);
  const [orderedNo, setOrderedNo] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (
    !permission.canView ||
    isForbidden(requestQuery.error) ||
    isForbidden(quotesQuery.error)
  ) {
    return <AccessDenied />;
  }

  const request = requestQuery.data;
  const items = quotesQuery.data?.items ?? [];
  const lines = request?.lines ?? [];
  const material = requestMaterialLabel(lines);
  const quantityUnit = requestQuantityUnit(lines);
  const quantityTotal = quotesQuery.data?.request_quantity_total ?? null;
  const projectName = request
    ? (projectsQuery.data?.items ?? []).find((project) => project.id === request.project_id)?.name
    : undefined;

  const isClosed = request !== undefined && CLOSED_STATUSES.has(request.status);
  const selectDisabledReason = !canOrder
    ? MESSAGES.noWritePermission
    : isClosed
      ? MESSAGES.alreadyOrdered
      : undefined;
  const canSelect = selectDisabledReason === undefined;

  // 39 · başlıktaki "Sipariş Ver" SUNUCUNUN rozetlediği teklifi hedefler
  // (mockup'ta vurgulu kartın düğmesiyle aynı teklif). Beraberlikte hedef
  // BELİRSİZDİR → düğme devre dışı kalır ve kullanıcı kartlardan seçer;
  // keyfi bir teklifi sipariş etmek geri alınamaz bir karar olurdu.
  const bestQuotes = bestPriceQuotes(items);
  const headerTarget = bestQuotes.length === 1 ? bestQuotes[0] : null;
  const headerDisabledReason =
    selectDisabledReason ??
    (bestQuotes.length > 1
      ? MESSAGES.bestPriceTied
      : headerTarget === null
        ? MESSAGES.noBestPrice
        : undefined);

  const pendingQuote = items.find((item) => item.id === pendingQuoteId) ?? null;

  async function handleExport() {
    setActionError(null);
    try {
      await downloadQuoteComparisonExport(requestId);
    } catch (error) {
      setActionError(backendErrorMessage(error, MESSAGES.exportFailed));
    }
  }

  function handleConfirmOrder() {
    if (pendingQuoteId === null) return;
    selectAndOrder.mutate(pendingQuoteId, {
      onSuccess: (order) => {
        setPendingQuoteId(null);
        setActionError(null);
        // Sunucunun doğurduğu siparişin NUMARASI görünür kılınır — "oldu mu?"
        // sorusu ekranda cevaplanır (emirdeki görünür sonuç uyarısı).
        setOrderedNo(order.order_no);
      },
      onError: (error) => setActionError(backendErrorMessage(error, MESSAGES.selectFailed)),
    });
  }

  return (
    <div className="tek">
      {/* 34 */}
      <p className="sat__eyebrow">
        <Link href={PURCHASING_ROOT_HREF} className="tek__back">
          ← Satınalma &amp; Teklif
        </Link>
        {request && ` · ${material ?? "—"} – ${request.request_no}`}
      </p>

      {/* 35-41 */}
      <div className="sat__head">
        <h1 className="sat__title">Teklif Karşılaştırması</h1>
        <div className="sat__actions">
          {/* K5 ONAYLI SAPMA: teklif giriş yüzeyi mockup'ta yoktur ama
              teklifler bir yerden girilmelidir (türetilmiş minimal diyalog). */}
          {canAddQuote && !isClosed && (
            <Button
              variant="secondary"
              onClick={() => setIsQuoteDialogOpen(true)}
              data-testid="tek-add-quote"
            >
              + Teklif Ekle
            </Button>
          )}
          {/* 38 — ikili indirme deseni (`purchase-quote-client.ts`) */}
          <Button variant="secondary" onClick={handleExport} data-testid="tek-export">
            Excel
          </Button>
          {/* 39 */}
          <Button
            variant="primary"
            disabled={headerDisabledReason !== undefined || selectAndOrder.isPending}
            title={headerDisabledReason}
            onClick={() => headerTarget && setPendingQuoteId(headerTarget.id)}
            data-testid="tek-order-best"
          >
            Sipariş Ver
            {headerDisabledReason && <span className="sr-only"> — {headerDisabledReason}</span>}
          </Button>
        </div>
      </div>

      {orderedNo !== null && (
        <Alert variant="success" data-testid="tek-order-result">
          Sipariş oluşturuldu: <strong>{orderedNo}</strong>. Talep artık “Sipariş
          Verildi” durumundadır.
        </Alert>
      )}
      {actionError !== null && (
        <Alert variant="danger" data-testid="tek-action-error">
          {actionError}
        </Alert>
      )}

      {/* 44-50 · talep özeti şeridi — DEĞERLER talep detayından gelir */}
      <section className="tek-strip" aria-label="Talep özeti" data-testid="tek-request-strip">
        <div className="tek-strip__item">
          <div className="tek-strip__label">Malzeme</div>
          <div className="tek-strip__value">{material ?? "—"}</div>
        </div>
        <div className="tek-strip__item">
          <div className="tek-strip__label">Miktar</div>
          {/* Taban SUNUCUNUN `request_quantity_total`ıdır (`total_cost`un
              çarpanı); birim yalnız kalemler tek birimdeyse basılır. */}
          <div className="tek-strip__value" data-testid="tek-strip-quantity">
            {quantityTotal === null
              ? "—"
              : `${formatQuantity(quantityTotal)}${quantityUnit ? ` ${quantityUnit}` : ""}`}
          </div>
        </div>
        <div className="tek-strip__item">
          <div className="tek-strip__label">Proje</div>
          <div className="tek-strip__value">
            {projectName ?? (
              <span className="sat-pending-cell" title={PROJECT_NAME_UNRESOLVED_REASON}>
                —<span className="sr-only">{PROJECT_NAME_UNRESOLVED_REASON}</span>
              </span>
            )}
          </div>
        </div>
        <div className="tek-strip__item">
          <div className="tek-strip__label">Talep Tarihi</div>
          <div className="tek-strip__value">
            {request ? formatDateDots(request.request_date) : "—"}
          </div>
        </div>
        {/* 49 — "Aciliyet" rozeti sunucunun `priority` damgasıdır */}
        <div className="tek-strip__item">
          <div className="tek-strip__label">Aciliyet</div>
          <div className="tek-strip__value">
            {request ? (
              <Badge
                variant={request.priority === "normal" ? "neutral" : "danger"}
                className="sat-badge"
                data-testid="tek-priority"
              >
                {PURCHASE_PRIORITY_LABELS[request.priority]}
              </Badge>
            ) : (
              "—"
            )}
          </div>
        </div>
      </section>

      {/* 53-116 · mockup'ın ÜÇ örnek kartı SABİT BASILMAZ — hepsi veriden gelir */}
      <div className="tek-grid">
        {items.map((quote) => (
          <QuoteComparisonCard
            key={quote.id}
            quote={quote}
            quantityUnit={quantityUnit}
            canSelect={canSelect}
            disabledReason={selectDisabledReason}
            isPending={selectAndOrder.isPending}
            onSelect={() => setPendingQuoteId(quote.id)}
          />
        ))}
      </div>

      {items.length === 0 && (
        <p className="tek-empty" data-testid="tek-empty">
          {quotesQuery.isLoading
            ? "Teklifler yükleniyor…"
            : quotesQuery.isError
              ? backendErrorMessage(quotesQuery.error, "Teklifler yüklenemedi.")
              : "Bu talep için henüz teklif girilmedi."}
        </p>
      )}

      {/* 119-127 */}
      <QuoteComparisonSummary
        items={items}
        estimatedTotal={request?.estimated_total ?? null}
        quantityTotal={quantityTotal}
        quantityUnit={quantityUnit}
      />

      {/* Onay diyalogu: işlem GERİ ALINAMAZ (sipariş doğurur + talebi
          `ordered` yapar), bu yüzden tek tıkla yapılmaz. */}
      {pendingQuote && (
        <ConfirmDialog
          title="Siparişi onaylıyor musunuz?"
          message={`${pendingQuote.supplier_name} teklifi seçilecek ve bu talep için sipariş oluşturulacak. İşlem geri alınamaz; talep “Sipariş Verildi” durumuna geçer.`}
          confirmLabel="Sipariş Ver"
          isPending={selectAndOrder.isPending}
          errorText={actionError}
          onConfirm={handleConfirmOrder}
          onClose={() => setPendingQuoteId(null)}
        />
      )}

      {isQuoteDialogOpen && (
        <QuoteCreateModal requestId={requestId} onClose={() => setIsQuoteDialogOpen(false)} />
      )}
    </div>
  );
}
