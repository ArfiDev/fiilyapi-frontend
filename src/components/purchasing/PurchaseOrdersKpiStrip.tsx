"use client";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCompactCurrencyTight } from "@/lib/format";
import type { PurchasingSummaryResponse } from "@/lib/api/hooks/usePurchasingSummary";

import "./purchasing.css";

export interface PurchaseOrdersKpiStripProps {
  /** Yükleniyor/hata durumunda `undefined` — sahte sıfır BASILMAZ. */
  summary: PurchasingSummaryResponse | undefined;
}

/** Değer basılamıyorken tüm kartların ortak yer tutucusu. */
const EMPTY_VALUE = "—";

/**
 * SIP 38-43 · sipariş KPI şeridi — DÖRT kart, sırasıyla:
 * Aktif Siparişler (39) · Bu Ay Toplam (40) · Yolda (41) · Teslim Edildi (42).
 *
 * ⚠️ SAT'ın şeridiyle (`PurchasingKpiStrip`) AYNI uçtan (`GET
 * /purchasing/summary`) beslenir; DÖRT alanından biri (`orders_this_month_total`)
 * SAT'ın "Bu Ay Sipariş" kartıyla ORTAKTIR — tek bileşen yapıp "hangi ekran
 * hangi kartı ister" koşulu koymak iki mockup'ı da bulanıklaştırırdı. Dört
 * alanın dördü de şemada VARDIR (`active_orders` · `orders_this_month_total` ·
 * `in_transit_orders` · `delivered_orders`): pending dalı YOKTUR ve uydurma
 * sayı basılmaz.
 *
 * ⚠️ `MetricPlaceholder` ZARFI YOKTUR (şema açıklaması): `0` GERÇEK bir
 * cevaptır ("hiç aktif sipariş yok"), "veri gelmedi" ile karıştırılmaz.
 */
export function PurchaseOrdersKpiStrip({ summary }: PurchaseOrdersKpiStripProps) {
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  return (
    <div className="sat-kpi" data-testid="sip-kpi-strip">
      {/* 39 */}
      <div className="sat-kpi__card">
        <div className="sat-kpi__label">Aktif Siparişler</div>
        <div className="sat-kpi__value sat-kpi__value--primary" data-testid="sip-kpi-active">
          {summary ? summary.active_orders : EMPTY_VALUE}
        </div>
      </div>

      {/* 40 — tek PARA kartı; mockup "₺1,24M" kısaltmasını basar */}
      <div className="sat-kpi__card">
        <div className="sat-kpi__label">Bu Ay Toplam</div>
        <div className="sat-kpi__value sat-kpi__value--neutral" data-testid="sip-kpi-month">
          {summary ? formatCompactCurrencyTight(summary.orders_this_month_total) : EMPTY_VALUE}
          <MaskedMark isHidden={isCostHidden} values={[summary?.orders_this_month_total]} />
        </div>
      </div>

      {/* 41 */}
      <div className="sat-kpi__card">
        <div className="sat-kpi__label">Yolda</div>
        <div className="sat-kpi__value sat-kpi__value--warning" data-testid="sip-kpi-transit">
          {summary ? summary.in_transit_orders : EMPTY_VALUE}
        </div>
      </div>

      {/* 42 */}
      <div className="sat-kpi__card">
        <div className="sat-kpi__label">Teslim Edildi</div>
        <div className="sat-kpi__value sat-kpi__value--success" data-testid="sip-kpi-delivered">
          {summary ? summary.delivered_orders : EMPTY_VALUE}
        </div>
      </div>
    </div>
  );
}
