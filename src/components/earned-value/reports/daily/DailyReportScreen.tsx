"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { TreeTable } from "@/components/earned-value/common/tree-table/TreeTable";
import type { TreeNode } from "@/components/earned-value/common/tree-table/tree-rows";
import { ChartTooltip } from "@/components/earned-value/common/chart-tooltip/ChartTooltip";
import { useChartViewScale } from "@/components/earned-value/reports/charts/use-chart-view-scale";
import { ErrorCard, ReadOnlyStrip, Skeleton, SkeletonRows } from "@/components/earned-value/common/state";
import { ReportDateNav } from "@/components/earned-value/reports/kit/ReportDateNav";
import { PfBandCell } from "@/components/earned-value/reports/kit/PfBandCell";
import { StatusMark } from "@/components/earned-value/reports/kit/StatusMark";
import { WeatherStrip } from "@/components/earned-value/reports/kit/WeatherStrip";
import type { ReportScreenProps } from "@/components/earned-value/reports/kit/report-screen";
import { Button } from "@/components/ui";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { useApproveDailyReport, useDailyReport } from "@/lib/api/hooks/useEvReports";
import { backendErrorMessage } from "@/lib/api/error-message";
import { compareDecimalStrings, formatPercent01, formatPf, formatVariancePoints } from "@/lib/earned-value";
import { EMPTY_CELL, formatDateDots, formatDateTimeDots, formatQuantity, formatWeekdayShort } from "@/lib/format";
import type { EvDailyReport, EvQtyTreeRow } from "@/lib/api/models";

import { QUANTITY_COLUMNS, TOTAL_ROW_ID, isTotalRow, wholeHours } from "./daily-columns";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { DailyApproveModal } from "./DailyApproveModal";
import { DailyPrintView } from "./DailyPrintView";
import {
  approveGate,
  formatDayMonthDots,
  formatToleranceLabel,
  isTrendHidden,
  formatWeekRangeDots,
  directTotalLabel,
  joinWithVe,
  kpiRowLabel,
  reconciliationText,
  trendTitle,
  reportEyebrow,
  weekdayOf,
  reportNoLabel,
  versionSuffix,
} from "./daily-logic";
import { pfOutOfBandRows } from "./pf-out-of-band";
import { buildTrendChart } from "./trend-chart";
import { buildQuantityTree } from "./quantity-tree";
import { useDailyReportUrlState } from "./daily-url-state";

import "./daily-report.css";

type ViewMode = "screen" | "print";


function statusBadge(report: EvDailyReport) {
  if (report.status === "not_generated") return { text: "Üretilemedi", tone: "warning" as const };
  if (report.status === "approved") {
    const who = report.approved_by?.full_name ?? EMPTY_CELL;
    const when = report.approved_at === null ? "" : `, ${formatDateTimeDots(report.approved_at)}`;
    return { text: `Onaylandı — ${who}${when}${versionSuffix(report.status, report.version)}`, tone: "success" as const };
  }
  return { text: "Taslak", tone: "neutral" as const };
}

/** GİR:114 — eksik günlük bandı solundaki ⓘ ikonu (mockup daire+ünlem, uyarı rengi). */
function InfoGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 17 17" fill="none" aria-hidden="true" className="ev-daily-missing-band__icon">
      <circle cx="8.5" cy="8.5" r="7.5" stroke="var(--color-warning-strong)" strokeWidth="1.4" />
      <path d="M8.5 5v4.5M8.5 11v.4" stroke="var(--color-warning-strong)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** GİR:112-118 — eksik/taslak günlük bandı; S11 "günlüğü yok"; "Günlük Kayıt →" bağlantısı `links.diary`. */
function MissingDiaryBand({ report, diaryHref }: { report: EvDailyReport; diaryHref: string }) {
  if (report.draft_diary_dates.length === 0) return null;
  return (
    <div className="ev-daily-missing-band" role="note">
      <InfoGlyph />
      <span>
        <b>{joinWithVe(report.draft_diary_dates.map((d) => formatDayMonthDots(d)))} günlükleri gönderilmedi;</b> rapor eksik veriyle üretildi.
        Bu günlerin miktar ve saatleri taslak değer olarak kullanıldı.
      </span>
      <Link href={diaryHref} className="ev-daily-missing-band__link">
        Günlük Kayıt →
      </Link>
    </div>
  );
}

