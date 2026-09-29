"use client";

import { PrintSheet } from "@/components/earned-value/reports/kit/PrintSheet";
import { paginateByGroup } from "@/components/earned-value/reports/kit/paginate";
import { WeatherStrip } from "@/components/earned-value/reports/kit/WeatherStrip";
import { StatusMark } from "@/components/earned-value/reports/kit/StatusMark";
import { PfBandCell } from "@/components/earned-value/reports/kit/PfBandCell";
import { formatDateDots, formatDateTimeDots, formatQuantity, EMPTY_CELL } from "@/lib/format";
import { compareDecimalStrings, formatPercent01, formatPf, formatVariancePoints } from "@/lib/earned-value";
import type { EvDailyReport, EvQtyTreeRow } from "@/lib/api/models";

import { contractorChip, isHeaderRow, pct, qty, rate, wholeHours } from "./daily-columns";
import { formatDayMonthDots, isTrendHidden, joinWithVe, kpiRowLabel, reconciliationText, reportNoLabel } from "./daily-logic";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { pfOutOfBandRows } from "./pf-out-of-band";
import { buildTrendChart } from "./trend-chart";

import "./daily-print.css";

/**
 * GİR:301 satır kapasitesi — bir A4 yatay sayfaya sığan miktar satırı.
 *
 * 🔴 ÖLÇÜLDÜ (F3.6b lider denetimi, statik hesap — sunucu yeniden kurulunca
 * Playwright'ta DOĞRULANACAK): sayfa içeriği 794px − 26px üst dolgu − ~40px
 * altlık payı ≈ 728px. Başlık (`h2`, ~24px) + `.ev-print-qty__head-row`
 * (~5px×2 dolgu + 8.5px yazı + `line-height:1.2` ≈ 22px) + son sayfada
 * `PrintReconciliation` (değişken, en kötü ihtimalle ~140px PF bant dışı
 * tablosuyla) düşülünce veri satırına (~4px×2 dolgu + 10px yazı + 1px kenarlık
 * ≈ 19px) kalan ≈ (728 − 24 − 22) / 19 ≈ 35 satır normal sayfada, SON sayfada
 * (~140px mutabakat payı) ≈ (728 − 24 − 22 − 140) / 19 ≈ 28. `paginateByGroup`
 * TEK kapasiteyle çalışır (mutabakatın hangi sayfaya düşeceği veriye bağlı) —
 * güvenli ORTAK payda son-sayfa senaryosuna göre 14'TEN 28'E ÇIKARILDI (önceki
 * 14, header satırı eklenmeden ÖNCE kaba bir tahmindi ve mockup'ın 8 satırlık
 * `hint-placeholder-count`ından çok UZAKTI — gerçek fikstür 5 satır taşıdığı
 * için ikisi de tek sayfada YAZARDI, kapasite farkı BUGÜNE dek hiç KIRMIZI
 * vermedi). 28, 12 kolonlu satırların TEK SATIRDA kaldığı varsayımıyla
 * (kısa sayısal değerler, ~87px kolon genişliği) geçerlidir.
 */
const QUANTITY_ROWS_PER_PAGE = 28;

export interface DailyPrintViewProps {
  report: EvDailyReport;
  /** GİR:148 "firma · proje · şantiye" (`reportEyebrow`, DailyReportScreen'de kurulur). */
  eyebrow: string;
}

function pageFooter(report: EvDailyReport, eyebrow: string) {
  return (
    <>
      <span>{eyebrow} · Günlük İlerleme Raporu {formatDateDots(report.report_date)}</span>
      <span>{reportNoLabel(report.report_no)}</span>
      <span>Üretim {formatDateTimeDots(report.generated_at)}</span>
    </>
  );
}

