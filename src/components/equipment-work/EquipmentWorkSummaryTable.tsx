"use client";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCurrency, formatDecimal, formatPercent, formatPeriod } from "@/lib/format";
import type {
  WorkSummaryRow,
  WorkSummaryTotals,
} from "@/lib/api/hooks/useEquipmentWorkSummary";

import { EMPTY_VALUE, usageBarWidth, usageReasonText, usageTone } from "./usage-tone";
import "./equipment-work.css";

export interface EquipmentWorkSummaryTableProps {
  year: number;
  month: number;
  rows: WorkSummaryRow[] | undefined;
  /** 🔴 §0 — SUNUCUNUN toplamı; mockup'ın tfoot sabiti DEĞİL. */
  totals: WorkSummaryTotals | undefined;
  /** Şantiye adı çözümü AYRI kaynaktan gelir; `undefined` ⇒ hâlâ yükleniyor. */
  resolveSiteLabel: (siteId: string | null) => string | null | undefined;
  isLoading: boolean;
}

/** Saat sütunu: `"186.00"` ⇒ `"186"` (sondaki sıfırlar atılır). */
function hoursText(value: string): string {
  return formatDecimal(value, 2);
}

/**
 * M3 111-213 · "Ekipman Bazlı Özet" tablosu + tfoot.
 *
 * 🔴 §0 — tfoot'un sayıları SUNUCUNUN `totals` nesnesidir. Mockup'ın kendi
 * tfoot'u (428 saat · %69 · ₺124.800) kendi satırlarıyla TUTARSIZDIR
 * (satırlar 692 saat · ₺144.200 eder) ve bu ekranda HİÇBİR YERDE geçmez.
 * İstemci satırları TOPLAMAZ da — toplamın tek kaynağı sunucudur (MK-1 K15).
 *
 * 🔴 K3 — `usage_pct`/`cost` `null` iken "—" basılır, 0 BASILMAZ; hücre
 * `title` ile Türkçe gerekçe taşır.
 */
export function EquipmentWorkSummaryTable({
  year,
  month,
  rows,
  totals,
  resolveSiteLabel,
  isLoading,
}: EquipmentWorkSummaryTableProps) {
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  return (
    <section className="makine-cal-panel" data-testid="makine-cal-summary-table">
      {/* 112 */}
      <h2 className="makine-cal-panel__title">
        Ekipman Bazlı Özet — {formatPeriod(year, month)}
      </h2>

      {isLoading && <p className="makine-cal-panel__note">Yükleniyor…</p>}
      {!isLoading && rows?.length === 0 && (
        <p className="makine-cal-panel__note" data-testid="makine-cal-summary-empty">
          Bu dönemde çalışma kaydı yok.
        </p>
      )}

      {rows !== undefined && rows.length > 0 && (
        <table className="makine-cal-table">
          <thead>
            {/* 115-121 */}
            <tr>
              <th scope="col">Ekipman</th>
              <th scope="col" className="makine-cal-table__center">
                Çalışma (Saat)
              </th>
              <th scope="col" className="makine-cal-table__center">
                Kullanım %
              </th>
              <th scope="col" className="makine-cal-table__center">
                Arıza (Saat)
              </th>
              <th scope="col" className="makine-cal-table__right">
                Maliyet
                <MaskedMark isHidden={isCostHidden} values={[...rows.map((row) => row.cost), totals?.cost]} />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const tone = usageTone(row.usage_pct);
              const barWidth = usageBarWidth(row.usage_pct);
              const siteLabel = resolveSiteLabel(row.site_id);
              const hasBreakdown = Number(row.breakdown_hours) > 0;

              return (
                <tr
                  key={row.equipment_id}
                  className={
                    tone === "danger"
                      ? "makine-cal-table__row--danger"
                      : tone === "warning"
                        ? "makine-cal-table__row--warning"
                        : undefined
                  }
                  data-testid="makine-cal-summary-row"
                >
                  {/* 125-128 */}
                  <td>
                    <div className="makine-cal-table__name">{row.equipment_name}</div>
                    <div className="makine-cal-table__meta">
                      {siteLabel === undefined
                        ? "Yükleniyor…"
                        : (siteLabel ?? "Şantiye atanmadı")}
                    </div>
                  </td>
                  {/* 129 */}
                  <td
                    className={`makine-cal-table__center makine-cal-table__strong makine-cal-table__tone--${tone}`}
                  >
                    {hoursText(row.hours)}
                  </td>
                  {/* 130-133 */}
                  <td className="makine-cal-table__center">
                    {row.usage_pct === null || barWidth === null ? (
                      <span
                        className="makine-cal-table__muted"
                        title={usageReasonText(row.usage_reason)}
                        data-testid="makine-cal-usage-empty"
                      >
                        {EMPTY_VALUE}
                      </span>
                    ) : (
                      <>
                        <div className={`makine-cal-table__pct makine-cal-table__tone--${tone}`}>
                          {formatPercent(row.usage_pct)}
                        </div>
                        <div className="makine-cal-bar">
                          <div
                            className={`makine-cal-bar__fill makine-cal-bar__fill--${tone}`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </>
                    )}
                  </td>
                  {/* 134 */}
                  <td
                    className={
                      "makine-cal-table__center " +
                      (hasBreakdown
                        ? "makine-cal-table__strong makine-cal-table__tone--danger"
                        : "makine-cal-table__tone--success")
                    }
                  >
                    {hoursText(row.breakdown_hours)}
                  </td>
                  {/* 135 */}
                  <td className="makine-cal-table__right makine-cal-table__mono">
                    {row.cost === null ? (
                      <span
                        className="makine-cal-table__muted"
                        // IZN-F4d.2: gizli kategoride `null` = maske; "bedeli tanımlı değil" yalan olurdu.
                        title={
                          isCostHidden
                            ? HIDDEN_FIELD_HINT
                            : "Ekipmanın kira/saat bedeli tanımlı değil — maliyet hesaplanamıyor."
                        }
                        data-testid="makine-cal-cost-empty"
                      >
                        {EMPTY_VALUE}
                      </span>
                    ) : (
                      formatCurrency(row.cost)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* 203-211 — SUNUCUNUN toplamı */}
          {totals !== undefined && (
            <tfoot>
              <tr data-testid="makine-cal-summary-totals">
                <td>Toplam</td>
                <td className="makine-cal-table__center">{hoursText(totals.hours)}</td>
                <td className="makine-cal-table__center makine-cal-table__tone--primary">
                  {totals.usage_pct_avg === null ? (
                    <span
                      title="Hiçbir ekipmanın kullanım oranı hesaplanamadı — ortalama yok."
                      data-testid="makine-cal-totals-usage-empty"
                    >
                      {EMPTY_VALUE}
                    </span>
                  ) : (
                    `${formatPercent(totals.usage_pct_avg)} ort.`
                  )}
                </td>
                <td className="makine-cal-table__center makine-cal-table__tone--danger">
                  {hoursText(totals.breakdown_hours)}
                </td>
                <td className="makine-cal-table__right makine-cal-table__mono">
                  {formatCurrency(totals.cost)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </section>
  );
}
