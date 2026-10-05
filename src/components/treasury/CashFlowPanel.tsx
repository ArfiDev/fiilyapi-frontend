import type { CashFlowResponse } from "@/lib/api/hooks/useCashFlow";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { TREASURY_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatCompactCurrencyTight, formatMonthName } from "@/lib/format";

import {
  buildCashFlowGeometry,
  CHART_VIEWBOX_HEIGHT,
  CHART_WIDTH,
} from "./cash-flow-geometry";
import "./treasury.css";

export interface CashFlowPanelProps {
  /** `undefined` ⇒ hâlâ yükleniyor; hata dalını çağıran taraf basar. */
  cashFlow: CashFlowResponse | undefined;
  isLoading: boolean;
  errorMessage: string | undefined;
}

/** E9:92-101 SVG degrade kimlikleri — sayfada tek örnek olduğu için sabit. */
const INFLOW_GRADIENT_ID = "hazineNakitGiris";
const OUTFLOW_GRADIENT_ID = "hazineNakitCikis";

/**
 * E9:90-106 · Nakit Akışı kartı.
 *
 * 🔴 Başlık ayı SUNUCUNUN ECHO ETTİĞİ `month`/`year`ten türer (E9:91 "Temmuz
 * Nakit Akışı"), istemci saatinden DEĞİL — sunucu dönemi `DISPLAY_TIMEZONE`da
 * hesaplar; istemci `new Date().getMonth()` deseydi TR gecesi 00:00-03:00
 * arasında bir önceki ayı yazabilirdi.
 */
export function CashFlowPanel({ cashFlow, isLoading, errorMessage }: CashFlowPanelProps) {
  const isHidden = useCategoryHidden(TREASURY_HIDDEN_CATEGORIES);
  const title =
    cashFlow === undefined ? "Nakit Akışı" : `${formatMonthName(cashFlow.month)} Nakit Akışı`;
  const hasSeries = cashFlow !== undefined && cashFlow.series.length > 0;
  const geometry = hasSeries
    ? buildCashFlowGeometry(cashFlow.series, cashFlow.year, cashFlow.month)
    : undefined;
  // IZN-F4b.2 — hiç sayısal nokta yoksa (tüm kovalar gizli) eğri ÇİZİLMEZ.
  const isChartHidden =
    geometry !== undefined && geometry.inflowPoints.length === 0 && geometry.outflowPoints.length === 0;
  const legendValues = [cashFlow?.inflow_total, cashFlow?.outflow_total];

  return (
    <section className="hazine-panel" data-testid="hazine-cashflow-panel">
      {/* 91 */}
      <h2 className="hazine-panel__title">
        {title}
        <MaskedMark isHidden={isHidden} values={legendValues} />
      </h2>

      {isLoading && <p className="hazine-notice">Yükleniyor…</p>}
      {errorMessage !== undefined && (
        <p className="hazine-notice hazine-notice--danger" role="alert">
          {errorMessage}
        </p>
      )}

      {/* Boş ay: sessiz boş SVG basılmaz — seri SEYREKtir, hareketsiz ayda
          hiç satır gelmez ve toplamlar `0`dır (NULL değil). */}
      {cashFlow !== undefined && !hasSeries && (
        <p className="hazine-notice" data-testid="hazine-cashflow-empty">
          Bu ay için nakit hareketi kaydı yok.
        </p>
      )}

      {isChartHidden && (
        <p className="hazine-notice" data-testid="hazine-cashflow-hidden">
          Nakit akışı tutarları bu görünümde yok.
        </p>
      )}

      {geometry !== undefined && !isChartHidden && (
        // 92 — `preserveAspectRatio="none"`, genişlik %100, yükseklik 100px.
        <svg
          className="hazine-chart"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_VIEWBOX_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title} grafiği`}
          data-testid="hazine-cashflow-chart"
        >
          {/* 93-96 */}
          <defs>
            <linearGradient id={INFLOW_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-success)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--color-success)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id={OUTFLOW_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-danger)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--color-danger)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* 97-98 — giriş: düz çizgi + degrade dolgu */}
          <path d={geometry.inflowArea} fill={`url(#${INFLOW_GRADIENT_ID})`} />
          <path
            d={geometry.inflowLine}
            fill="none"
            stroke="var(--color-success)"
            strokeWidth="2"
            strokeLinecap="round"
            data-testid="hazine-cashflow-inflow-line"
          />
          {/* 99-100 — çıkış: kesik çizgi + degrade dolgu */}
          <path d={geometry.outflowArea} fill={`url(#${OUTFLOW_GRADIENT_ID})`} />
          <path
            d={geometry.outflowLine}
            fill="none"
            stroke="var(--color-danger)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="4,3"
            data-testid="hazine-cashflow-outflow-line"
          />
        </svg>
      )}

      {/* 102-105 — açıklama şeridi. Biçim `formatCompactCurrencyTight`tir:
          E9:103 `₺4,12M` · E9:104 `₺3,84M` — BOŞLUKSUZ ve İKİ ondalıklı.
          E9 kendi içinde tutarlıdır: boşluklu biçim YALNIZ kart bakiyesinindir
          (E9:72/77/82), diğer her para boşluksuzdur (E9:103/104/114/118/122).
          `/makine` KPI'ının bağlı olduğu `formatCompactCurrency`ye
          DOKUNULMADI — o ayrı bir varyanttır. */}
      {cashFlow !== undefined && (
        <div className="hazine-legend">
          <div className="hazine-legend__item">
            <span className="hazine-legend__line hazine-legend__line--in" aria-hidden="true" />
            <span className="hazine-legend__text">
              Giriş {formatCompactCurrencyTight(cashFlow.inflow_total)}
            </span>
          </div>
          <div className="hazine-legend__item">
            <span className="hazine-legend__line hazine-legend__line--out" aria-hidden="true" />
            <span className="hazine-legend__text">
              Çıkış {formatCompactCurrencyTight(cashFlow.outflow_total)}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
