"use client";

import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { COST_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCompactCurrency } from "@/lib/format";
import type { SiteStockKpis } from "@/lib/api/hooks/useSiteStock";

import "./stock.css";

export interface SiteStockKpiStripProps {
  /** Yükleniyor/hata durumunda `undefined` — sahte sıfır BASILMAZ. */
  kpis: SiteStockKpis | undefined;
}

/** Değer basılamıyorken tüm kartların ortak yer tutucusu (E3 şeridiyle aynı). */
const EMPTY_VALUE = "—";

/**
 * ŞS 86-91 · KPI şeridi — DÖRT kart, sırasıyla: Toplam Malzeme (87) · Kritik
 * Stok (88) · Düşük Stok (89) · Stok Değeri (90).
 *
 * ⚠️ E3'ün şeridiyle KARIŞTIRILMAMALI: burada "Bekleyen Sipariş" kartı YOKTUR
 * (mockup çizmemiş, `SiteStockKpis` şeması da o zarfı taşımaz) ve buna karşılık
 * "Düşük Stok" kartı VARDIR. Bu yüzden `StockKpiStrip` yeniden kullanılamaz;
 * ortak olan CSS ve biçimlendirme yardımcılarıdır.
 *
 * ⚠️ Dört sayının hepsi sunucunun `kpis` zarfındandır; ekran satırlardan
 * yeniden TOPLAMAZ (spec §3).
 */
export function SiteStockKpiStrip({ kpis }: SiteStockKpiStripProps) {
  const isCostHidden = useCategoryHidden(COST_HIDDEN_CATEGORIES);
  return (
    <div className="stok-kpi" data-testid="santiye-stok-kpi-strip">
      {/* 87 */}
      <div className="stok-kpi__card">
        <div className="stok-kpi__label">Toplam Malzeme</div>
        <div className="stok-kpi__value stok-kpi__value--neutral">
          {kpis ? `${kpis.total_items} Kalem` : EMPTY_VALUE}
        </div>
      </div>

      {/* 88 — sol kenarlığı kırmızı */}
      <div className="stok-kpi__card stok-kpi__card--critical">
        <div className="stok-kpi__label">Kritik Stok</div>
        <div className="stok-kpi__value stok-kpi__value--danger">
          {kpis ? `${kpis.critical_count} Kalem` : EMPTY_VALUE}
        </div>
      </div>

      {/* 89 — sol kenarlığı kehribar */}
      <div className="stok-kpi__card stok-kpi__card--low">
        <div className="stok-kpi__label">Düşük Stok</div>
        <div className="stok-kpi__value stok-kpi__value--warning">
          {kpis ? `${kpis.low_count} Kalem` : EMPTY_VALUE}
        </div>
      </div>

      {/* 90 */}
      <div className="stok-kpi__card">
        <div className="stok-kpi__label">Stok Değeri</div>
        <div className="stok-kpi__value stok-kpi__value--neutral">
          {kpis ? formatCompactCurrency(kpis.total_value) : EMPTY_VALUE}
          <MaskedMark isHidden={isCostHidden} values={[kpis?.total_value]} />
        </div>
      </div>
    </div>
  );
}
