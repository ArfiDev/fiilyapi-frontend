"use client";

import Link from "next/link";

import { Badge } from "@/components/ui";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { INVOICE_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatAmount, formatDateDots } from "@/lib/format";
import type { InvoiceResponse } from "@/lib/api/hooks/useInvoices";

import { InvoicePartyName } from "./InvoicePartyName";
import { InvoiceSourceChip } from "./InvoiceSourceChip";
import { invoiceDetailUrl, invoiceStatusLabel, invoiceStatusVariant, REASONS } from "./invoice-labels";

/**
 * FY:88-145 "Giden Faturalar" tablosu — DOKUZ sütun mockup sırasıyla:
 * Fatura No · Alıcı · Kaynak · Tarih · Matrah · KDV · Toplam · GİB · Durum
 * (FY:99-107).
 *
 * "GİB" sütunu (FY:106) SİLİNMEZ ama karşılığı YOKTUR: her hücre "—" basar ve
 * gerekçesini `title` + `sr-only` ile taşır; görünür bant tabloyu tamamlar
 * (F-TH kanonu).
 *
 * Para sütunları `formatAmount`tır (FY:115-117 `₺` BASMAZ, binlik nokta ve en
 * çok iki ondalık kullanır).
 */
export function OutgoingInvoicesTable({
  rows,
  isLoading,
  errorMessage,
}: {
  rows: readonly InvoiceResponse[] | undefined;
  isLoading: boolean;
  errorMessage: string | undefined;
}) {
  const isHidden = useCategoryHidden(INVOICE_HIDDEN_CATEGORIES);
  if (isLoading) return <p className="fat-notice">Yükleniyor…</p>;
  if (errorMessage !== undefined) {
    return (
      <p className="fat-notice fat-notice--danger" data-testid="fat-outgoing-error">
        {errorMessage}
      </p>
    );
  }
  if (rows === undefined) return null;
  if (rows.length === 0) {
    return (
      <p className="fat-notice" data-testid="fat-outgoing-empty">
        Bu dönemde kesilmiş giden fatura yok.
      </p>
    );
  }

  return (
    <div className="fat-table-scroll">
      <table className="fat-table" data-testid="fat-outgoing-table">
        <thead>
          <tr>
            <th scope="col">Fatura No</th>
            <th scope="col">Alıcı</th>
            <th scope="col">Kaynak</th>
            <th scope="col" className="is-center">
              Tarih
            </th>
            <th scope="col" className="is-right">
              Matrah
              <MaskedMark isHidden={isHidden} values={rows.map((row) => row.tax_base)} />
            </th>
            <th scope="col" className="is-right">
              KDV
              <MaskedMark isHidden={isHidden} values={rows.map((row) => row.vat_amount)} />
            </th>
            <th scope="col" className="is-right">
              Toplam
              <MaskedMark isHidden={isHidden} values={rows.map((row) => row.total)} />
            </th>
            <th scope="col" className="is-center">
              GİB
            </th>
            <th scope="col" className="is-center">
              Durum
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((invoice) => (
            <tr key={invoice.id} data-testid="fat-outgoing-row" data-invoice-id={invoice.id}>
              <td>
                {/* FY:111 — numara detaya bağlantıdır. */}
                <Link className="fat-table__no" href={invoiceDetailUrl(invoice.id)}>
                  {invoice.invoice_no}
                </Link>
              </td>
              <td>
                {/* FY:112 — ad + VKN alt satırı. */}
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
              <td className="is-right is-mono">{formatAmount(invoice.tax_base)}</td>
              <td className="is-right is-mono fat-table__muted">
                {formatAmount(invoice.vat_amount)}
              </td>
              <td className="is-right is-mono fat-table__strong">{formatAmount(invoice.total)}</td>
              <td className="is-center fat-table__muted" title={REASONS.gib}>
                {"—"}
                <span className="sr-only"> {REASONS.gib}</span>
              </td>
              <td className="is-center">
                <Badge variant={invoiceStatusVariant(invoice.status, invoice.due_date)}>
                  {invoiceStatusLabel(invoice.status, invoice.due_date)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
