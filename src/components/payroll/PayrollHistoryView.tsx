"use client";

import Link from "next/link";
import { useState } from "react";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Alert, Badge, Button } from "@/components/ui";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { Select } from "@/components/ui/select";
import { backendErrorMessage } from "@/lib/api/error-message";
import { downloadPayrollPeriodsExport } from "@/lib/api/payroll-client";
import { useCompany } from "@/lib/api/hooks/useCompany";
import type { PayrollPeriodListRow } from "@/lib/api/hooks/usePayroll";
import { usePayrollPeriods } from "@/lib/api/hooks/usePayroll";
import { isForbidden } from "@/lib/api/unwrap";
import { PAYROLL_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { PAYROLL_VIEW_PAGES } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { formatAmount, formatDateDots, formatPeriod } from "@/lib/format";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";

import type { HistoryTotals } from "./payroll-history-derive";
import {
  availableYears,
  defaultYear,
  historyTotals,
  isPaymentPending,
  paymentDateOf,
  rowsForYear,
} from "./payroll-history-derive";
import {
  DETAIL_LINK_LABEL,
  EMPTY_VALUE,
  HCOL_COST,
  HCOL_DETAIL,
  HCOL_GROSS,
  HCOL_NET,
  HCOL_PAYMENT_DATE,
  HCOL_PERIOD,
  HCOL_PERSONNEL,
  HCOL_SGK_EMPLOYER,
  HCOL_STATUS,
  HISTORY_EMPTY_BODY,
  HISTORY_EMPTY_TITLE,
  HISTORY_EMPTY_YEAR_TITLE,
  HISTORY_ERROR_FALLBACK,
  HISTORY_EXPORT_ERROR_FALLBACK,
  HISTORY_EXPORT_LABEL,
  HISTORY_EXPORT_SCOPE_NOTE,
  HISTORY_LOADING_MESSAGE,
  HISTORY_PAGE_TITLE,
  HISTORY_UNPARSED_TITLE,
  MONTHLY_ROUTE,
  PAYMENT_PENDING_NOTE,
  YEAR_FILTER_LABEL,
  historyEmptyYearBody,
  historyTotalLabel,
  historyUnparsedBody,
  personnelAverageLabel,
} from "./payroll-history-labels";
import { PERIOD_STATUS_LABELS, PERIOD_STATUS_VARIANTS } from "./payroll-labels";
import { PayrollTabsStrip } from "./PayrollTabsStrip";
import "./payroll-history.css";

/**
 * F-BOR T3 · `/bordro/gecmis` — Bordro Geçmişi. Kanon `Bordro Geçmişi.dc.html`
 * ("BG"); yorumlardaki sayılar O dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın üst barı (BG:14-24) ve sol menüsü uygulama kabuğunun (F3)
 * yüzeyidir, burada YENİDEN ÇİZİLMEZ — tek istisnası BG:22 "Excel İndir"
 * düğmesidir: o bu EKRANIN eylemidir ve K11 gereği silinmez, devre dışı basılır.
 *
 * 🔴 K6 — yıl süzgeci İSTEMCİDE çalışır: `GET /payroll/periods` `year`
 * parametresi ALMAZ. Cömert `limit` ile çekilir (`PAYROLL_PERIODS_LIMIT`),
 * süzme burada yapılır ve kırpılma `buildListTruncation` ile GÖRÜNÜR kılınır —
 * kullanıcı eksik listeyi tam sanmamalıdır.
 *
 * 🔴 Seçim URL'de TAŞINMAZ (bileşen state'i) ⇒ `useSearchParams` yoktur ve
 * `Suspense` sarmalayıcısı gerekmez (mali tablolar kanonu).
 */
export function PayrollHistoryView() {
  // IZN-F5-ön · görüntüleme kapısı = bordro sayfaları Görür (VEYA); grant yoksa modül izni.
  const canViewPayroll = useButtonGate({ pages: PAYROLL_VIEW_PAGES, need: "view" });
  const periodsQuery = usePayrollPeriods();
  const companyQuery = useCompany();

  // `null` = kullanıcı henüz seçim yapmadı ⇒ varsayılan (en yeni yıl).
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if (!canViewPayroll || isForbidden(periodsQuery.error)) {
    return <AccessDenied />;
  }

  const rows: readonly PayrollPeriodListRow[] = periodsQuery.data?.items ?? [];
  const years = availableYears(rows);
  const activeYear = selectedYear ?? defaultYear(rows);
  const yearRows = rowsForYear(rows, activeYear);
  const totals = historyTotals(yearRows);
  const truncation = buildListTruncation(rows.length, periodsQuery.data?.total);

  const periodsError = periodsQuery.isError
    ? backendErrorMessage(periodsQuery.error, HISTORY_ERROR_FALLBACK)
    : undefined;

  const hasNoPeriods = periodsQuery.data !== undefined && rows.length === 0;

  /**
   * 🔴 EXPORT-XLSX · `GET /payroll/periods/export.xlsx` — SÜZGEÇ ALMAZ ve bu
   * bir tercih DEĞİL ölçümdür: liste ucu (`GET /payroll/periods`) de `year`
   * parametresi almaz, yıl seçici K6 gereği İSTEMCİDE süzer. Uydurma bir
   * `year` göndermek 422 verirdi.
   *
   * Sonuç: dosya, ekranda görünen yıldan GENİŞtir (tüm dönemler). Bu SESSİZ
   * KALMAZ — düğmenin altında görünür bir cümle kapsamı söyler.
   */
  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      await downloadPayrollPeriodsExport();
    } catch (error) {
      setExportError(backendErrorMessage(error, HISTORY_EXPORT_ERROR_FALLBACK));
    } finally {
      setIsExporting(false);
    }
  }

  /**
   * 🔴 Şirket adı (BG:33 alt başlığı) AYRI bir veri kaynağıdır ve bu ekranın
   * ana işi DEĞİLDİR: yüklenemezse alt başlık yalnız yılı yazar (zarif düşüş),
   * ekran hataya DÜŞMEZ. Yine de nöbetçi bu kaynağın da OTURMASINI bekler.
   */
  const companySettled = companyQuery.data !== undefined || companyQuery.isError;
  const companyName = companyQuery.data?.name ?? undefined;

  // 🔴 Nöbetçi TÜM bağımsız veri kaynakları çözüldüğünde basılır (dönem listesi
  // + şirket). Erken basılırsa görsel spec "Yükleniyor…" karesini baseline'a
  // gömerdi.
  const isLoaded = (periodsQuery.data !== undefined || periodsQuery.isError) && companySettled;

  const subtitle =
    activeYear === undefined
      ? companyName
      : companyName === undefined
        ? String(activeYear)
        : `${companyName} · ${activeYear}`;

  return (
    <div className="borg">
      {/* BG:27-31 — üç ekranın ORTAK şeridi. */}
      <PayrollTabsStrip />

      <div className="borg__head">
        <div>
          {/* BG:33 */}
          <h1 className="borg__title">{HISTORY_PAGE_TITLE}</h1>
          {subtitle !== undefined && (
            <p className="borg__subtitle" data-testid="bordro-gecmis-subtitle">
              {subtitle}
            </p>
          )}
        </div>

        <div className="borg__filter">
          {/* 🔴 BG:22 — EXPORT-XLSX ile GERÇEK: `GET /payroll/periods/export.xlsx`.
              Kapsam notu düğmenin ALTINDA durur (`title`da SAKLANMAZ). */}
          <div>
            <Button
              variant="secondary"
              data-testid="bordro-gecmis-export"
              disabled={isExporting}
              onClick={handleExport}
            >
              {HISTORY_EXPORT_LABEL}
            </Button>
            <p className="borg__export-reason" data-testid="bordro-gecmis-export-reason">
              {HISTORY_EXPORT_SCOPE_NOTE}
            </p>
            {exportError !== null && (
              <p className="borg__export-reason" data-testid="bordro-gecmis-export-error">
                {exportError}
              </p>
            )}
          </div>

          {/* BG:34 — seçenekler GELEN VERİDEN türer; mockup'ın 2026/2025
              sabitleri kopyalanmaz. Etiket görsel olarak yoktur, erişilebilir
              ad `aria-label` ile verilir (ham `<label>` yazılmaz). */}
          {years.length > 0 && (
            <Select
              aria-label={YEAR_FILTER_LABEL}
              value={activeYear === undefined ? "" : String(activeYear)}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              data-testid="bordro-gecmis-year"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {truncation.isTruncated && (
        <p className="borg-notice" data-testid="bordro-gecmis-truncation">
          {listTruncationMessage(truncation)}
        </p>
      )}

      {periodsError !== undefined && (
        <p className="borg-notice borg-notice--danger" data-testid="bordro-gecmis-error">
          {periodsError}
        </p>
      )}

      {periodsError === undefined && periodsQuery.data === undefined && (
        <p className="borg-notice" data-testid="bordro-gecmis-loading">
          {HISTORY_LOADING_MESSAGE}
        </p>
      )}

      {/* 🔴 K3 — hiç dönem yoksa açıklayıcı boş durum; "dönem aç" DÜĞMESİ YOK. */}
      {hasNoPeriods && (
        <Alert variant="info" title={HISTORY_EMPTY_TITLE} data-testid="bordro-gecmis-empty">
          {HISTORY_EMPTY_BODY}
        </Alert>
      )}

      {/* Dönem VAR ama seçili yılda yok. */}
      {!hasNoPeriods && activeYear !== undefined && yearRows.length === 0 && (
        <Alert
          variant="info"
          title={HISTORY_EMPTY_YEAR_TITLE}
          data-testid="bordro-gecmis-empty-year"
        >
          {historyEmptyYearBody(activeYear)}
        </Alert>
      )}

      {totals.unparsedCount > 0 && (
        <Alert
          variant="warning"
          title={HISTORY_UNPARSED_TITLE}
          data-testid="bordro-gecmis-unparsed-band"
        >
          {historyUnparsedBody(totals.unparsedCount)}
        </Alert>
      )}

      {activeYear !== undefined && yearRows.length > 0 && (
        <HistoryTable year={activeYear} rows={yearRows} totals={totals} />
      )}

      {isLoaded && <span hidden data-testid="bordro-gecmis-loaded" />}
    </div>
  );
}

interface HistoryTableProps {
  year: number;
  rows: readonly PayrollPeriodListRow[];
  totals: HistoryTotals;
}

/** BG:36-118 — dönem tablosu. `year` yalnız tfoot etiketinde kullanılır. */
function HistoryTable({ year, rows, totals }: HistoryTableProps) {
  // 🔴 IZN-F4c.2 — maskeli (`null`) sütunun başlığında TEK kilit; hücrelerde "—".
  const isHidden = useCategoryHidden(PAYROLL_HIDDEN_CATEGORIES);
  return (
    <div className="borg-card">
      <table className="borg-table" data-testid="bordro-gecmis-table">
        <thead className="borg-table__head">
          <tr>
            <th className="borg-th borg-th--lead">{HCOL_PERIOD}</th>
            <th className="borg-th">{HCOL_PERSONNEL}</th>
            <th className="borg-th borg-th--num">
              {HCOL_GROSS}
              <MaskedMark isHidden={isHidden} values={rows.map((row) => row.gross_total)} />
            </th>
            <th className="borg-th borg-th--num">
              {HCOL_SGK_EMPLOYER}
              <MaskedMark isHidden={isHidden} values={rows.map((row) => row.sgk_employer_total)} />
            </th>
            <th className="borg-th borg-th--num">
              {HCOL_NET}
              <MaskedMark isHidden={isHidden} values={rows.map((row) => row.net_total)} />
            </th>
            <th className="borg-th borg-th--num">
              {HCOL_COST}
              <MaskedMark isHidden={isHidden} values={rows.map((row) => row.total_cost)} />
            </th>
            <th className="borg-th">{HCOL_PAYMENT_DATE}</th>
            <th className="borg-th">{HCOL_STATUS}</th>
            {/* BG:47 başlığı boştur; erişilebilir ad yine de basılır. */}
            <th className="borg-th">
              <span className="sr-only">{HCOL_DETAIL}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <HistoryRow key={row.id} row={row} />
          ))}
        </tbody>
        {/* BG:106-116 — 🔴 K4: ay sayısı da toplamlar da SATIRLARDAN türer. */}
        <tfoot>
          <tr className="borg-total" data-testid="bordro-gecmis-total">
            <td className="borg-total__label" data-testid="bordro-gecmis-total-label">
              {historyTotalLabel(year, totals.periodCount)}
            </td>
            <td className="borg-total__avg" data-testid="bordro-gecmis-total-avg">
              {personnelAverageLabel(totals.personnelAverage)}
            </td>
            <td className="borg-total__value" data-testid="bordro-gecmis-total-gross">
              {formatAmount(totals.grossTotal)}
            </td>
            <td
              className="borg-total__value borg-total__value--sgk"
              data-testid="bordro-gecmis-total-sgk"
            >
              {formatAmount(totals.sgkEmployerTotal)}
            </td>
            <td className="borg-total__value" data-testid="bordro-gecmis-total-net">
              {formatAmount(totals.netTotal)}
            </td>
            <td
              className="borg-total__value borg-total__value--cost"
              data-testid="bordro-gecmis-total-cost"
            >
              {formatAmount(totals.costTotal)}
            </td>
            {/* BG:114 — son üç sütun tfoot'ta birleştirilir. */}
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** BG:50-104 — tek dönem satırı. */
function HistoryRow({ row }: { row: PayrollPeriodListRow }) {
  const isPending = isPaymentPending(row);
  const paymentDate = paymentDateOf(row);

  return (
    <tr
      className={`borg-row${isPending ? " borg-row--pending" : ""}`}
      data-testid={`bordro-gecmis-row-${row.id}`}
    >
      <td className="borg-cell borg-cell--period">
        <div className="borg-period__name">{formatPeriod(row.year, row.month)}</div>
        {/* BG:51 — koşul satırdan türer, ilk satıra sabitlenmez. */}
        {isPending && <div className="borg-period__note">{PAYMENT_PENDING_NOTE}</div>}
      </td>
      <td className="borg-cell borg-cell--count">{row.personnel_count}</td>
      <td className="borg-cell borg-cell--num">{formatAmount(row.gross_total)}</td>
      <td className="borg-cell borg-cell--num borg-cell--sgk">
        {formatAmount(row.sgk_employer_total)}
      </td>
      <td className="borg-cell borg-cell--num borg-cell--net">{formatAmount(row.net_total)}</td>
      <td className="borg-cell borg-cell--num borg-cell--cost">{formatAmount(row.total_cost)}</td>
      <td
        className={`borg-cell borg-cell--date${isPending ? " borg-cell--date-due" : ""}`}
        data-testid={`bordro-gecmis-date-${row.id}`}
      >
        {paymentDate === undefined ? EMPTY_VALUE : formatDateDots(paymentDate)}
      </td>
      <td className="borg-cell">
        {/* 🔴 K3 — DÖRT `PayrollPeriodStatus` değerinin HEPSİ etiketli
            (mockup yalnız "Bekliyor"/"Ödendi" çizer). */}
        <Badge
          variant={PERIOD_STATUS_VARIANTS[row.status]}
          data-testid={`bordro-gecmis-status-${row.id}`}
        >
          {PERIOD_STATUS_LABELS[row.status]}
        </Badge>
      </td>
      <td className="borg-cell">
        {/* BG:59 — Aylık Bordro ekranı. O ekran dönem seçimini URL'de
            TAŞIMAZ (T2 kararı), bu yüzden bağlantı kök rotaya gider. */}
        <Link className="borg-detail-link" href={MONTHLY_ROUTE}>
          {DETAIL_LINK_LABEL}
        </Link>
      </td>
    </tr>
  );
}
