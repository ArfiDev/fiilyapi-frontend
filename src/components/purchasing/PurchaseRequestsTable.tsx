"use client";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { pendingModuleLabel } from "@/lib/pending-modules";
import type { PurchaseRequestListRow } from "@/lib/api/hooks/usePurchaseRequests";

import {
  PROJECT_NAME_UNRESOLVED_REASON,
  PURCHASE_PRIORITY_LABELS,
  PURCHASE_REQUEST_STATUS_BADGE_VARIANTS,
  PURCHASE_REQUEST_STATUS_LABELS,
  purchaseRequestQuotesHref,
} from "./purchasing-labels";
import "./purchasing.css";

/**
 * SAT 104/115 "Miktar" ve 106/117 "Teklif" sütunlarının pending anahtarları.
 * Gerekçe METNİ tek kaynaktan (`pendingModuleLabel`) gelir — hücrelere elle
 * cümle yazılmaz.
 */
export const QUANTITY_PENDING_MODULE = "purchase_request_quantity";
export const QUOTE_COUNT_PENDING_MODULE = "purchase_request_quote_count";

export interface PurchaseRequestsTableProps {
  /** `undefined` ⇒ yükleniyor/hata; satır BASILMAZ (mockup örnekleri sabit değildir). */
  rows: PurchaseRequestListRow[] | undefined;
  /** `project_id` → proje adı; `GET /projects`ten gelir (satır yalnız kimlik taşır). */
  projectNames: ReadonlyMap<string, string>;
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
  if (options.isLoading) return { title: "Talep listesi yükleniyor…" };
  if (options.isError) {
    return { title: options.errorMessage ?? "Talep listesi yüklenemedi." };
  }
  if (options.hasFilter) {
    return {
      title: "Bu süzgeçle eşleşen satın alma talebi yok.",
      hint: "Sekme/proje seçimini genişletin ya da aramayı temizleyin.",
    };
  }
  return {
    title: "Henüz satın alma talebi yok.",
    hint: "“+ Satın Alma Talebi” ile ilk talebi oluşturun.",
  };
}

/**
 * SAT 113/122/131/140/149 · malzeme hücresinin İKİNCİ satırı ("Acil · Stok
 * kritik" / "Kat 9 döşeme").
 *
 * Öncelik etiketi YALNIZ `normal` DIŞINDA basılır: mockup'ın dört normal
 * satırı (122, 131, 140, 149) yalnız notu yazar, tek acil satırı (113)
 * "Acil · " ön ekini taşır. Her satıra "Normal · " yazmak mockup'tan SAPMA
 * olurdu.
 */
export function requestSubLine(row: PurchaseRequestListRow): string {
  const parts = [
    row.priority === "normal" ? null : PURCHASE_PRIORITY_LABELS[row.priority],
    row.justification,
  ].filter((part): part is string => typeof part === "string" && part.length > 0);
  return parts.join(" · ");
}

/**
 * SAT 97-156 · talep tablosu: Talep No · Malzeme · Proje · Miktar ·
 * Tahmini Tutar · Teklif · Durum.
 *
 * ⚠️ İKİ SÜTUNUN KAYNAĞI YOK, AMA SÜTUN SİLİNMEZ (F-TH `work_category` /
 * F-P5 `subcontractor_rating` emsali): `PurchaseRequestListRow` KALEM
 * TAŞIMAZ (şema açıklaması: N+1 gerekçesi), yalnız `line_count` verir.
 * "Miktar" ve "Teklif" hücreleri "—" + görünür gerekçeyle durur; tablonun
 * üstündeki tek bant iki sütunu ADIYLA sayar (`PurchaseRequestsView`).
 *
 * ⚠️ Mockup'ın BEŞ örnek satırı (111-155) SABİT İÇERİK OLARAK BASILMAZ —
 * hepsi veriden gelir. Durum rozeti sunucunun `status` damgasıdır.
 */
