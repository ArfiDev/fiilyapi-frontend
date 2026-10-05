import { HiddenMark } from "@/components/ui/hidden-mark/HiddenMark";
import { HIDDEN_FIELD_HINT } from "@/lib/auth/hidden-fields";
import { formatCompactCurrency } from "@/lib/format";
import { pendingModuleHint } from "@/lib/pending-modules";
import { isRestrictedEnvelope } from "@/lib/placeholder-cell";
import type { StockSummaryKpis } from "@/lib/api/hooks/useStockSummary";

import "./stock.css";

export interface StockKpiStripProps {
  /** Yükleniyor/hata durumunda `undefined` — sahte sıfır BASILMAZ. */
  kpis: StockSummaryKpis | undefined;
}

/** Değer basılamıyorken tüm kartların ortak yer tutucusu. */
const EMPTY_VALUE = "—";

/**
 * E3 72-89 · KPI şeridi — DÖRT kart, sırasıyla:
 * Toplam Stok Değeri (74-75) · Kritik Stok (78-79) · Bekleyen Sipariş (82-83) ·
 * Toplam Malzeme (86-87).
 *
 * ⚠️ Sayıların hepsi `GET /stock/summary` zarfının `kpis` alanından gelir ve
 * SÜZÜLEN kümenin özetidir (backend kararı): süzgeç değişince KPI'lar da
 * değişir, ekran onları yeniden HESAPLAMAZ.
 *
 * ⚠️ "Bekleyen Sipariş" (82-83) spec §5 **S5 (ONAYLI)** gereği SATINALMA
 * modülüne pending'dir: `pending_orders` bir `MetricPlaceholder` zarfıdır ve
 * `available` bugün `false` gelir. Kart SİLİNMEZ — "—" + görünür gerekçe.
 * `available` bir gün `true` dönerse zarfın `value`su OLDUĞU GİBİ basılır;
 * ekrana gömülü bir sayı yoktur.
 */
export function StockKpiStrip({ kpis }: StockKpiStripProps) {
  const pending = kpis?.pending_orders;
  const isPendingOrdersReal =
    pending !== undefined && pending.available && pending.value !== null && pending.value !== undefined;
  // IZN-F4.2: 3. hâl (rolün izni yok) → kilit + "Bu bilgi rolünüz için gizli"; 2. hâl (modül bekleniyor) aynen.
  const isPendingOrdersHidden = isRestrictedEnvelope(pending);
  const pendingReason = isPendingOrdersHidden ? HIDDEN_FIELD_HINT : pendingModuleHint(pending?.pending_module);

  return (
    <div className="stok-kpi" data-testid="stok-kpi-strip">
      {/* 74-75 */}
      <div className="stok-kpi__card">
        <div className="stok-kpi__label">Toplam Stok Değeri</div>
        <div className="stok-kpi__value stok-kpi__value--neutral">
          {kpis ? formatCompactCurrency(kpis.total_value) : EMPTY_VALUE}
        </div>
      </div>

      {/* 78-79 */}
      <div className="stok-kpi__card">
        <div className="stok-kpi__label">Kritik Stok</div>
        <div className="stok-kpi__value stok-kpi__value--danger">
          {kpis ? `${kpis.critical_count} Kalem` : EMPTY_VALUE}
        </div>
      </div>

      {/* 82-83 — SA'ya pending (spec §5 S5) */}
      <div className="stok-kpi__card">
        <div className="stok-kpi__label">Bekleyen Sipariş</div>
        {isPendingOrdersReal ? (
          <div className="stok-kpi__value stok-kpi__value--warning">{pending.value}</div>
        ) : (
          <>
            <div
              className="stok-kpi__value stok-kpi__value--pending"
              title={pendingReason}
              data-testid="stok-kpi-pending-orders"
            >
              {EMPTY_VALUE}
              {isPendingOrdersHidden && <HiddenMark />}
            </div>
            {/* `title` görünmez olduğu için gerekçe METNE de basılır. */}
            <p className="stok-kpi__pending-hint">{pendingReason}</p>
          </>
        )}
      </div>

      {/* 86-87 */}
      <div className="stok-kpi__card">
        <div className="stok-kpi__label">Toplam Malzeme</div>
        <div className="stok-kpi__value stok-kpi__value--neutral">
          {kpis ? `${kpis.total_items} Kalem` : EMPTY_VALUE}
        </div>
      </div>
    </div>
  );
}
