"use client";

import Link from "next/link";

import { cx } from "@/lib/cx";
import { PfBandCell } from "../kit/PfBandCell";
import { StatusMark } from "../kit/StatusMark";
import { EMPTY_CELL, formatDateDots, formatDecimal } from "@/lib/format";
import { formatPercent01, formatPf, formatVariancePoints, type VarianceStatus } from "@/lib/earned-value";
import type { EvPanelReport } from "@/lib/api/models";
import type { Fraction } from "@/lib/api/scale";

import { pfBandDescription, progressBarWidth, varianceTone, type PfBandRange } from "./panel-kpi-format";
import "./panel-kpi.css";

export interface PanelKpiRowProps {
  kpi: EvPanelReport["kpi"];
  weekNo: number | null;
  /** `links.diary(day)` — S25 K6 "Dağıt →". */
  distributeHref: string;
  /** Yazma izni VAR ve şantiye tamamlanmamış — yoksa "Dağıt →" basılmaz (salt okunur varyant). */
  canDistribute: boolean;
  /** KPI 2/3'ün "Sarı bant · 0,95–1,00" alt satırı için eşikler (`pf_bands`ten). */
  pfRange: PfBandRange;
  /**
   * `report.data.day` (ISO) — 🔴 LİDER DENETİMİ KUSURU (P3, 2026-09-26):
   * "Dağıtılmamış saat" kartının alt satırı mockup'ta "24.09 puantajı · tüm
   * şantiye" (Panel:181) der; ÖNCEDEN tarih EKSİKTİ ("puantajı · tüm
   * şantiye").
   */
  reportDay: string;
}

const mhr = (v: string | null) => (v === null ? EMPTY_CELL : formatDecimal(v, 0));
const pct = (v: Fraction | null) => (v === null ? EMPTY_CELL : formatPercent01(v));

/**
 * PLN-F3.3 · 🔴 6 KPI TEK SATIR (S25) — Panel:147-183. Kartlar dar ekranda
 * bile alt satıra KAYMAZ; metin kart İÇİNDE iki satıra kırılabilir
 * (`panel-kpi.css`teki `grid-template-columns: repeat(6, minmax(0, 1fr))`
 * + `white-space: normal` — mockup'ın `auto-fit` ızgarası BİLEREK
 * KULLANILMAZ, o satır sayısını GARANTİ ETMEZ).
 */
export function PanelKpiRow({ kpi, weekNo, distributeHref, canDistribute, pfRange, reportDay }: PanelKpiRowProps) {
  if (kpi === null) return null;
  const status = (kpi.status ?? "none") as VarianceStatus;
  const barWidth = progressBarWidth(kpi.progress_pct_cum);
  const cumBand = kpi.pf_cum_band ?? "none";
  const weekBand = kpi.pf_week_band ?? "none";
  const cumDescription = pfBandDescription(cumBand, pfRange);
  const weekDescription = pfBandDescription(weekBand, pfRange);

  return (
    <div className="ev-panel-kpi" role="list" aria-label="Planlama Paneli özet göstergeleri">
      <div className="ev-panel-kpi__card" role="listitem">
        <span className="ev-panel-kpi__label">Gerçek ilerleme</span>
        <span className="ev-panel-kpi__value">{pct(kpi.progress_pct_cum)}</span>
        <span className="ev-panel-kpi__meta">
          <span>
            Planlı <b>{pct(kpi.planned_pct_cum)}</b>
          </span>
          <span className={cx("ev-panel-kpi__dev", `ev-panel-kpi__dev--${varianceTone(kpi.variance)}`)}>
            {kpi.variance === null ? EMPTY_CELL : formatVariancePoints(kpi.variance)}
          </span>
          <StatusMark status={status} className="ev-panel-kpi__status" />
        </span>
      </div>

      <div className={cx("ev-panel-kpi__card", `ev-panel-kpi__card--band-${cumBand}`)} role="listitem">
        <span className="ev-panel-kpi__label">Kümülatif PF</span>
        <PfBandCell
          as="span"
          className="ev-panel-kpi__value ev-panel-kpi__value--band"
          value={kpi.pf_cum === null ? null : formatPf(kpi.pf_cum)}
          band={cumBand}
        />
        {cumDescription !== null && <span className="ev-panel-kpi__band-desc">{cumDescription}</span>}
      </div>

      <div className={cx("ev-panel-kpi__card", `ev-panel-kpi__card--band-${weekBand}`)} role="listitem">
        <span className="ev-panel-kpi__label">Bu hafta PF{weekNo !== null ? ` · H${weekNo}` : ""}</span>
        <PfBandCell
          as="span"
          className="ev-panel-kpi__value ev-panel-kpi__value--band"
          value={kpi.pf_week === null ? null : formatPf(kpi.pf_week)}
          band={weekBand}
        />
        {weekDescription !== null && <span className="ev-panel-kpi__band-desc">{weekDescription}</span>}
      </div>

      <div className="ev-panel-kpi__card" role="listitem">
        <span className="ev-panel-kpi__label">Kazanılmış / Bütçe</span>
        <span className="ev-panel-kpi__ratio">
          <span className="ev-panel-kpi__ratio-num">{mhr(kpi.earned_cum)}</span>
          <span className="ev-panel-kpi__ratio-den">/ {mhr(kpi.budget_mhr)} a-s</span>
        </span>
        <div className="ev-panel-kpi__bar" role="presentation">
          <div className="ev-panel-kpi__bar-fill" style={{ width: `${barWidth}%` }} />
        </div>
        <span className="ev-panel-kpi__submeta">
          Planlı konum <b>{pct(kpi.planned_pct_cum)}</b>
        </span>
      </div>

      <div className="ev-panel-kpi__card" role="listitem">
        <span className="ev-panel-kpi__label">Bugün harcanan</span>
        <span className="ev-panel-kpi__ratio">
          <span className="ev-panel-kpi__ratio-num">{mhr(kpi.spent_day)}</span>
          <span className="ev-panel-kpi__ratio-den">a-s</span>
        </span>
        <span className="ev-panel-kpi__submeta">
          Puantaj <b>{mhr(kpi.timesheet_total_day)}</b> · kazanılmış <b>{mhr(kpi.earned_day)}</b>
        </span>
      </div>

      <div className="ev-panel-kpi__card ev-panel-kpi__card--warn" role="listitem">
        <span className="ev-panel-kpi__label ev-panel-kpi__label--warn">Dağıtılmamış saat</span>
        <span className="ev-panel-kpi__value ev-panel-kpi__value--warn">
          {mhr(kpi.undistributed_day)} <span className="ev-panel-kpi__unit">a-s</span>
        </span>
        <span className="ev-panel-kpi__submeta ev-panel-kpi__submeta--warn">
          <span>{formatDateDots(reportDay).slice(0, 5)} puantajı · tüm şantiye</span>
          {canDistribute && (
            <Link href={distributeHref} className="ev-panel-kpi__distribute">
              Dağıt →
            </Link>
          )}
        </span>
      </div>
    </div>
  );
}
