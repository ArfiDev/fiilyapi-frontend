import type { MonthlyCashPoint } from "@/lib/api/hooks/useCashFlowStatement";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { ACCOUNTING_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { formatAmount } from "@/lib/format";

import {
  CHART_END_DOT_RADIUS,
  CHART_HEIGHT,
  CHART_LABEL_Y,
  CHART_WIDTH,
  buildMonthlyCashGeometry,
} from "./cash-flow-statement";

interface MonthlyCashChartProps {
  series: readonly MonthlyCashPoint[];
}

/** Gradyanın kimliği — DOM'da tek olmalı, `url(#…)` ile eşleşir. */
const GRADIENT_ID = "na-cash-gradient";

/**
 * NA:117-141 — `Aylık Nakit Pozisyonu`. Geometri SAF katmanda hesaplanır
 * (`buildMonthlyCashGeometry`); burası yalnız çizer.
 *
 * 🔴 SVG'nin ERİŞİLEBİLİR ADI VARDIR (`role="img"` + `aria-label`): gerçek
 * bilgi taşıyan bir grafiktir, süs değildir. Ayrıca serinin son bakiyesi metin
 * olarak da özetlenir — eğri ekran okuyucuya hiçbir şey söylemez.
 */
export function MonthlyCashChart({ series }: MonthlyCashChartProps) {
  const isHidden = useCategoryHidden(ACCOUNTING_HIDDEN_CATEGORIES);
  const geometry = buildMonthlyCashGeometry(series);
  // IZN-F4b.2 — son SAYISAL bakiye (gizli `null` ay "0" sayılmaz); hiç sayısal ay yoksa özet de yok.
  const lastKnown = [...series].reverse().find((entry) => entry.closing_cash !== null);
  const isAllHidden = series.length > 0 && geometry.points.length === 0;

  return (
    <section className="fs-cf-panel" data-testid="na-chart">
      {/* NA:118 */}
      <h2 className="fs-cf-panel__title">
        Aylık Nakit Pozisyonu
        <MaskedMark isHidden={isHidden} values={series.map((entry) => entry.closing_cash)} />
      </h2>

      {series.length === 0 ? (
        // Boş seride uydurma bir eğri BASILMAZ; sessiz düşüş de yok.
        <p className="fs-notice" data-testid="na-chart-empty">
          Seçilen dönemde aylık nakit pozisyonu verisi yok.
        </p>
      ) : isAllHidden ? (
        // Hiç sayısal ay yok: eğri ÇİZİLMEZ (0'a düşürülmüş düz çizgi sahte veri olurdu).
        <p className="fs-notice" data-testid="na-chart-hidden">
          Aylık nakit tutarları bu görünümde yok.
        </p>
      ) : (
        <svg
          className="fs-cf-chart"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none" /* NA:119 */
          role="img"
          aria-label={`Aylık nakit pozisyonu — ${series.length} ay${
            lastKnown?.closing_cash == null
              ? ""
              : `, ${lastKnown === series[series.length - 1] ? "dönem sonu" : "son bilinen bakiye"} ${formatAmount(
                  lastKnown.closing_cash,
                )}`
          }`}
        >
          <defs>
            {/* NA:121-124 — dikey solma. */}
            <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="fs-cf-chart__stop-top" />
              <stop offset="100%" className="fs-cf-chart__stop-bottom" />
            </linearGradient>
          </defs>

          {/* NA:127 — dolgu. */}
          <path className="fs-cf-chart__area" d={geometry.areaPath} fill={`url(#${GRADIENT_ID})`} />
          {/* NA:129 — çizgi. */}
          <path className="fs-cf-chart__line" d={geometry.linePath} />

          {/* NA:131-137 — ay etiketleri. */}
          {geometry.labels.map((label) => (
            <text key={label.key} className="fs-cf-chart__label" x={label.x} y={CHART_LABEL_Y}>
              {label.text}
            </text>
          ))}

          {/* NA:139 — uç nokta. */}
          {geometry.endDot !== null && (
            <circle
              className="fs-cf-chart__dot"
              cx={geometry.endDot.x}
              cy={geometry.endDot.y}
              r={CHART_END_DOT_RADIUS}
            />
          )}
        </svg>
      )}
    </section>
  );
}