/** Sayfa 3 (GİR:371-379) — mutabakat özeti + PF bant dışı kalemler, yalnız SON sayfada. */
function PrintReconciliation({ report }: { report: EvDailyReport }) {
  const { isRestricted } = useDisciplineScope();
  const footer = report.footer;
  const outOfBand = pfOutOfBandRows(report.warnings, report.quantities);
  // F3.6b lider denetimi (5. tur) — "ekran ≡ baskı": GİR:112 tarih biçimi
  // "gg.aa" + "ve" bağlacı (item 15), virgül+yıl DEĞİL (ekranla AYNI `joinWithVe`).
  const draftDates = joinWithVe(report.draft_diary_dates.map((d) => formatDayMonthDots(d)));
  return (
    <div className="ev-print-reconciliation">
      {footer !== null && (
        <div className="ev-print-reconciliation__ok">
          {reconciliationText(footer, isRestricted)}
        </div>
      )}
      {(footer !== null && compareDecimalStrings(footer.undistributed_day, "0") > 0) ||
      draftDates !== "" ||
      report.unrated_entries.length > 0 ? (
        <div className="ev-print-reconciliation__warn">
          {footer !== null &&
            compareDecimalStrings(footer.undistributed_day, "0") > 0 &&
            `${formatQuantity(footer.undistributed_day)} a-s dağıtılmamış`}
          {draftDates !== "" && ` · ${draftDates} günlükleri gönderilmedi`}
          {/* CEO ölçümü (7. tur, madde G3, "ekran ≡ baskı") — `section_name` (BÖLÜM
              adı, mockup "Buat/priz · Çatı") ekranla AYNI basılır, yoksa yalnız kalem adı. */}
          {report.unrated_entries
            .map(
              (w) =>
                ` · ${w.item_name ?? w.message}${w.section_name !== null && w.section_name !== undefined ? ` · ${w.section_name}` : ""} oransız`,
            )
            .join("")}
        </div>
      ) : null}
      {outOfBand.length > 0 && (
        <div className="ev-print-reconciliation__pf">
          {/* F3.6b lider denetimi (5. tur) — "ekran ≡ baskı": madde 19, eşik `pf_bands.daily.red_below`dan DİNAMİK. */}
          <div className="ev-print-reconciliation__pf-title">
            PF bant dışı kalemler (&lt;{" "}
            {report.pf_bands === null || report.pf_bands === undefined ? EMPTY_CELL : formatPf(report.pf_bands.daily.red_below)})
          </div>
          <table>
            <thead>
              <tr>
                <th>Kalem</th>
                <th>Disiplin</th>
                <th>Gün PF</th>
                <th>Küm PF</th>
              </tr>
            </thead>
            <tbody>
              {outOfBand.map((row) => (
                <tr key={row.key}>
                  <td>{row.itemName}</td>
                  <td>{row.disciplineName ?? EMPTY_CELL}</td>
                  <td>{row.dayValue === null ? EMPTY_CELL : formatPf(row.dayValue)}</td>
                  <td>{row.cumValue === null ? EMPTY_CELL : formatPf(row.cumValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * GİR:352-386 miktar tablosu satırı — mockup'ın TAM 12 kolonuyla BİREBİR
 * (F3.6b lider denetimi: önceki 7 kolonluk "sade" hâl SAPMAYDI). Biçimleyiciler
 * `daily-columns.tsx`ten (ekran ≡ baskı — `QUANTITY_COLUMNS`in kullandığı AYNI
 * `rate`/`qty`/`pct`/`contractorChip`/`isHeaderRow`, ikinci bir kopya YOK).
 * Başlık satırı (`isHeaderRow`) GİR:357 deseni: ad + çip + "gün PF … · harc. …";
 * mockup'ın L2 alt grup için hardcode'ladığı "alt grup" metni BURADA YOK —
 * ekranla AYNI kural (`contractorChip`: yalnız own/subcon, karışıkta/gruplarda
 * çip YOK, S18).
 */
/** Ekranla AYNI seviye içerlekleri (`tree-table.css` `--tree-indent`: L1 12px, L2 26px). */
function headIndent(level: number): number {
  return level === 1 ? 12 : 26;
}

function PrintQuantityRow({ row }: { row: EvQtyTreeRow }) {
  if (isHeaderRow(row)) {
    const chip = contractorChip(row.contractor_type);
    return (
      <div className="ev-print-qty__head" style={{ paddingLeft: headIndent(row.level) }}>
        <span>{row.name}</span>
        {chip !== null && <span className="ev-print-qty__head-chip">{chip}</span>}
        <span className="ev-print-qty__head-meta">
          gün PF {row.pf_day === null ? EMPTY_CELL : formatPf(row.pf_day)} · harc. {wholeHours(row.spent_day)}
        </span>
      </div>
    );
  }
  return (
    <div className="ev-print-qty__row">
      <span>{row.name}</span>
      <span>{row.uom}</span>
      <span>{rate(row.planned_unit_mhr)}</span>
      <span>{rate(row.actual_unit_mhr_day)}</span>
      <span>{rate(row.actual_unit_mhr_cum)}</span>
      <span>{qty(row.planned_qty)}</span>
      <span className="ev-print-qty__strong">{qty(row.qty_day)}</span>
      <span>{qty(row.qty_cum)}</span>
      <span>{qty(row.remaining_qty)}</span>
      <PfBandCell as="span" value={row.pf_day === null ? null : formatPf(row.pf_day)} band={row.pf_day_band ?? "none"} />
      <span>{wholeHours(row.spent_day)}</span>
      <span className="ev-print-qty__progress">
        <span className="ev-print-qty__progress-track">
          <span
            className="ev-print-qty__progress-bar"
            style={{ width: `${row.progress_pct_cum === null ? 0 : Math.min(100, Number(row.progress_pct_cum) * 100)}%` }}
          />
        </span>
        <span>{pct(row.progress_pct_cum)}</span>
      </span>
    </div>
  );
}

/** Sayfa 1 — "2 · 7 günlük trend" (GİR:331-347): tablo + mini çizgi grafiği (opsiyonel DEĞİL). */
function PrintTrendSection({ report }: { report: EvDailyReport }) {
  const { isRestricted } = useDisciplineScope();
  if (isTrendHidden(report, isRestricted)) return null;
  const chart = buildTrendChart(report.trend);
  return (
    <section aria-label="7 günlük trend">
      <h2 className="ev-print-section-title">2 · 7 günlük trend</h2>
      <div className="ev-print-trend">
        <div className="ev-print-trend__table">
          <div className="ev-print-trend__head">Gün</div>
          {report.trend.map((t) => (
            <div key={t.day} className="ev-print-trend__head ev-print-trend__head--day">
              {formatDateDots(t.day)}
            </div>
          ))}
          <div className="ev-print-trend__row-label">Planlı %</div>
          {report.trend.map((t) => (
            <div key={t.day} className="ev-print-trend__cell">
              {/* F3.6b lider denetimi (4. tur) — "ekran ≡ baskı": GİR:199 mockup `pct(P[i], 2)` 2 ondalık. */}
              {t.planned_pct_cum === null ? EMPTY_CELL : formatPercent01(t.planned_pct_cum, 2)}
            </div>
          ))}
          <div className="ev-print-trend__row-label ev-print-trend__row-label--border">Gerçek %</div>
          {report.trend.map((t) => (
            <div key={t.day} className="ev-print-trend__cell ev-print-trend__cell--border ev-print-trend__cell--strong">
              {t.progress_pct_cum === null ? EMPTY_CELL : formatPercent01(t.progress_pct_cum, 2)}
            </div>
          ))}
          <div className="ev-print-trend__row-label ev-print-trend__row-label--border">Fark</div>
          {report.trend.map((t) => (
            <div key={t.day} className="ev-print-trend__cell ev-print-trend__cell--border">
              {t.delta === null ? EMPTY_CELL : formatVariancePoints(t.delta, 2)}
            </div>
          ))}
        </div>
        <div className="ev-print-trend__chart">
          {chart !== null && (
            <svg viewBox="0 0 420 160" role="img" aria-label="7 günlük kümülatif ilerleme grafiği">
              <path d={chart.plannedPath} fill="none" className="ev-print-trend__line ev-print-trend__line--planned" />
              <path d={chart.actualPath} fill="none" className="ev-print-trend__line ev-print-trend__line--actual" />
            </svg>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * PLN-F3.4 · GİR yazdırma önizlemesi — GİR:299-386. Sayfa 1: başlık + hava +
 * Disiplin KPI + trend. Sonraki sayfalar: miktar tablosu, `paginateByGroup`
 * ile L1 (disiplin) sınırında kırılmış (`node_id` grup anahtarı — quantities
 * DFS ön-sıra, ilk satır her grubun L1 başlığıdır).
 */
export function DailyPrintView({ report, eyebrow }: DailyPrintViewProps) {
  const { isRestricted } = useDisciplineScope();
  // GİR: L1 disiplin kimliği grup anahtarıdır — L2/L3 satırlar aynı disiplinin
  // devamıdır. `quantities` DFS ön-sıra olduğundan bir L1'den SONRAKİ
  // (level>1) satırlar en son görülen L1'in grubuna girer.
  let groupOfLastL1 = "";
  const keyed = report.quantities.map((row) => {
    if (row.level === 1) groupOfLastL1 = row.node_id;
    return { row, group: groupOfLastL1 };
  });
  const qtyPages = paginateByGroup(keyed, QUANTITY_ROWS_PER_PAGE, (k) => k.group);

  const totalPages = 1 + qtyPages.length;

  return (
    <div className="ev-daily-print">
      <PrintSheet page={1} pageCount={totalPages} footer={pageFooter(report, eyebrow)}>
        <header className="ev-print-head">
          <div className="ev-print-head__title">
            <span className="ev-print-head__eyebrow">{eyebrow}</span>
            <span className="ev-print-head__name">Günlük İlerleme Raporu</span>
            <span className="ev-print-head__meta">
              {formatDateDots(report.report_date)} · Proje günü {report.day_no ?? EMPTY_CELL} · Hafta {report.week_no ?? EMPTY_CELL} · Baseline{" "}
              {report.revision?.name ?? EMPTY_CELL}
            </span>
          </div>
          <WeatherStrip days={report.weather} reportDate={report.report_date} />
        </header>

        <section aria-label="Disiplin KPI">
          <h2 className="ev-print-section-title">1 · Disiplin KPI</h2>
          <table className="ev-print-kpi">
            <thead>
              <tr>
                <th>Disiplin</th>
                <th>Gün plan %</th>
                <th>Gün gerç. %</th>
                <th>Gün PF</th>
                <th>Küm PF</th>
                <th>Sapma</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {report.kpis.map((row) => (
                <tr key={`${row.kind}:${row.node_id ?? ""}`} className={row.kind.startsWith("overall") ? "ev-print-kpi__overall" : ""}>
                  <td>{kpiRowLabel(row, isRestricted)}</td>
                  {/* F3.6b lider denetimi (4. tur) — "ekran ≡ baskı": GİR:169 mockup `dp: this.pct(a.dp, 2)`
                      GÜNLÜK % 2 ondalık basar (KÜM. % gibi 1 DEĞİL); ekrandaki `pct2` ile AYNI hassasiyet. */}
                  <td>{row.planned_pct_day === null ? EMPTY_CELL : formatPercent01(row.planned_pct_day, 2)}</td>
                  <td>{row.progress_pct_day === null ? EMPTY_CELL : formatPercent01(row.progress_pct_day, 2)}</td>
                  <td>
                    <PfBandCell as="span" value={row.pf_day === null ? null : formatPf(row.pf_day)} band={row.pf_day_band ?? "none"} />
                  </td>
                  <td>
                    <PfBandCell as="span" value={row.pf_cum === null ? null : formatPf(row.pf_cum)} band={row.pf_cum_band ?? "none"} />
                  </td>
                  <td>{row.variance === null ? EMPTY_CELL : formatVariancePoints(row.variance)}</td>
                  <td>
                    <StatusMark status={row.status ?? "none"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <PrintTrendSection report={report} />
      </PrintSheet>

      {qtyPages.map((page, index) => {
        const pageNo = index + 2;
        const isContinuation = page[0]?.continued === true;
        const isLast = index === qtyPages.length - 1;
        return (
          <PrintSheet key={pageNo} page={pageNo} pageCount={totalPages} footer={pageFooter(report, eyebrow)}>
            <h2 className="ev-print-section-title">3 · Miktar tablosu {isContinuation ? "(devam)" : ""}</h2>
            <div className="ev-print-qty">
              <div className="ev-print-qty__head-row">
                <span>İş tipi</span>
                <span>Birim</span>
                <span>Plan oran</span>
                <span>Gerç. gün</span>
                <span>Gerç. küm.</span>
                <span>Plan miktar</span>
                <span>Gün miktar</span>
                <span>Küm miktar</span>
                <span>Kalan</span>
                <span>Gün PF</span>
                <span>Gün harc.</span>
                <span>İlerleme</span>
              </div>
              {page.map((group, gi) => (
                <div key={gi}>
                  {group.rows.map((k) => (
                    <PrintQuantityRow key={k.row.node_id} row={k.row} />
                  ))}
                </div>
              ))}
            </div>
            {isLast && <PrintReconciliation report={report} />}
          </PrintSheet>
        );
      })}
    </div>
  );
}