/** K27 — sapma "late" ise kırmızı, "ahead" ise yeşil metin (mockup `devFg`, GİR:456 `dev<-2?red:dev>2?green:gray`). */
function varianceClass(status: EvDailyReport["kpis"][number]["status"]): string | undefined {
  if (status === "late") return "ev-daily-kpi__variance--late";
  if (status === "ahead") return "ev-daily-kpi__variance--ahead";
  return undefined;
}

/** GİR:465 `krow()` — Genel satırı kalın (ind 12), Genel–Kendi/Taşeron içerlekli+orta ağırlık (ind 24), disiplinler normal. */
function kpiRowClass(kind: EvDailyReport["kpis"][number]["kind"]): string {
  if (kind === "overall") return "ev-daily-kpi__row--overall";
  if (kind === "overall_own" || kind === "overall_subcon") return "ev-daily-kpi__row--sub";
  return "";
}

const pct2 = (v: string | null) => (v === null ? EMPTY_CELL : formatPercent01(v, 2));
// F3.6b lider denetimi (4. tur, bölge kırpıntısı) — GİR:169 KÜM. % kolonları
// mockup `pct(a.cp)`/`pct(a.ca)` varsayılan 1 ondalık basar (GÜNLÜK % `dp`/`da`
// gibi 2 DEĞİL); `pct2` burada YANLIŞ olurdu.
const pct1 = (v: string | null) => (v === null ? EMPTY_CELL : formatPercent01(v));

