"use client";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import { formatCurrency, formatCurrencyPrecise, formatDecimal } from "@/lib/format";
import type { FuelSummaryResponse } from "@/lib/api/hooks/useEquipmentFuelSummary";

import { EMPTY_VALUE } from "./consumption";
import "./equipment-fuel.css";

export interface EquipmentFuelKpiStripProps {
  /** 🔴 §0 — SUNUCUNUN özeti; mockup'ın 2.840 Lt/₺112.800/6,6 Lt sabitleri DEĞİL. */
  summary: FuelSummaryResponse | undefined;
}

/**
 * M4 36-42 · beş kartlık KPI şeridi.
 *
 * 🔴 K3 — `lt_per_hour_avg`/`avg_unit_price` `null` iken "—" basılır, 0
 * BASILMAZ (MK-1 K16: payda sıfırsa uydurma oran yok).
 */
export function EquipmentFuelKpiStrip({ summary }: EquipmentFuelKpiStripProps) {
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  return (
    <div className="makine-yakit-kpi" data-testid="makine-yakit-kpi">
      {/* 37 */}
      <div className="makine-yakit-kpi__card">
        <div className="makine-yakit-kpi__label">Bu Ay Toplam</div>
        <div className="makine-yakit-kpi__value makine-yakit-kpi__value--mono">
          {summary ? `${formatDecimal(summary.total_liters, 2)} Lt` : EMPTY_VALUE}
        </div>
      </div>

      {/* 38 */}
      <div className="makine-yakit-kpi__card makine-yakit-kpi__card--danger">
        <div className="makine-yakit-kpi__label">Yakıt Maliyeti</div>
        <div className="makine-yakit-kpi__value makine-yakit-kpi__value--mono makine-yakit-kpi__value--danger">
          {summary ? formatCurrency(summary.total_amount) : EMPTY_VALUE}
          <MaskedMark isHidden={isCostHidden} values={[summary?.total_amount]} />
        </div>
      </div>

      {/* 39 */}
      <div className="makine-yakit-kpi__card">
        <div className="makine-yakit-kpi__label">Lt/Saat Ortalama</div>
        <div className="makine-yakit-kpi__value makine-yakit-kpi__value--mono">
          {summary && summary.lt_per_hour_avg !== null ? (
            `${formatDecimal(summary.lt_per_hour_avg, 1)} Lt`
          ) : (
            <span
              title="Bu ay çalışma kaydı saat toplamı sıfır; Lt/saat ortalaması hesaplanamıyor."
              data-testid="makine-yakit-kpi-lph-empty"
            >
              {EMPTY_VALUE}
            </span>
          )}
        </div>
      </div>

      {/* 40 */}
      <div className="makine-yakit-kpi__card">
        <div className="makine-yakit-kpi__label">Litre Fiyatı</div>
        <div className="makine-yakit-kpi__value makine-yakit-kpi__value--mono">
          {summary && summary.avg_unit_price !== null ? (
            formatCurrencyPrecise(summary.avg_unit_price)
          ) : (
            <span
              // IZN-F4d.2: gizli kategoride `null` = maske; "kayıt yok" yalan olurdu (kilit tutar kartında).
              title={
                isCostHidden ? HIDDEN_FIELD_HINT : "Bu ay yakıt kaydı yok; ortalama litre fiyatı hesaplanamıyor."
              }
              data-testid="makine-yakit-kpi-price-empty"
            >
              {EMPTY_VALUE}
            </span>
          )}
        </div>
      </div>

      {/* 41 */}
      <div className="makine-yakit-kpi__card makine-yakit-kpi__card--warning">
        <div className="makine-yakit-kpi__label">Anormal Tüketim</div>
        <div className="makine-yakit-kpi__value makine-yakit-kpi__value--warning">
          {summary ? `${summary.abnormal_count} Ekipman` : EMPTY_VALUE}
        </div>
      </div>
    </div>
  );
}
