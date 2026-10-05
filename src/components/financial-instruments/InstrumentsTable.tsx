import { Badge } from "@/components/ui";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { TREASURY_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCurrency, formatDateDots } from "@/lib/format";
import type { FinancialInstrumentResponse } from "@/lib/api/hooks/useFinancialInstruments";

import { instrumentBadge } from "./financial-instrument-labels";

/**
 * E10:99-161 tablosu — YEDİ sütun, mockup sırasıyla (E10:104-110):
 * Çek No · Keşideci · Banka · Keşide Tarihi · Vade · Tutar · Durum.
 *
 * Hizalamalar mockup'tan: ilk üç sütun SOLA, tarih/vade/durum ORTAYA,
 * tutar SAĞA (E10:104-110 `text-align`).
 *
 * 🔴 SATIR AKSİYONU YOKTUR: E10 hiçbir satırda düzenle/sil/durum tetikleyicisi
 * ÇİZMEZ. `POST .../{id}/status`, `PATCH` ve `DELETE` uçları canlıdır ama
 * mockup'ta karşılığı olmadığı için ekrana BAĞLANMAZ (kafaya göre UI icat
 * etmek yasak).
 *
 * Vade hücresinin rengi rozetle AYNI türevden gelir (`instrumentBadge`) —
 * E10:106 turuncu "Vadede" satırında, E10:124 yeşil "Portföyde" satırında,
 * E10:151 nötr "Tahsil Edildi" satırında.
 */
export function InstrumentsTable({
  rows,
  serialColumnLabel,
  isLoading,
  errorMessage,
}: {
  rows: readonly FinancialInstrumentResponse[] | undefined;
  /**
   * 🔴 E10:104 başlığı SEKMEYE göre değişir ("Çek No" ↔ "Senet No") ve
   * çağıranın seçtiği süzgeçten TÜRER — tabloda `if (tab === ...)` YAZILMAZ.
   */
  serialColumnLabel: string;
  isLoading: boolean;
  errorMessage: string | undefined;
}) {
  const isHidden = useCategoryHidden(TREASURY_HIDDEN_CATEGORIES);
  if (isLoading) {
    return (
      <p className="fin-notice" data-testid="fin-loading">
        Yükleniyor…
      </p>
    );
  }
  if (errorMessage !== undefined) {
    return (
      <p className="fin-notice fin-notice--danger" data-testid="fin-table-error">
        {errorMessage}
      </p>
    );
  }
  if (rows === undefined) return null;
  if (rows.length === 0) {
    return (
      <p className="fin-notice" data-testid="fin-table-empty">
        Bu sekmede kayıtlı kıymetli evrak yok.
      </p>
    );
  }

  return (
    <div className="fin-table-wrap">
      <table className="fin-table" data-testid="fin-table">
        <thead>
          <tr>
            <th scope="col">{serialColumnLabel}</th>
            <th scope="col">Keşideci</th>
            <th scope="col">Banka</th>
            <th scope="col" className="is-center">
              Keşide Tarihi
            </th>
            <th scope="col" className="is-center">
              Vade
            </th>
            <th scope="col" className="is-right">
              Tutar
              <MaskedMark isHidden={isHidden} values={rows.map((row) => row.amount)} />
            </th>
            <th scope="col" className="is-center">
              Durum
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const badge = instrumentBadge(row.status, row.is_due);
            return (
              <tr key={row.id} data-testid="fin-row" data-instrument-id={row.id}>
                {/* E10:101 — mono seri numarası */}
                <td className="is-mono">{row.serial_no}</td>
                {/* E10:102 — ad + açıklama ALT SATIRI */}
                <td>
                  <div className="fin-table__drawer">{row.drawer_name}</div>
                  {row.description !== null && row.description.length > 0 && (
                    <div className="fin-table__desc">{row.description}</div>
                  )}
                </td>
                {/* E10:103 — banka adı zorunlu DEĞİL; boşluk sessizce
                    yutulmaz, "—" basılır. */}
                <td className="fin-table__muted">{row.bank_name ?? "—"}</td>
                <td className="is-center fin-table__muted">{formatDateDots(row.issue_date)}</td>
                <td className="is-center">
                  <span className={`fin-table__due fin-table__due--${badge.tone}`}>
                    {formatDateDots(row.due_date)}
                  </span>
                </td>
                <td className="is-right is-mono fin-table__amount">{formatCurrency(row.amount)}</td>
                <td className="is-center">
                  <Badge variant={badge.variant} className={`fin-badge--${badge.tone}`}>
                    {badge.label}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