function KpiTable({ report }: { report: EvDailyReport }) {
  const scope = useDisciplineScope();
  return (
    <div className="ev-daily-kpi">
      {/* GİR:169 — bölüm başlığının yanındaki kapsam/tolerans alt yazısı. */}
      <p className="ev-daily-kpi__caption">
        günlük değerler {formatDayMonthDots(report.report_date)} · kümülatif{" "}
        {report.project_start !== null ? formatDayMonthDots(report.project_start) : EMPTY_CELL}–{formatDayMonthDots(report.report_date)} ·
        tolerans ±{formatToleranceLabel(report.tolerance_points)} puan
      </p>
      <table className="ev-daily-kpi__table">
        <thead>
          <tr>
            <th>Disiplin</th>
            <th>Günlük planlı %</th>
            <th>Günlük gerçek %</th>
            <th>Günlük harcanan</th>
            <th>Günlük kazanılmış</th>
            <th>Günlük PF</th>
            <th>Küm. PF</th>
            <th>Küm. planlı %</th>
            <th>Küm. gerçek %</th>
            <th>Sapma</th>
            <th>Durum</th>
          </tr>
        </thead>
        <tbody>
          {report.kpis.map((row) => {
            const chip = row.contractor_mix === "own" ? "Kendi" : row.contractor_mix === "subcon" ? "Taşeron" : null;
            return (
              <tr key={`${row.kind}:${row.node_id ?? ""}`} className={kpiRowClass(row.kind)}>
                <td className="ev-daily-kpi__name">
                  <span>{kpiRowLabel(row, scope.isRestricted)}</span>
                  {chip !== null && <span className="ev-daily-kpi__chip">{chip}</span>}
                </td>
                <td>{pct2(row.planned_pct_day)}</td>
                <td>{pct2(row.progress_pct_day)}</td>
                <td>{wholeHours(row.spent_day)}</td>
                <td>{wholeHours(row.earned_day)}</td>
                <PfBandCell as="td" value={row.pf_day === null ? null : formatPf(row.pf_day)} band={row.pf_day_band ?? "none"} />
                <PfBandCell as="td" value={row.pf_cum === null ? null : formatPf(row.pf_cum)} band={row.pf_cum_band ?? "none"} />
                <td>{pct1(row.planned_pct_cum)}</td>
                <td>{pct1(row.progress_pct_cum)}</td>
                <td className={varianceClass(row.status)}>{row.variance === null ? EMPTY_CELL : formatVariancePoints(row.variance)}</td>
                <td>
                  <StatusMark status={row.status ?? "none"} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** GİR:159 "Cum 18" — kısa hafta günü + gün numarası (yılsız). */
function trendDayLabel(iso: string): string {
  const day = iso.split("-")[2];
  return `${formatWeekdayShort(iso)} ${day === undefined ? "" : Number(day)}`;
}

/** GİR:199 `tag`: tatil / gönderilmedi / rapor günü — ilk eşleşen kazanır (mockup sırası). */
function trendDayTag(t: EvDailyReport["trend"][number], reportDate: string): string | null {
  if (t.day === reportDate) return "rapor günü";
  if (t.is_holiday) return "tatil";
  if (t.is_draft) return "gönderilmedi";
  return null;
}

/**
 * GİR:472 `dFg`: fark negatifken kırmızı, aksi hâlde yeşil (HAM işaret, tolerans DEĞİL).
 * Lider denetimi (8. tur) — ondalık kanonu: `Number(delta) < 0` YERİNE `compareDecimalStrings`.
 */
function deltaClass(delta: string | null): string | undefined {
  if (delta === null) return undefined;
  return compareDecimalStrings(delta, "0") < 0 ? "ev-daily-trend__delta--neg" : "ev-daily-trend__delta--pos";
}

/** GİR:225 mini grafik `viewBox` genişliği — CSS piksele ölçeklemek için. */
const TREND_VIEW_WIDTH = 420;

function TrendSection({ report }: { report: EvDailyReport }) {
  const chart = buildTrendChart(report.trend);
  // F3.6b lider denetimi (madde 7) — durağan ipucu: rapor günü satırından OKUNUR
  // (grafiğin son noktası her zaman rapor günüdür — `buildTrendChart` `is_future` filtreler).
  const reportTrend = report.trend.find((t) => t.day === report.report_date) ?? null;
  // Lider DRY talebi (2026-09-26) — ortak `reports/charts/use-chart-view-scale.ts`
  // (önceki yerel `useTrendChartScale` kopyası SİLİNDİ, davranış AYNI).
  const { ref: svgRef, scale } = useChartViewScale(TREND_VIEW_WIDTH);
  const reportPoint = chart !== null && chart.points.length > 0 ? chart.points[chart.points.length - 1]! : null;
  return (
    <div className="ev-daily-trend">
      <table className="ev-daily-trend__table">
        <thead>
          <tr>
            <th>Gün</th>
            {report.trend.map((t) => {
              const tag = trendDayTag(t, report.report_date);
              return (
                <th key={t.day} className={t.is_future ? "ev-daily-trend__future" : undefined}>
                  <span className="ev-daily-trend__day-label">{trendDayLabel(t.day)}</span>
                  {tag !== null && <span className="ev-daily-trend__day-tag">{tag}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          <tr>
            {/* F3.6b lider denetimi (4. tur) — GİR:199 mockup `pct(P[i], 2)`: trend
                yüzdeleri 2 ondalık (KPI'nin KÜM. % `pct1`'inden FARKLI, dokunma). */}
            <td>Planlı %</td>
            {report.trend.map((t) => (
              <td key={t.day}>{t.is_future || t.planned_pct_cum === null ? EMPTY_CELL : formatPercent01(t.planned_pct_cum, 2)}</td>
            ))}
          </tr>
          <tr>
            <td>Gerçek %</td>
            {report.trend.map((t) => (
              <td key={t.day}>
                {t.is_draft && <span className="ev-daily-trend__draft-dot" title="Gönderilmedi · taslak" />}
                {t.is_future || t.progress_pct_cum === null ? EMPTY_CELL : formatPercent01(t.progress_pct_cum, 2)}
              </td>
            ))}
          </tr>
          <tr>
            <td>Fark (puan)</td>
            {report.trend.map((t) => (
              <td key={t.day} className={t.is_future ? undefined : deltaClass(t.delta)}>
                {/* GİR:199 mockup `sgn(dv, 2)` — 2 ondalık (A'nın `formatVariancePoints` digits parametresi). */}
                {t.is_future || t.delta === null ? EMPTY_CELL : formatVariancePoints(t.delta, 2)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {chart !== null && (
        <div className="ev-daily-trend__chart-wrap">
          <div className="ev-daily-trend__legend">
            <span className="ev-daily-trend__legend-item">
              <svg width="16" height="4" aria-hidden="true">
                <line x1="0" y1="2" x2="16" y2="2" stroke="var(--color-text-subtle)" strokeWidth="2" strokeDasharray="4 3" />
              </svg>
              Planlı küm. %
            </span>
            <span className="ev-daily-trend__legend-item">
              <svg width="16" height="4" aria-hidden="true">
                <line x1="0" y1="2" x2="16" y2="2" stroke="var(--color-primary)" strokeWidth="2" />
              </svg>
              Gerçek küm. %
            </span>
            <span className="ev-daily-trend__legend-item">
              <span className="ev-daily-trend__legend-dot" />
              Gönderilmedi
            </span>
          </div>
          {/* Lider denetimi (7. tur, madde 2) — KÖK SEBEP: `ChartTooltip` konumu eski
              `chart-wrap`e (position:relative) göre hesaplanıyordu, ama o kap LEJANDI
              da içeriyordu — SVG-içi y=0 kabın İÇİNDE lejandın ALTINDA DEĞİL üstünde
              başlıyordu, ipucu lejandın ÜSTÜNE biniyordu. Ayrı `position:relative`
              sarmalayıcı (yalnız SVG) bu karışıklığı giderir — `ChartTooltip`nin
              `offsetParent`ı artık SVG'nin KENDİ kabı, lejant DIŞARIDA. */}
          <div className="ev-daily-trend__svg-wrap">
            <svg ref={svgRef} viewBox="0 0 420 160" className="ev-daily-trend__chart" role="img" aria-label="7 günlük kümülatif ilerleme grafiği">
              <path d={chart.plannedPath} fill="none" className="ev-daily-trend__line ev-daily-trend__line--planned" />
              <path d={chart.actualPath} fill="none" className="ev-daily-trend__line ev-daily-trend__line--actual" />
              {chart.points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.2} className={p.isDraft ? "ev-daily-trend__point--draft" : "ev-daily-trend__point"} />
              ))}
              {reportPoint !== null && (
                <line x1={reportPoint.x} x2={reportPoint.x} y1={8} y2={136} className="ev-daily-trend__report-line" />
              )}
            </svg>
            {/* Ortak `ChartTooltip` (koyu kutu), Panel'in PF trendiyle AYNI kalıp: başlık
                "gg.aa · rapor günü" + Planlı/Gerçek satırları, rapor günü noktasının
                YANINDA (SVG viewBox → CSS piksel `scale` ile), lejandın DIŞINDA. */}
            {reportPoint !== null && reportTrend !== null && (
              <ChartTooltip
                x={Math.round(reportPoint.x * scale) + 10}
                y={Math.round(reportPoint.y * scale) - 44}
                title={`${formatDayMonthDots(reportTrend.day)} · rapor günü`}
                rows={[
                  {
                    label: "Planlı",
                    value: reportTrend.planned_pct_cum === null ? "" : formatPercent01(reportTrend.planned_pct_cum, 2),
                  },
                  {
                    label: "Gerçek",
                    value: reportTrend.progress_pct_cum === null ? "" : formatPercent01(reportTrend.progress_pct_cum, 2),
                    strong: true,
                  },
                ]}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QuantitySection({ report }: { report: EvDailyReport }) {
  const scope = useDisciplineScope();
  // Disiplini atanmış kullanıcıda backend süzmesi miktar satırlarını boşaltabilir
  // (DSC-F1.3); "Toplam doğrudan" satırı tek başına tabloyu boş göstermez.
  if (scope.isRestricted && report.quantities.length === 0) {
    return (
      <div className="ev-daily-qty">
        <RestrictedEmptyNotice names={scope.names} />
      </div>
    );
  }
  const tree = buildQuantityTree(report.quantities);
  const overall = report.kpis.find((k) => k.kind === "overall") ?? null;
  // Lider denetimi (6. tur, madde 1) — "Toplam doğrudan" artık TreeTable'ın
  // KENDİ satırı (senteze `TOTAL_ROW_ID` node_id'siyle), kolonlarla HİZALI
  // basılır ("ad" hücresi 9 kolonu kaplar, PF/harcanan/ilerleme kendi
  // kolonunda) — önceki bağımsız `<div flex>` satırı kolon genişlikleriyle
  // UYUŞMUYORDU.
  const totalNode: TreeNode<EvQtyTreeRow> | null =
    overall === null
      ? null
      : {
          id: TOTAL_ROW_ID,
          data: {
            node_id: TOTAL_ROW_ID,
            level: 0,
            name: directTotalLabel(scope.isRestricted),
            uom: null,
            contractor_type: null,
            is_direct: null,
            planned_unit_mhr: null,
            actual_unit_mhr_day: null,
            actual_unit_mhr_cum: null,
            planned_qty: null,
            qty_day: null,
            qty_cum: null,
            remaining_qty: null,
            pf_day: overall.pf_day,
            pf_day_band: overall.pf_day_band ?? null,
            spent_day: overall.spent_day,
            progress_pct_cum: overall.progress_pct_cum,
          },
        };
  const nodes = totalNode === null ? tree : [...tree, totalNode];
  return (
    <div className="ev-daily-qty">
      <TreeTable
        nodes={nodes}
        columns={QUANTITY_COLUMNS}
        getLabel={(node) => node.data.name}
        variant="progress"
        collapsible={false}
        ariaLabel="Miktar tablosu"
        emptyText="Miktar satırı yok."
        className="ev-daily-qty__table"
        rowClassName={(node) => (isTotalRow(node.data) ? "ev-daily-qty__total-row" : undefined)}
      />
    </div>
  );
}

/** GİR:274 "✓" mutabakat çipi — bare glif YASAK (F3-SÖZLEŞME §3.6) → inline SVG (yeşil daire + onay). */
function ChipOkGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="ev-daily-footer__chip-icon">
      <circle cx="7" cy="7" r="7" fill="var(--color-success-strong)" />
      <path d="M4 7.2 5.8 9 10 5.2" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** GİR:275 "⚠" dağıtılmamış/atanamayan uyarı çipi. */
function ChipWarnGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="ev-daily-footer__chip-icon">
      <path d="M8 2.2 14.5 13.4H1.5L8 2.2Z" stroke="var(--color-warning-strong)" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 6.6v3.2M8 11.6v.3" stroke="var(--color-warning-strong)" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** GİR:276 "✕" oransız-girdi uyarı çipi. */
function ChipDangerGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="ev-daily-footer__chip-icon">
      <path d="M3 3 11 11M11 3 3 11" stroke="var(--color-danger-strong)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Mutabakat + oransız giriş + PF bant dışı — GİR:273-295. */
function FooterSection({ report, diaryHref, weeklyHref }: { report: EvDailyReport; diaryHref: string; weeklyHref: string }) {
  const { isRestricted } = useDisciplineScope();
  const footer = report.footer;
  const outOfBand = pfOutOfBandRows(report.warnings, report.quantities);
  return (
    <div className="ev-daily-footer">
      {footer !== null && (
        <div className="ev-daily-footer__chips">
          <span className="ev-daily-footer__chip ev-daily-footer__chip--ok">
            <ChipOkGlyph />
            {reconciliationText(footer, isRestricted)}
          </span>
          {compareDecimalStrings(footer.undistributed_day, "0") > 0 && (
            <span className="ev-daily-footer__chip ev-daily-footer__chip--warn">
              <ChipWarnGlyph />
              {formatQuantity(footer.undistributed_day)} a-s dağıtılmamış · PF hesabına girmedi
              {footer.undistributed_reason !== null && ` · gerekçe: ${footer.undistributed_reason}`}
            </span>
          )}
          {compareDecimalStrings(footer.unallocated_day, "0") > 0 && (
            // S20 — atanamayan saat (miktarsız gün), ayrı satır.
            <span className="ev-daily-footer__chip ev-daily-footer__chip--warn">
              <ChipWarnGlyph />
              Atanamayan saat (miktarsız gün): {formatQuantity(footer.unallocated_day)} a-s
            </span>
          )}
        </div>
      )}

      {report.unrated_entries.length > 0 && (
        <div className="ev-daily-footer__chips">
          {report.unrated_entries.map((w, i) => (
            <span key={i} className="ev-daily-footer__chip ev-daily-footer__chip--danger">
              <ChipDangerGlyph />
              {w.item_name ?? w.message}
              {w.section_name !== null && w.section_name !== undefined && ` · ${w.section_name}`}
              {w.value !== null && w.value !== undefined && ` · ${formatQuantity(w.value)}${w.uom ? ` ${w.uom}` : ""}`}{" "}
              oransız — rapora girmedi
            </span>
          ))}
        </div>
      )}

      <div className="ev-daily-footer__meta">
        <span>
          Üretim <span className="ev-daily-footer__mono">{formatDateTimeDots(report.generated_at)}</span>
        </span>
        <span>
          Rapor no <span className="ev-daily-footer__mono">{reportNoLabel(report.report_no)}</span>
        </span>
        <span>Kaynak: Günlük Kayıt + Puantaj + Adam-Saat Bütçesi {report.revision?.name ?? EMPTY_CELL}</span>
        <span>{report.status === "approved" ? `Onaylayan: ${report.approved_by?.full_name ?? EMPTY_CELL}` : "Onay bekliyor"}</span>
      </div>

      {outOfBand.length > 0 && (
        <div className="ev-daily-footer__pf-table">
          <div className="ev-daily-footer__pf-title">
            PF bant dışı kalemler (&lt; {report.pf_bands === null || report.pf_bands === undefined ? EMPTY_CELL : formatPf(report.pf_bands.daily.red_below)}
            )
          </div>
          <table>
            <thead>
              <tr>
                <th>Kalem</th>
                <th>Disiplin</th>
                <th>Günlük PF</th>
                <th>Küm. PF</th>
              </tr>
            </thead>
            <tbody>
              {outOfBand.map((row) => (
                <tr key={row.key}>
                  <td>{row.itemName}</td>
                  <td>{row.disciplineName ?? EMPTY_CELL}</td>
                  {/* Lider denetimi (6. tur, madde 5) — GİR:293-294 mockup küçük rozet (`padding:1px 5px`)
                      basar, hücrenin TAMAMI DEĞİL (KPI/miktar tablosundaki `as="td"` kalıbından FARKLI). */}
                  <td className="ev-daily-footer__pf-cell">
                    <PfBandCell as="span" value={row.dayValue === null ? null : formatPf(row.dayValue)} band={row.dayBand} />
                  </td>
                  <td className="ev-daily-footer__pf-cell">
                    <PfBandCell as="span" value={row.cumValue === null ? null : formatPf(row.cumValue)} band={row.cumBand} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="ev-daily-footer__links">
        <Link href={diaryHref} className="ev-daily-footer__diary-link">
          Günlük Kayıt →
        </Link>
        <Link href={weeklyHref} className="ev-daily-footer__weekly-link">
          Haftalık QURR →
        </Link>
      </div>
    </div>
  );
}

interface LoadedProps extends ReportScreenProps {
  report: EvDailyReport;
  date: string;
  onDateChange: (date: string) => void;
  refetch: () => void;
  isRefetching: boolean;
}

function LoadedDailyReport({
  siteId,
  siteName,
  companyName,
  projectName,
  siteCompleted,
  links,
  report,
  date,
  onDateChange,
  refetch,
  isRefetching,
}: LoadedProps) {
  const permission = useModulePermission("earned_value");
  const approve = useApproveDailyReport(siteId);
  const scope = useDisciplineScope();
  const eyebrow = reportEyebrow(companyName, projectName, siteName);
  const [view, setView] = useState<ViewMode>("screen");
  const [modalOpen, setModalOpen] = useState(false);
  const [showArchiveDetail, setShowArchiveDetail] = useState(report.status !== "approved");

  const gate = approveGate({
    level: permission.level,
    siteCompleted,
    status: report.status,
    draftDiaryDates: report.draft_diary_dates,
  });

  if (report.status === "not_generated") {
    return (
      <div className="ev-daily-report">
        <h1 className="ev-daily-page-title">Günlük İlerleme Raporu</h1>
        <Toolbar
          report={report}
          date={date}
          onDateChange={onDateChange}
          view={view}
          setView={setView}
          gate={gate}
          onOpenModal={() => setModalOpen(true)}
          onRefresh={refetch}
          isRefreshing={isRefetching}
        />
        <div className="ev-daily-empty" role="status">
          <MissingReportIcon />
          <div className="ev-daily-empty__title">{formatDateDots(report.report_date)} günlüğü yok — rapor üretilemedi</div>
          <p className="ev-daily-empty__text">
            Mühendis miktarları girip saatleri dağıttıktan sonra &quot;Gönder&quot; dediğinde rapor kendiliğinden
            üretilir.
          </p>
          <Link href={links.diary(report.report_date)} className="ev-daily-empty__link">
            Günlük Kayıt&apos;a git
          </Link>
        </div>
      </div>
    );
  }

  // S30 — geçmiş onaylı gün: özet kart + "Raporu göster".
  if (report.status === "approved" && !showArchiveDetail) {
    const overall = report.kpis.find((k) => k.kind === "overall") ?? null;
    return (
      <div className="ev-daily-report">
        <h1 className="ev-daily-page-title">Günlük İlerleme Raporu</h1>
        <Toolbar
          report={report}
          date={date}
          onDateChange={onDateChange}
          view={view}
          setView={setView}
          gate={gate}
          onOpenModal={() => setModalOpen(true)}
          onRefresh={refetch}
          isRefreshing={isRefetching}
        />
        <div className="ev-daily-archive-summary">
          <div className="ev-daily-archive-summary__title">
            <span>{formatDateDots(report.report_date)} raporu · arşiv</span>
            <span className="ev-daily-archive-summary__sub">
              Onaylandı — {report.approved_by?.full_name ?? EMPTY_CELL}
              {report.approved_at !== null && `, ${formatDateTimeDots(report.approved_at)}`} ·{" "}
              {reportNoLabel(report.report_no)} · salt okunur
            </span>
          </div>
          {/* Kısıtlı onaylı snapshot'ta overall satırı yoktur (DSC-B3 S6): metrikler "—". */}
          <div className="ev-daily-archive-summary__metrics">
            <span>
              Küm. planlı <b>{pct1(overall?.planned_pct_cum ?? null)}</b>
            </span>
            <span>
              Küm. gerçek <b>{pct1(overall?.progress_pct_cum ?? null)}</b>
            </span>
            <span>
              Sapma <b>{overall?.variance === undefined || overall.variance === null ? EMPTY_CELL : formatVariancePoints(overall.variance)}</b>
            </span>
          </div>
          <Button variant="secondary" onClick={() => setShowArchiveDetail(true)}>
            Raporu göster
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="ev-daily-report">
      <h1 className="ev-daily-page-title">Günlük İlerleme Raporu</h1>
      <Toolbar
        report={report}
        date={date}
        onDateChange={onDateChange}
        view={view}
        setView={setView}
        gate={gate}
        onOpenModal={() => setModalOpen(true)}
        onRefresh={refetch}
        isRefreshing={isRefetching}
      />
      {report.status === "approved" && (
        <ReadOnlyStrip lead="Onaylandı." action={{ label: "Özete dön", onClick: () => setShowArchiveDetail(false) }}>
          Bu rapor kilitlidir, salt okunur.
        </ReadOnlyStrip>
      )}
      <MissingDiaryBand report={report} diaryHref={links.diary(report.report_date)} />

      {view === "print" ? (
        <DailyPrintView report={report} eyebrow={eyebrow} />
      ) : (
        <div className="ev-daily-report__sheet">
          <header className="ev-daily-head">
            <div className="ev-daily-head__title">
              <span className="ev-daily-head__eyebrow">{eyebrow}</span>
              <span className="ev-daily-head__name">Günlük İlerleme Raporu</span>
              <div className="ev-daily-head__meta">
                <span>
                  Rapor tarihi <b>{formatDateDots(report.report_date)}</b> {weekdayOf(report.report_date)}
                </span>
                <span>
                  Proje günü <b>{report.day_no ?? EMPTY_CELL}</b>
                </span>
                <span>
                  Hafta <b>{report.week_no ?? EMPTY_CELL}</b>
                  {report.week_start !== null && report.week_end !== null && ` · ${formatWeekRangeDots(report.week_start, report.week_end)}`}
                </span>
                <span>
                  Baseline <b>{report.revision?.name ?? EMPTY_CELL}</b>
                </span>
              </div>
            </div>
            <WeatherStrip days={report.weather} reportDate={report.report_date} />
          </header>

          <section aria-label="Disiplin KPI">
            <h2 className="ev-daily-section-title">1 · Disiplin KPI</h2>
            <KpiTable report={report} />
          </section>

          {!isTrendHidden(report, scope.isRestricted) && (
            <section aria-label="7 günlük trend">
              <h2 className="ev-daily-section-title">{trendTitle(scope.isRestricted)}</h2>
              <TrendSection report={report} />
            </section>
          )}

          <section aria-label="Miktar tablosu">
            <h2 className="ev-daily-section-title">3 · Miktar tablosu</h2>
            <QuantitySection report={report} />
          </section>

          <FooterSection
            report={report}
            diaryHref={links.diary(report.report_date)}
            weeklyHref={links.weeklyReport(report.week_no ?? undefined)}
          />
        </div>
      )}

      {modalOpen && (
        <DailyApproveModal
          reportDate={report.report_date}
          missingDiaryDates={report.missing_diary_dates}
          undistributedDay={report.footer?.undistributed_day ?? null}
          approve={approve}
          onClose={() => setModalOpen(false)}
          onApproved={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}

interface ToolbarProps {
  report: EvDailyReport;
  date: string;
  onDateChange: (date: string) => void;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  gate: ReturnType<typeof approveGate>;
  onOpenModal: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

/** GİR:99 "↻ Yenile" — ↻ glif alt küme dışı (F3-SÖZLEŞME §3.6) → inline SVG. */
function RefreshGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="ev-daily-toolbar__refresh-icon">
      <path d="M2.5 8a5.5 5.5 0 0 1 9.62-3.64M13.5 8a5.5 5.5 0 0 1-9.62 3.64" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12.5 2.8v2.3h-2.3M3.5 13.2v-2.3h2.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** GİR:121 — S11 "günlüğü yok" kutusundaki uyarı ikonu (28×28, mockup ölçü/renk BİREBİR). */
function MissingReportIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 17 17" fill="none" aria-hidden="true" className="ev-daily-empty__icon">
      <circle cx="8.5" cy="8.5" r="7.5" stroke="var(--color-warning-strong)" strokeWidth="1.4" />
      <path d="M8.5 5v4.5M8.5 11v.4" stroke="var(--color-warning-strong)" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** GİR:103 "🔒 Onayla ve kilitle" — kilit glifi alt küme dışı → inline SVG (mockup ölçü BİREBİR). */
function LockGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="ev-daily-toolbar__lock-icon">
      <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function Toolbar({ report, date, onDateChange, view, setView, gate, onOpenModal, onRefresh, isRefreshing }: ToolbarProps) {
  const badge = statusBadge(report);
  // GİR:99 `disabled="{{ approved }}"` — onaylı rapor yeniden üretilmez.
  const refreshDisabled = report.status === "approved" || isRefreshing;
  const isPrintView = view === "print";
  // QURR emsali (`WeeklyQurrScreen` `pendingPrint`): "Yazdır / PDF" önce yazdırma
  // görünümünü açar, `window.print()` DOM güncellendikten SONRA çağrılır — yoksa
  // ekran kromu (araç çubuğu, başlık) basılırdı.
  const [pendingPrint, setPendingPrint] = useState(false);
  useEffect(() => {
    if (pendingPrint && isPrintView) {
      setPendingPrint(false);
      window.print();
    }
  }, [pendingPrint, isPrintView]);
  return (
    <div className="ev-daily-toolbar">
      <ReportDateNav mode="day" day={date} dayNo={report.day_no} weekNo={report.week_no} onChange={onDateChange} />
      <span className={`ev-daily-toolbar__badge ev-daily-toolbar__badge--${badge.tone}`}>{badge.text}</span>
      <div className="ev-daily-toolbar__actions">
        <Button variant="secondary" disabled={refreshDisabled} aria-busy={isRefreshing || undefined} onClick={onRefresh}>
          <RefreshGlyph /> Yenile
        </Button>
        {/* GİR:100 — TEK toggle düğmesi ("Yazdırma önizlemesi" ⇄ "Ekran görünümü"), segment kontrolü DEĞİL. */}
        <Button
          variant={isPrintView ? "primary" : "secondary"}
          aria-pressed={isPrintView}
          onClick={() => setView(isPrintView ? "screen" : "print")}
        >
          {isPrintView ? "Ekran görünümü" : "Yazdırma önizlemesi"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setView("print");
            setPendingPrint(true);
          }}
        >
          Yazdır / PDF
        </Button>
        {gate.visible && (
          <Button disabled={gate.disabled} title={gate.reason ?? undefined} onClick={onOpenModal}>
            <LockGlyph />
            Onayla ve kilitle
          </Button>
        )}
      </div>
      {gate.disabled && gate.reason !== null && (
        <div className="ev-daily-toolbar__gate-reason" role="note">
          {gate.reason}
        </div>
      )}
    </div>
  );
}

/**
 * PLN-F3.4 · Günlük İlerleme Raporu (GİR) ekranı — F3-SÖZLEŞME §2
 * `ReportScreenProps`. `?tarih=` URL durumunu KENDİSİ okur/yazar (S15).
 */
export function DailyReportScreen(props: ReportScreenProps) {
  const { date, setDate } = useDailyReportUrlState();
  const { data: report, isLoading, isError, error, refetch, isRefetching } = useDailyReport(props.siteId, date);

  if (props.siteId === "") {
    return (
      <div className="ev-daily-report">
        {props.picker}
        <Skeleton label="Şantiye seçiliyor">
          <SkeletonRows columns="2fr 1fr 1fr 1fr" count={4} />
        </Skeleton>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="ev-daily-report">
        {props.picker}
        <Skeleton label="Rapor yükleniyor">
          <SkeletonRows columns="2fr 1fr 1fr 1fr 1fr 1fr" count={6} />
        </Skeleton>
      </div>
    );
  }

  if (isError || report === undefined) {
    return (
      <div className="ev-daily-report">
        {props.picker}
        <ErrorCard
          title="Rapor alınamadı"
          description={backendErrorMessage(error, "Günlük İlerleme Raporu yüklenemedi.")}
          onRetry={() => void refetch()}
          retrying={isRefetching}
        />
      </div>
    );
  }

  return (
    <>
      {props.picker}
      <LoadedDailyReport
        {...props}
        report={report}
        date={date}
        onDateChange={setDate}
        refetch={() => void refetch()}
        isRefetching={isRefetching}
      />
    </>
  );
}