export function PurchaseRequestsTable({
  rows,
  projectNames,
  isLoading,
  isError,
  errorMessage,
  hasFilter,
}: PurchaseRequestsTableProps) {
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
          {/* 100-108 */}
          <tr>
            <th scope="col" className="sat-table__th sat-table__th--left">
              Talep No
            </th>
            <th scope="col" className="sat-table__th sat-table__th--left">
              Malzeme
            </th>
            <th scope="col" className="sat-table__th sat-table__th--left">
              Proje
            </th>
            <th scope="col" className="sat-table__th sat-table__th--right">
              Miktar
            </th>
            <th scope="col" className="sat-table__th sat-table__th--right">
              Tahmini Tutar
              <MaskedMark isHidden={isCostHidden} values={visibleRows.map((row) => row.estimated_total)} />
            </th>
            <th scope="col" className="sat-table__th sat-table__th--center">
              Teklif
            </th>
            <th scope="col" className="sat-table__th sat-table__th--center">
              Durum
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <PurchaseRequestRow
              key={row.id}
              row={row}
              projectName={projectNames.get(row.project_id)}
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

interface PurchaseRequestRowProps {
  row: PurchaseRequestListRow;
  projectName: string | undefined;
}

function PurchaseRequestRow({ row, projectName }: PurchaseRequestRowProps) {
  const router = useRouter();
  const href = purchaseRequestQuotesHref(row.id);
  const subLine = requestSubLine(row);
  const quantityReason = pendingModuleLabel(QUANTITY_PENDING_MODULE);
  const quoteReason = pendingModuleLabel(QUOTE_COUNT_PENDING_MODULE);

  return (
    <tr
      className="sat-row"
      data-testid={`sat-row-${row.request_no}`}
      onClick={() => router.push(href)}
      aria-label={`${row.request_no} — teklifler`}
    >
      {/* 112 — klavye erişimi gerçek bağlantıdan gelir; satır tıklaması fare içindir */}
      <td className="sat-table__td sat-table__td--mono">
        <Link
          href={href}
          className="sat-table__no-link"
          onClick={(event) => event.stopPropagation()}
        >
          {row.request_no}
        </Link>
      </td>

      {/* 113 — ana satır malzeme ADI DEĞİLDİR (satır kalem taşımaz): kalem SAYISI */}
      <td className="sat-table__td">
        <div className="sat-table__name">{row.line_count} kalem</div>
        {subLine.length > 0 && <div className="sat-table__note">{subLine}</div>}
      </td>

      {/* 114 — ad `GET /projects`ten çözülür; çözülemezse uydurma ad YOK */}
      <td className="sat-table__td">
        {projectName ?? (
          <span className="sat-pending-cell" title={PROJECT_NAME_UNRESOLVED_REASON}>
            —<span className="sr-only">{PROJECT_NAME_UNRESOLVED_REASON}</span>
          </span>
        )}
      </td>

      {/* 115 — kolon SİLİNMEZ, miktar İCAT EDİLMEZ (şema kalem taşımaz) */}
      <td
        className="sat-table__td sat-table__td--right sat-pending-cell"
        title={quantityReason}
        data-testid={`sat-quantity-${row.request_no}`}
      >
        —<span className="sr-only">{quantityReason}</span>
      </td>

      {/* 116 — sunucunun kendi "tahmini" değeri; olduğu gibi basılır */}
      <td className="sat-table__td sat-table__td--right sat-table__td--mono sat-table__amount">
        {formatCurrency(row.estimated_total)}
      </td>

      {/* 117 — kolon SİLİNMEZ, teklif sayısı İCAT EDİLMEZ (alt kaynak = N+1) */}
      <td
        className="sat-table__td sat-table__td--center sat-pending-cell"
        title={quoteReason}
        data-testid={`sat-quote-${row.request_no}`}
      >
        —<span className="sr-only">{quoteReason}</span>
      </td>

      {/* 118 — rozet SUNUCUNUN `status` damgasıdır */}
      <td className="sat-table__td sat-table__td--center">
        <Badge
          variant={PURCHASE_REQUEST_STATUS_BADGE_VARIANTS[row.status]}
          className={`sat-badge sat-badge--${row.status}`}
          data-testid={`sat-status-${row.request_no}`}
        >
          {PURCHASE_REQUEST_STATUS_LABELS[row.status]}
        </Badge>
      </td>
    </tr>
  );
}
