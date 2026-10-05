import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { INVOICE_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { EMPTY_CELL, formatAmount, formatPercent, formatQuantity } from "@/lib/format";
import type { InvoiceDetailResponse } from "@/lib/api/hooks/useInvoiceDetail";

import { REASONS } from "./invoice-labels";

/** tfoot satırı — oranlı etiketler (FGI:168 "Avans Kesintisi (%20)") burada kurulur. */
function FootRow({
  label,
  value,
  colSpan,
  tone,
}: {
  label: string;
  value: string;
  colSpan: number;
  tone?: "danger" | "success";
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="is-right">
        {label}
      </td>
      <td
        className={`is-right is-mono fat-table__strong${
          tone === "danger" ? " fat-summary-row__value--danger" : ""
        }`}
      >
        {value}
      </td>
    </tr>
  );
}

/**
 * FGI:112-189 / FGE:146-194 "Fatura Kalemleri" tablosu — okuma.
 *
 * 🔴 tfoot'un HER SATIRI sunucunun SAKLANAN kolonundan gelir (`subtotal`,
 * `advance_amount`, `retention_amount`, `tax_base`, `vat_amount`,
 * `withholding_amount`, `total`): fatura DONMUŞ bir belgedir, okuma anında
 * yeniden hesaplanmaz (K7).
 *
 * Sıfır olan kesinti satırı BASILMAZ (mockup da yalnız var olanı yazar);
 * gizlenmesi bir eksiklik DEĞİLDİR — o faturada gerçekten yoktur.
 */
/**
 * Kesinti satırı gösterilsin mi? Tutar DOLUysa sıfır olmayan, tutar gizliyse (`null`, IZN-F4b.2) oranı
 * sıfır olmayan satır gösterilir: `Number(null)` 0'dır ve "kesinti yok" demek gizli kesintiyi yok sayardı.
 */
function isDeductionShown(amount: string | null, rate: string | null): boolean {
  if (amount !== null) return Number(amount) !== 0;
  return rate !== null && Number(rate) !== 0;
}

/** "– 1.000" biçimi; gizli (null) tutar "–" önekiyle basılmaz, düz "—". */
function minusAmount(value: string | null): string {
  return value === null ? EMPTY_CELL : `– ${formatAmount(value)}`;
}

export function InvoiceLinesTable({ invoice }: { invoice: InvoiceDetailResponse }) {
  const isIncoming = invoice.direction === "incoming";
  // Sıra sütunu YALNIZ giden detayda vardır (FGI:116); FGE onu çizmez.
  const showSeq = !isIncoming;
  const columnCount = showSeq ? 7 : 6;
  const footSpan = columnCount - 1;

  const isHidden = useCategoryHidden(INVOICE_HIDDEN_CATEGORIES);
  const hasAdvance = isDeductionShown(invoice.advance_amount, invoice.advance_rate);
  const hasRetention = isDeductionShown(invoice.retention_amount, invoice.retention_rate);
  const hasWithholding = isDeductionShown(invoice.withholding_amount, invoice.withholding_rate);

  return (
    <section className="fat-panel" aria-label="Fatura Kalemleri">
      <div className="fat-panel__head">
        <span className="fat-panel__title">
          {isIncoming ? "Fatura Kalemleri (Satıcının Gönderdiği)" : "Fatura Kalemleri"}
        </span>
      </div>
      <div className="fat-table-scroll">
        <table className="fat-table" data-testid="fat-detail-lines">
          <thead>
            <tr>
              {showSeq && <th scope="col">Sıra</th>}
              <th scope="col">{isIncoming ? "Hizmet" : "Hizmet / Poz"}</th>
              <th scope="col" className="is-center">
                Birim
              </th>
              <th scope="col" className="is-right">
                Miktar
              </th>
              <th scope="col" className="is-right">
                Birim Fiyat
                <MaskedMark isHidden={isHidden} values={invoice.lines.map((line) => line.unit_price)} />
              </th>
              <th scope="col" className="is-center">
                KDV %
              </th>
              <th scope="col" className="is-right">
                Tutar
                <MaskedMark isHidden={isHidden} values={invoice.lines.map((line) => line.line_total)} />
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.length === 0 && (
              <tr>
                <td colSpan={columnCount} data-testid="fat-detail-lines-empty">
                  Bu faturada kalem yok. Kalemsiz fatura gönderilemez/onaylanamaz.
                </td>
              </tr>
            )}
            {invoice.lines.map((line, index) => (
              <tr key={line.id} data-testid="fat-detail-line">
                {showSeq && <td className="is-mono fat-table__muted">{index + 1}</td>}
                <td>
                  <div>{line.description}</div>
                  {line.detail_note !== null && (
                    <div className="fat-table__muted">{line.detail_note}</div>
                  )}
                </td>
                <td className="is-center">{line.unit ?? "—"}</td>
                <td className="is-right is-mono">{formatQuantity(line.quantity)}</td>
                <td className="is-right is-mono">{formatAmount(line.unit_price)}</td>
                <td className="is-center">{formatAmount(line.vat_rate)}</td>
                <td className="is-right is-mono fat-table__strong">
                  {formatAmount(line.line_total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* FGI:164 · FGE:177 */}
            <FootRow
              colSpan={footSpan}
              label="Mal/Hizmet Toplamı"
              value={formatAmount(invoice.subtotal)}
            />
            {hasAdvance && (
              <FootRow
                colSpan={footSpan}
                tone="danger"
                // no 134 · `advance_rate` `string | null`dır ama `advance_amount`
                // ASLA null değildir (tutar DOLU, oran BİLİNMİYOR olabilir).
                // `?? 0` gerçek oranı SIFIRA düşürüp yalan söylerdi;
                // `formatPercent`in kendi maskeleme dalı ("—") kullanılır.
                label={`Avans Kesintisi (${formatPercent(invoice.advance_rate)})`}
                value={minusAmount(invoice.advance_amount)}
              />
            )}
            {hasRetention && (
              <FootRow
                colSpan={footSpan}
                tone="danger"
                label={`Teminat Kesintisi (${formatPercent(invoice.retention_rate)})`}
                value={minusAmount(invoice.retention_amount)}
              />
            )}
            <FootRow
              colSpan={footSpan}
              label="Vergi Matrahı"
              value={formatAmount(invoice.tax_base)}
            />
            <FootRow
              colSpan={footSpan}
              label="Hesaplanan KDV"
              value={formatAmount(invoice.vat_amount)}
            />
            {hasWithholding && (
              <FootRow
                colSpan={footSpan}
                tone="danger"
                label={`Tevkifat (${formatPercent(invoice.withholding_rate)})`}
                value={minusAmount(invoice.withholding_amount)}
              />
            )}
            <tr
              className={`fat-total-row${isIncoming ? " fat-total-row--incoming" : ""}`}
              data-testid="fat-detail-total-row"
            >
              <td colSpan={footSpan} className="is-right">
                ÖDENECEK TOPLAM
              </td>
              <td className="is-right fat-total-row__amount">
                {formatAmount(invoice.total)}
                <MaskedMark isHidden={isHidden} values={[invoice.total]} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="fat-notice" data-testid="fat-detail-lines-note">
        Tüm toplamlar faturanın kayıtlı (donmuş) değerleridir; ekranda yeniden
        hesaplanmaz. {REASONS.accounting}
      </p>
    </section>
  );
}
