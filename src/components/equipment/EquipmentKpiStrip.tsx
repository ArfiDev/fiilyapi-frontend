"use client";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCompactCurrency } from "@/lib/format";
import type { EquipmentSummaryResponse } from "@/lib/api/hooks/useEquipmentSummary";

import "./equipment.css";

export interface EquipmentKpiStripProps {
  /** Yükleniyor/hata durumunda `undefined` — sahte sıfır BASILMAZ. */
  summary: EquipmentSummaryResponse | undefined;
}

const EMPTY_VALUE = "—";

/**
 * M1 66-83 · KPI şeridi — mockup DÖRT kart çizer ama biri (`Aylık Maliyet`)
 * bir tutar kartıdır, üçü DURUM SAYACIDIR (Aktif Çalışıyor/Arızalı/Bakımda).
 *
 * ⚠️ K9/K21 — sunucu (`GET /equipment/summary`) DÖRT durum sayacı verir
 * (`working`/`broken`/`maintenance`/`idle`). Mockup yalnız ÜÇ sayaç çiziyor;
 * "sunucu mockup'tan fazla veri verebilir, eksik veremez" kuralı gereği
 * dördüncüsü (`idle`) BASILMAZ — WORKFLOW §3, spec K9 kararı. `idle` ekipman
 * kart ızgarasında kendi rozetiyle zaten görünür.
 *
 * `monthly_cost` SATIRLARDAN türer (backend K15); mockup'ın ₺124K'sı
 * mockup'ın kendi aritmetik hatasıdır (§0), kopyalanmaz. Bedeli bilinmeyen
 * makine varsa (`monthly_cost_unknown_count > 0`) bu GÖRÜNÜR bir notla
 * bildirilir — sessizce eksik bir tutar basılmaz.
 *
 * IZN-F4d.2 — maskeli rolde `monthly_cost` `null`: "—" + kilit; "bedeli tanımlı değil" notu BASILMAZ (yalan olurdu).
 */
export function EquipmentKpiStrip({ summary }: EquipmentKpiStripProps) {
  const isHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  const hasUnknownCost =
    summary !== undefined && summary.monthly_cost !== null && summary.monthly_cost_unknown_count > 0;

  return (
    <div className="makine-kpi" data-testid="makine-kpi-strip">
      {/* 67-70 */}
      <div className="makine-kpi__card">
        <div className="makine-kpi__value makine-kpi__value--success">
          {summary ? summary.working : EMPTY_VALUE}
        </div>
        <div className="makine-kpi__label">Aktif Çalışıyor</div>
      </div>

      {/* 71-74 */}
      <div className="makine-kpi__card">
        <div className="makine-kpi__value makine-kpi__value--danger">
          {summary ? summary.broken : EMPTY_VALUE}
        </div>
        <div className="makine-kpi__label">Arızalı</div>
      </div>

      {/* 75-78 */}
      <div className="makine-kpi__card">
        <div className="makine-kpi__value makine-kpi__value--warning">
          {summary ? summary.maintenance : EMPTY_VALUE}
        </div>
        <div className="makine-kpi__label">Bakımda</div>
      </div>

      {/* 79-82 */}
      <div className="makine-kpi__card">
        <div className="makine-kpi__value makine-kpi__value--mono">
          {summary ? formatCompactCurrency(summary.monthly_cost) : EMPTY_VALUE}
          <MaskedMark isHidden={isHidden} values={[summary?.monthly_cost]} />
        </div>
        <div className="makine-kpi__label">Aylık Maliyet</div>
        {hasUnknownCost && (
          <p className="makine-kpi__hint" data-testid="makine-kpi-cost-unknown-hint">
            {summary.monthly_cost_unknown_count} ekipmanın günlük kira bedeli
            tanımlı değil — bu toplama dahil edilmedi.
          </p>
        )}
      </div>
    </div>
  );
}
