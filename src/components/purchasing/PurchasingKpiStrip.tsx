"use client";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCompactCurrencyTight } from "@/lib/format";
import type { PurchasingSummaryResponse } from "@/lib/api/hooks/usePurchasingSummary";

import "./purchasing.css";

export interface PurchasingKpiStripProps {
  /** Yükleniyor/hata durumunda `undefined` — sahte sıfır BASILMAZ. */
  summary: PurchasingSummaryResponse | undefined;
}

/** Değer basılamıyorken tüm kartların ortak yer tutucusu. */
const EMPTY_VALUE = "—";

/**
 * SAT 68-86 · KPI şeridi — DÖRT kart, sırasıyla:
 * Açık Talepler (71-72) · Teklif Bekleniyor (75-76) · Bu Ay Sipariş (79-80) ·
 * Onay Bekleyen (83-84).
 *
 * ⚠️ Dördü de `GET /purchasing/summary` ucundan gelir ve SEKME ŞERİDİNDEN
 * BAĞIMSIZDIR (uç durum süzgeci almaz, `usePurchasingSummary` notu):
 * "Onay Bekleyen" kartı kullanıcı "Teklifler" sekmesindeyken de TÜM
 * bekleyenleri sayar. Aksi hâlde her kart kendi sekmesinde kendi sayısını
 * basar ve şerit anlamsızlaşırdı.
 *
 * ⚠️ Bu uçta `MetricPlaceholder` ZARFI YOKTUR (şema açıklaması): her alanın
 * veri kaynağı vardır ve `0` GERÇEK bir cevaptır ("hiç açık talep yok") —
 * pending ile karıştırılmaz, bu yüzden burada tek bir pending dalı yoktur.
 */
export function PurchasingKpiStrip({ summary }: PurchasingKpiStripProps) {
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  return (
    <div className="sat-kpi" data-testid="sat-kpi-strip">
      {/* 70-73 */}
      <div className="sat-kpi__card">
        <div className="sat-kpi__label">Açık Talepler</div>
        <div className="sat-kpi__value sat-kpi__value--warning">
          {summary ? summary.open_requests : EMPTY_VALUE}
        </div>
      </div>

      {/* 74-77 */}
      <div className="sat-kpi__card">
        <div className="sat-kpi__label">Teklif Bekleniyor</div>
        <div className="sat-kpi__value sat-kpi__value--primary">
          {summary ? summary.quote_wait_requests : EMPTY_VALUE}
        </div>
      </div>

      {/* 78-81 — tek PARA kartı; mockup "₺1,24M" kısaltmasını basar (80) */}
      <div className="sat-kpi__card">
        <div className="sat-kpi__label">Bu Ay Sipariş</div>
        <div className="sat-kpi__value sat-kpi__value--neutral">
          {summary ? formatCompactCurrencyTight(summary.orders_this_month_total) : EMPTY_VALUE}
          <MaskedMark isHidden={isCostHidden} values={[summary?.orders_this_month_total]} />
        </div>
      </div>

      {/* 82-85 */}
      <div className="sat-kpi__card">
        <div className="sat-kpi__label">Onay Bekleyen</div>
        <div className="sat-kpi__value sat-kpi__value--danger">
          {summary ? summary.pending_approval_requests : EMPTY_VALUE}
        </div>
      </div>
    </div>
  );
}
