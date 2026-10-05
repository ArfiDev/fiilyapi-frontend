"use client";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCurrency, formatDecimal, formatPercent } from "@/lib/format";
import type { FuelSummaryResponse } from "@/lib/api/hooks/useEquipmentFuelSummary";
import type {
  WorkSummaryRow,
  WorkSummaryTotals,
} from "@/lib/api/hooks/useEquipmentWorkSummary";

import { EMPTY_VALUE, usageBarWidth } from "./usage-tone";
import { FUEL_KPI_SITE_FILTER_UNSUPPORTED_NOTE, MONTH_OVER_MONTH_MISSING_REASON } from "./work-labels";
import "./equipment-work.css";

export interface EquipmentWorkKpiStripProps {
  /** 🔴 §0 — SUNUCUNUN toplamı; mockup'ın 428/₺124.800/%69 sabitleri DEĞİL. */
  totals: WorkSummaryTotals | undefined;
  rows: WorkSummaryRow[] | undefined;
  /** Yakıt kartı AYRI uçtan (`/equipment/fuel-summary`) beslenir. */
  fuel: FuelSummaryResponse | undefined;
  /**
   * 🔴 O5b #105 — ekranın şantiye süzgeci açık mı. `/equipment/fuel-summary`
   * bir `site_id` süzgeci ALMAZ, yani bu kart açıkken bile HER ZAMAN tüm
   * şantiyelerin toplamıdır — diğer kartlarla tutarsızlığı GÖRÜNÜR kılmak
   * için bir gerekçe basılır.
   */
  fuelSiteFiltered: boolean;
}

/** En çok arıza saati olan ekipmanın adı (88/98 alt satırı) — yoksa `null`. */
function topBreakdownName(rows: WorkSummaryRow[] | undefined): string | null {
  const worst = (rows ?? [])
    .filter((row) => Number(row.breakdown_hours) > 0)
    .sort((a, b) => Number(b.breakdown_hours) - Number(a.breakdown_hours))[0];
  return worst?.equipment_name ?? null;
}

/**
 * M3 79-105 · beş kartlık KPI şeridi.
 *
 * 🔴 §0/K3 — HER değer sunucudan gelir; `null` gelen "—" basar, 0 BASMAZ.
 * Mockup'ın "↑ %6 geçen ay" alt satırı (83) SUNUCUDA YOK ve istemcide
 * hesaplanmaz (bir önceki ayı çekip fark uydurmak da UYDURMADIR) — kart
 * korunur, alt satır GÖRÜNÜR bir gerekçeye döner (sessiz düşüş yok).
 */
export function EquipmentWorkKpiStrip({
  totals,
  rows,
  fuel,
  fuelSiteFiltered,
}: EquipmentWorkKpiStripProps) {
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  const usageWidth = totals ? usageBarWidth(totals.usage_pct_avg) : null;
  const worstName = topBreakdownName(rows);

  return (
    <div className="makine-cal-kpi" data-testid="makine-cal-kpi">
      {/* 80-84 */}
      <div className="makine-cal-kpi__card">
        <div className="makine-cal-kpi__label">Toplam Çalışma</div>
        <div className="makine-cal-kpi__value">
          {totals ? `${formatDecimal(totals.hours, 2)} Saat` : EMPTY_VALUE}
        </div>
        <div className="makine-cal-kpi__hint" data-testid="makine-cal-kpi-mom-missing">
          {MONTH_OVER_MONTH_MISSING_REASON}
        </div>
      </div>

      {/* 85-89 */}
      <div className="makine-cal-kpi__card">
        <div className="makine-cal-kpi__label">Toplam Maliyet</div>
        <div className="makine-cal-kpi__value makine-cal-kpi__value--mono">
          {totals ? formatCurrency(totals.cost) : EMPTY_VALUE}
          <MaskedMark isHidden={isCostHidden} values={[totals?.cost]} />
        </div>
        <div className="makine-cal-kpi__hint">
          {rows ? `${rows.length} ekipman` : EMPTY_VALUE}
        </div>
      </div>

      {/* 90-94 */}
      <div className="makine-cal-kpi__card">
        <div className="makine-cal-kpi__label">Kullanım Oranı</div>
        <div className="makine-cal-kpi__value makine-cal-kpi__value--primary">
          {totals && totals.usage_pct_avg !== null ? (
            formatPercent(totals.usage_pct_avg)
          ) : (
            <span
              title="Hiçbir ekipmanın kullanım oranı hesaplanamadı — ortalama yok."
              data-testid="makine-cal-kpi-usage-empty"
            >
              {EMPTY_VALUE}
            </span>
          )}
        </div>
        {usageWidth !== null && (
          <div className="makine-cal-bar">
            <div className="makine-cal-bar__fill makine-cal-bar__fill--primary" style={{ width: `${usageWidth}%` }} />
          </div>
        )}
      </div>

      {/* 95-99 */}
      <div className="makine-cal-kpi__card">
        <div className="makine-cal-kpi__label">Arıza Süresi</div>
        <div className="makine-cal-kpi__value makine-cal-kpi__value--danger">
          {totals ? `${formatDecimal(totals.breakdown_hours, 2)} Saat` : EMPTY_VALUE}
        </div>
        <div className="makine-cal-kpi__hint makine-cal-kpi__hint--danger">
          {worstName ?? ""}
        </div>
      </div>

      {/* 100-104 — AYRI uç: /equipment/fuel-summary */}
      <div className="makine-cal-kpi__card">
        <div className="makine-cal-kpi__label">Yakıt Tüketimi</div>
        <div className="makine-cal-kpi__value" data-testid="makine-cal-kpi-fuel">
          {fuel ? `${formatDecimal(fuel.total_liters, 2)} Lt` : EMPTY_VALUE}
        </div>
        <div className="makine-cal-kpi__hint">
          {fuel ? formatCurrency(fuel.total_amount) : EMPTY_VALUE}
          <MaskedMark isHidden={isCostHidden} values={[fuel?.total_amount]} />
        </div>
        {fuelSiteFiltered && (
          <div
            className="makine-cal-kpi__hint makine-cal-kpi__hint--warning"
            data-testid="makine-cal-kpi-fuel-unfiltered"
          >
            {FUEL_KPI_SITE_FILTER_UNSUPPORTED_NOTE}
          </div>
        )}
      </div>
    </div>
  );
}
