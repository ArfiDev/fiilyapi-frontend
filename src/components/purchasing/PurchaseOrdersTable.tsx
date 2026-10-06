"use client";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";

import { Badge, Button } from "@/components/ui";
import { formatCurrency, formatDateDots } from "@/lib/format";
import { pendingModuleLabel } from "@/lib/pending-modules";
import type { PurchaseOrderResponse } from "@/lib/api/hooks/usePurchaseOrders";

import { deliveryTone } from "./purchase-order-delivery";
import {
  PROJECT_NAME_UNRESOLVED_REASON,
  PURCHASE_ORDER_STATUS_BADGE_VARIANTS,
  PURCHASE_ORDER_STATUS_LABELS,
} from "./purchasing-labels";
import "./purchasing.css";

/**
 * Kaynağı olmayan sütunların/düğmelerin pending anahtarları. Gerekçe METNİ tek
 * kaynaktan (`pendingModuleLabel`) gelir — hücrelere elle cümle yazılmaz.
 */
export const ORDER_MATERIAL_PENDING_MODULE = "purchase_order_material";
export const ORDER_QUANTITY_PENDING_MODULE = "purchase_order_quantity";
export const ORDER_DETAIL_PENDING_MODULE = "purchase_order_detail";

/** Talepsiz (doğrudan) siparişin "Talep No" alt satırı — şemada `null`dur. */
export const DIRECT_ORDER_REASON = "Talebe bağlı değil — doğrudan sipariş";

export interface PurchaseOrdersTableProps {
  /** `undefined` ⇒ yükleniyor/hata; satır BASILMAZ (mockup örnekleri sabit değildir). */
  rows: PurchaseOrderResponse[] | undefined;
  /** `project_id` → proje adı; `GET /projects`ten gelir (satır yalnız kimlik taşır). */
  projectNames: ReadonlyMap<string, string>;
  /**
   * Teslimat renginin referansı — ekran TEK yerden verir (gizli `new Date()`
   * yok). Testler ve görsel kareler böyle deterministik kalır.
   */
  today: Date;
  isLoading: boolean;
  isError: boolean;
  /** Sunucunun Türkçe hata cümlesi — sabit cümle 403/404/422 ayrımını yutar. */
  errorMessage?: string;
  /** Süzgeç uygulanmış mı — boş listenin metnini ayırır. */
  hasFilter: boolean;
}

function emptyMessage(options: {
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  hasFilter: boolean;
}): { title: string; hint?: string } {
  if (options.isLoading) return { title: "Sipariş listesi yükleniyor…" };
  if (options.isError) return { title: options.errorMessage ?? "Sipariş listesi yüklenemedi." };
  if (options.hasFilter) {
    return {
      title: "Bu süzgeçle eşleşen sipariş yok.",
      hint: "Durum seçimini “Tüm Durumlar” yapıp yeniden bakın.",
    };
  }
  return {
    title: "Henüz sipariş yok.",
    hint: "Siparişler teklif karşılaştırmasındaki “Sipariş Ver” ile doğar.",
  };
}

/**
 * SIP 45-125 · sipariş tablosu: Sipariş No · Malzeme · Tedarikçi · Proje ·
 * Miktar · Toplam · Teslimat · Durum · (Detay).
 *
 * ⚠️ İKİ SÜTUNUN KAYNAĞI YOK, AMA SÜTUN SİLİNMEZ (F-TH `work_category`
 * emsali): `PurchaseOrderResponse` KALEM TAŞIMAZ — `PurchaseOrderCreate`
 * şeması "KALEM DE YOKTUR … dogrudan siparis tek bir `total_amount` tasir"
 * der. "Malzeme" ve "Miktar" hücreleri "—" + görünür gerekçeyle durur.
 *
 * ⚠️ `request_no` bir TÜREVDİR (JOIN) ve talepsiz siparişte `null`dur. Kendi
 * sütunu mockup'ta YOKTUR — sütun İCAT ETMEK yerine "Sipariş No" hücresinin
 * alt satırında (mockup'ın "Malzeme" hücresindeki iki satırlı ritmiyle aynı)
 * gösterilir; `null` iken "—" + gerekçe basılır.
 *
 * ⚠️ TESLİMAT RENGİ tek istemci türevidir (`purchase-order-delivery.ts`) ve
 * `today` PROPTAN gelir.
 */
export function PurchaseOrdersTable({
  rows,
  projectNames,
  today,
  isLoading,
  isError,
  errorMessage,
  hasFilter,
}: PurchaseOrdersTableProps) {
  const visibleRows = rows ?? [];
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  const message =
    visibleRows.length === 0
      ? emptyMessage({ isLoading, isError, errorMessage, hasFilter })
      : undefined;

  return (
    <div className="sat-card">
      <table className="sat-table">
        <thead>
          {/* 46-56 */}
          <tr>
            <th scope="col" className="sat-table__th sat-table__th--left">
              Sipariş No
            </th>
            <th scope="col" className="sat-table__th sat-table__th--left">
              Malzeme
            </th>
            <th scope="col" className="sat-table__th sat-table__th--left">
              Tedarikçi
            </th>
            <th scope="col" className="sat-table__th sat-table__th--left">
              Proje
            </th>
            <th scope="col" className="sat-table__th sat-table__th--right">
              Miktar
            </th>
            <th scope="col" className="sat-table__th sat-table__th--right">
              Toplam
              <MaskedMark isHidden={isCostHidden} values={visibleRows.map((row) => row.total_amount)} />
            </th>
            <th scope="col" className="sat-table__th sat-table__th--center">
              Teslimat
            </th>
            <th scope="col" className="sat-table__th sat-table__th--center">
              Durum
            </th>
            {/* 55 — mockup'ta başlıksız aksiyon sütunu */}
            <th scope="col" className="sat-table__th sat-table__th--center">
              <span className="sr-only">İşlem</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <PurchaseOrderRow
              key={row.id}
              row={row}
              projectName={projectNames.get(row.project_id)}
              today={today}
            />
          ))}
        </tbody>
      </table>

      {message && (
        <div className="sat-empty">
          <p className="sat-empty__title">{message.title}</p>
          {message.hint && <p className="sat-empty__hint">{message.hint}</p>}
        </div>
      )}
    </div>
  );
}

