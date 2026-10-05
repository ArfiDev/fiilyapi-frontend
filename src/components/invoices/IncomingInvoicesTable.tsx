"use client";

import Link from "next/link";

import { Badge, Button } from "@/components/ui";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { INVOICE_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatAmount, formatDateDots } from "@/lib/format";
import type { InvoiceResponse } from "@/lib/api/hooks/useInvoices";

import { InvoicePartyName } from "./InvoicePartyName";
import { InvoiceSourceChip } from "./InvoiceSourceChip";
import {
  incomingInvoicesEmptyMessage,
  invoiceDetailUrl,
  invoiceStatusLabel,
  invoiceStatusVariant,
  REASONS,
} from "./invoice-labels";

/**
 * FY:148-193 "Gelen Faturalar — Onay Bekleyen" tablosu — YEDİ sütun
 * (FY:155-161): Fatura No · Satıcı · Eşleşme · Tarih · Toplam · Durum · aksiyon.
 *
 * İKİ sütunun karşılığı sınırlıdır ve bu sessizce geçilmez:
 *   · "Eşleşme" (FY:157) — fatura kaydı KAYNAĞIN TÜRÜNÜ taşır, "✓ Eşleşti /
 *     Fark Var" gibi bir EŞLEŞME DURUMU taşımaz (`REASONS.matchState`).
 *   · "Satıcı" alt satırındaki tür etiketi (FY:166 "Taşeron") de kaynak
 *     türünden çözülür; VKN varsa o basılır.
 *
 * Aksiyon sütunu GERÇEKTİR: "Onayla" `POST /invoices/{id}/approve`,
 * "İncele" detay rotasıdır (FY:171/180).
 */
export function IncomingInvoicesTable({
  rows,
  isLoading,
  errorMessage,
  onApprove,
  approvingId,
  canWrite,
  writeDisabledReason,
  tab,
}: {
  rows: readonly InvoiceResponse[] | undefined;
  isLoading: boolean;
  errorMessage: string | undefined;
  onApprove: (invoiceId: string) => void;
  approvingId: string | null;
  canWrite: boolean;
  writeDisabledReason: string;
  /**
   * O5a-130: boş-durum metni SEKMEYE göre değişir — çağıran (InvoicesView)
   * hangi sekmede olduğumuzu bilir, tablo kendi başına UYDURMAZ.
   */
  tab: "giden" | "gelen";
}) {
  const isHidden = useCategoryHidden(INVOICE_HIDDEN_CATEGORIES);
  if (isLoading) return <p className="fat-notice">Yükleniyor…</p>;
  if (errorMessage !== undefined) {
    return (
      <p className="fat-notice fat-notice--danger" data-testid="fat-incoming-error">
        {errorMessage}
      </p>
    );
  }
  if (rows === undefined) return null;
  if (rows.length === 0) {
    return (
      <p className="fat-notice" data-testid="fat-incoming-empty">
        {incomingInvoicesEmptyMessage(tab)}
      </p>
    );
  }

  return (
    <div className="fat-table-scroll">
      <table className="fat-table" data-testid="fat-incoming-table">
        <thead>
          <tr>
            <th scope="col">Fatura No</th>
            <th scope="col">Satıcı</th>
            <th scope="col">Eşleşme</th>
            <th scope="col" className="is-center">
              Tarih
            </th>
            <th scope="col" className="is-right">
              Toplam
              <MaskedMark isHidden={isHidden} values={rows.map((row) => row.total)} />
            </th>
            <th scope="col" className="is-center">
              Durum
            </th>
            <th scope="col" className="is-center">
              <span className="sr-only">İşlemler</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((invoice) => (
            <tr key={invoice.id} data-testid="fat-incoming-row" data-invoice-id={invoice.id}>
              <td className="is-mono">{invoice.invoice_no}</td>
              <td>
                <div className="fat-table__party">
                  <InvoicePartyName name={invoice.party_name} />
                </div>
                <div className="fat-table__muted">
                  {invoice.party_tax_number !== null
                    ? `VKN: ${invoice.party_tax_number}`
                    : "VKN girilmemiş"}
                </div>
              </td>
              <td>
                <InvoiceSourceChip fields={invoice} />
              </td>
              <td className="is-center">{formatDateDots(invoice.issue_date)}</td>
              <td className="is-right is-mono fat-table__strong">
                {formatAmount(invoice.total)}
              </td>
              <td className="is-center">
                <Badge variant={invoiceStatusVariant(invoice.status, invoice.due_date)}>
                  {invoiceStatusLabel(invoice.status, invoice.due_date)}
                </Badge>
              </td>
              <td className="is-center">
                <div className="fat__actions">
                  {/* FY:180 "İncele" */}
                  <Link href={invoiceDetailUrl(invoice.id)} className="fat-chip">
                    İncele
                  </Link>
                  {/* FY:171 "Onayla" — GERÇEK uç. */}
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!canWrite || approvingId === invoice.id}
                    title={canWrite ? undefined : writeDisabledReason}
                    data-testid="fat-incoming-approve"
                    onClick={() => onApprove(invoice.id)}
                  >
                    {approvingId === invoice.id ? "Onaylanıyor…" : "Onayla"}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fat-notice" data-testid="fat-incoming-match-notice">
        {REASONS.matchState} {REASONS.sourceNumber}
      </p>
    </div>
  );
}