interface PurchaseOrderRowProps {
  row: PurchaseOrderResponse;
  projectName: string | undefined;
  today: Date;
}

function PurchaseOrderRow({ row, projectName, today }: PurchaseOrderRowProps) {
  const materialReason = pendingModuleLabel(ORDER_MATERIAL_PENDING_MODULE);
  const quantityReason = pendingModuleLabel(ORDER_QUANTITY_PENDING_MODULE);
  const detailReason = pendingModuleLabel(ORDER_DETAIL_PENDING_MODULE);
  const tone = deliveryTone(row.expected_delivery, row.status, today);

  return (
    <tr className="sip-row" data-testid={`sip-row-${row.order_no}`}>
      {/* 59 — sipariş no + türev talep no */}
      <td className="sat-table__td sat-table__td--mono">
        <div className="sip-order-no">{row.order_no}</div>
        {row.request_no === null ? (
          <div
            className="sat-table__note sat-pending-cell"
            title={DIRECT_ORDER_REASON}
            data-testid={`sip-request-${row.order_no}`}
          >
            —<span className="sr-only">{DIRECT_ORDER_REASON}</span>
          </div>
        ) : (
          <div className="sat-table__note" data-testid={`sip-request-${row.order_no}`}>
            {row.request_no}
          </div>
        )}
      </td>

      {/* 60 — kolon SİLİNMEZ, malzeme İCAT EDİLMEZ (sipariş kalem taşımaz) */}
      <td className="sat-table__td">
        <div
          className="sat-table__name sat-pending-cell"
          title={materialReason}
          data-testid={`sip-material-${row.order_no}`}
        >
          —<span className="sr-only">{materialReason}</span>
        </div>
        {/* Mockup'ın ikinci satırı bir NOTTUR (60: "Acil — Stok kritik");
            siparişin kendi `note` alanı buraya düşer. */}
        {row.note !== null && row.note.length > 0 && (
          <div className="sat-table__note">{row.note}</div>
        )}
      </td>

      {/* 61 */}
      <td className="sat-table__td">{row.supplier_name}</td>

      {/* 62 — ad `GET /projects`ten çözülür; çözülemezse uydurma ad YOK */}
      <td className="sat-table__td">
        {projectName ?? (
          <span className="sat-pending-cell" title={PROJECT_NAME_UNRESOLVED_REASON}>
            —<span className="sr-only">{PROJECT_NAME_UNRESOLVED_REASON}</span>
          </span>
        )}
      </td>

      {/* 63 — kolon SİLİNMEZ, miktar İCAT EDİLMEZ */}
      <td
        className="sat-table__td sat-table__td--right sat-pending-cell"
        title={quantityReason}
        data-testid={`sip-quantity-${row.order_no}`}
      >
        —<span className="sr-only">{quantityReason}</span>
      </td>

      {/* 64 — sipariş, teklifin DONMUŞ tutarıdır; istemci yeniden hesaplamaz */}
      <td className="sat-table__td sat-table__td--right sat-table__td--mono sat-table__amount">
        {formatCurrency(row.total_amount)}
      </td>

      {/* 65 — TEK istemci türevi: rengi tarih + durum belirler */}
      <td
        className={`sat-table__td sat-table__td--center sip-delivery sip-delivery--${tone}`}
        data-testid={`sip-delivery-${row.order_no}`}
      >
        {row.expected_delivery === null ? "—" : formatDateDots(row.expected_delivery)}
      </td>

      {/* 66 — rozet SUNUCUNUN `status` damgasıdır */}
      <td className="sat-table__td sat-table__td--center">
        <Badge
          variant={PURCHASE_ORDER_STATUS_BADGE_VARIANTS[row.status]}
          className={`sat-badge sip-badge--${row.status}`}
          data-testid={`sip-status-${row.order_no}`}
        >
          {PURCHASE_ORDER_STATUS_LABELS[row.status]}
        </Badge>
      </td>

      {/* 67 — spec K4: detay ekranı ÇİZİLMEDİ → düğme silinmez, devre dışı */}
      <td className="sat-table__td sat-table__td--center">
        <Button
          variant="ghost"
          size="sm"
          disabled
          title={detailReason}
          data-testid={`sip-detail-${row.order_no}`}
        >
          Detay<span className="sr-only"> — {detailReason}</span>
        </Button>
      </td>
    </tr>
  );
}
