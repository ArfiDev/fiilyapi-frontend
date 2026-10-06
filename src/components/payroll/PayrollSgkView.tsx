"use client";

import { useState } from "react";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Alert, Badge, Button } from "@/components/ui";
import { MaskedMark } from "@/components/ui/hidden-mark/HiddenMark";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { PayrollPeriodListRow } from "@/lib/api/hooks/usePayroll";
import { usePayrollPeriods } from "@/lib/api/hooks/usePayroll";
import type { PayrollSgkSummaryResponse } from "@/lib/api/hooks/usePayrollSgk";
import { usePayrollSgkSummary, useSubmitPayrollSgk } from "@/lib/api/hooks/usePayrollSgk";
import { isForbidden } from "@/lib/api/unwrap";
import { PAYROLL_HIDDEN_CATEGORIES } from "@/lib/auth/finance-hidden";
import { useCategoryHidden } from "@/lib/auth/useCategoryHidden";
import { SGK_APPROVE, PAYROLL_VIEW_PAGES } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { formatCurrencyTight, formatDateLong, formatPeriod } from "@/lib/format";
import { buildListTruncation, listTruncationMessage } from "@/lib/list-truncation";

import { defaultPeriodId, periodNavigation } from "./payroll-derive";
import { submittedDate } from "./payroll-sgk-derive";
import {
  SGK_EMPTY_BODY,
  SGK_EMPTY_TITLE,
  SGK_ERROR_FALLBACK,
  SGK_KPI_BASE_LABEL,
  SGK_KPI_PERSONNEL_HINT,
  SGK_KPI_PERSONNEL_LABEL,
  SGK_KPI_PREMIUM_HINT,
  SGK_KPI_PREMIUM_LABEL,
  SGK_KPI_UNEMPLOYMENT_LABEL,
  SGK_LOADING_MESSAGE,
  SGK_NEXT_PERIOD_LABEL,
  SGK_NOT_SUBMITTED_BADGE,
  SGK_PAGE_TITLE,
  SGK_PERIODS_ERROR_FALLBACK,
  SGK_PERSONNEL_LIST_REASON,
  SGK_PERSONNEL_LIST_TITLE,
  SGK_PREV_PERIOD_LABEL,
  SGK_SUBMIT_ERROR_FALLBACK,
  SGK_SUBMIT_LABEL,
  SGK_SUBMIT_NOTE,
  SGK_SUBMIT_NO_WRITE_REASON,
  SGK_SUBMITTED_BADGE,
  SGK_SUBMITTED_NOTE,
  SGK_SUBMITTED_PREFIX,
  SGK_UNCOMPUTED_BAND_TITLE,
  SGK_UNKNOWN_RATE_BAND_TITLE,
  SGK_XML_DISABLED_REASON,
  SGK_XML_LABEL,
  SGK_DEADLINE_UNKNOWN,
  sgkNotSubmittedTitle,
  sgkSubmittedTitle,
  sgkSubtitle,
  sgkUncomputedBandBody,
  sgkUnknownRateBandBody,
} from "./payroll-sgk-labels";
import { PayrollSgkPremiumTable } from "./PayrollSgkPremiumTable";
import { PayrollTabsStrip } from "./PayrollTabsStrip";
import "./payroll-sgk.css";

/**
 * F-BOR T4 · `/bordro/sgk` — SGK Bildirimi. Kanon `SGK Bildirimi.dc.html`
 * ("SGK"); yorumlardaki sayılar O dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın üst barı (SGK:16-24) ve sol menüsü uygulama kabuğunun (F3)
 * yüzeyidir, burada YENİDEN ÇİZİLMEZ — tek istisnası SGK:22 "XML İndir"
 * düğmesidir: o bu EKRANIN eylemidir ve K11 gereği silinmez, devre dışı
 * basılır. SGK:23'teki ikinci "SGK'ya Gönder" ise durum bandındaki
 * düğmenin (SGK:50) kopyasıdır; TEK düğme basılır — iki ayrı yerden aynı
 * idempotent OLMAYAN ucu tetiklemek çift damga riskidir.
 *
 * 🔴 AY GEZGİNİ (SGK:36-40) T2'nin MEKANİZMASIDIR: `sgk-summary` ucu
 * `year`/`month` almaz, dönem listesi de yalnız `limit`/`offset` alır. İkinci
 * bir gezgin yazmak yerine `payroll-derive.ts`in `defaultPeriodId` /
 * `periodNavigation` türetmeleri yeniden kullanılır.
 *
 * 🔴 Seçim URL'de TAŞINMAZ (bileşen state'i) ⇒ `useSearchParams` yoktur ve
 * `Suspense` sarmalayıcısı gerekmez (mali tablolar kanonu).
 */
export function PayrollSgkView() {
  // IZN-F2.x · SGK'ya Gönder = mali.sgk_bildirimi Onaylar.
  const canSubmitSgk = useButtonGate({ pages: SGK_APPROVE, need: "approve" });
  // IZN-F5-ön · görüntüleme kapısı = bordro sayfaları Görür (VEYA); grant yoksa modül izni.
  const canViewPayroll = useButtonGate({ pages: PAYROLL_VIEW_PAGES, need: "view" });
  const periodsQuery = usePayrollPeriods();

  // `null` = kullanıcı henüz seçim yapmadı ⇒ varsayılan (en yeni dönem).
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows: readonly PayrollPeriodListRow[] = periodsQuery.data?.items ?? [];
  const periodId = selectedId ?? defaultPeriodId(rows);
  const summaryQuery = usePayrollSgkSummary(periodId);

  const submitSgk = useSubmitPayrollSgk();
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (!canViewPayroll || isForbidden(periodsQuery.error) || isForbidden(summaryQuery.error)) {
    return <AccessDenied />;
  }

  const periodsError = periodsQuery.isError
    ? backendErrorMessage(periodsQuery.error, SGK_PERIODS_ERROR_FALLBACK)
    : undefined;
  const summaryError = summaryQuery.isError
    ? backendErrorMessage(summaryQuery.error, SGK_ERROR_FALLBACK)
    : undefined;

  const navigation = periodNavigation(rows, periodId);
  const summary = summaryQuery.data;
  const truncation = buildListTruncation(rows.length, periodsQuery.data?.total);

  // 🔴 K7 TEK UÇUŞ: `isPending` doğrudan mutasyondan okunur (ayrı bir local
  // boolean YOK) ve düğme onunla kilitlenir — çift tıklama TEK istek atar.
  // `sgk-submit` idempotent DEĞİLDİR: ikinci damga 409'dur.
  const isSubmitPending = submitSgk.isPending;

  async function handleSubmit() {
    if (periodId === undefined) return;
    setSubmitError(null);
    try {
      await submitSgk.mutateAsync(periodId);
    } catch (error) {
      setSubmitError(backendErrorMessage(error, SGK_SUBMIT_ERROR_FALLBACK));
    }
  }

  function selectPeriod(nextId: string | undefined) {
    if (nextId === undefined) return;
    setSelectedId(nextId);
    setSubmitError(null);
  }

  /**
   * 🔴 K3 — dönem HİÇ YOKSA açıklayıcı boş durum; "dönem aç" DÜĞMESİ ÇİZİLMEZ
   * (`POST /payroll/periods` ucu var ama formunun mockup'ı yok).
   */
  const hasNoPeriods = periodsQuery.data !== undefined && rows.length === 0;

  /**
   * SGK:35 alt başlığı ve SGK:38 gezgin etiketi. Dönem henüz seçilmemişken
   * (liste yükleniyor ya da boş) ay adı UYDURULMAZ.
   */
  const periodLabel =
    navigation.current === undefined
      ? undefined
      : formatPeriod(navigation.current.year, navigation.current.month);

  // 🔴 Nöbetçi TÜM bağımsız veri kaynakları çözüldüğünde basılır: dönem
  // listesi + (dönem varsa) SGK özeti. Erken basılırsa görsel spec
  // "Yükleniyor…" karesini baseline'a gömerdi.
  const isLoaded = periodsQuery.data !== undefined && (hasNoPeriods || summary !== undefined);

  return (
    <div className="bors">
      {/* SGK:28-32 — üç bordro ekranının ORTAK şeridi. */}
      <PayrollTabsStrip />

      <div className="bors__head">
        <div>
          {/* SGK:35 */}
          <h1 className="bors__title">{SGK_PAGE_TITLE}</h1>
          {periodLabel !== undefined && (
            <p className="bors__subtitle" data-testid="bordro-sgk-subtitle">
              {sgkSubtitle(periodLabel)}
            </p>
          )}
        </div>

        <div className="bors__actions">
          {/* SGK:36-40 — `‹ Temmuz 2026 ›`. `‹`/`›` glif kapsamındadır (K5). */}
          <div className="bors-stepper" data-testid="bordro-sgk-stepper">
            <Button
              variant="ghost"
              size="sm"
              className="bors-stepper__arrow"
              aria-label={SGK_PREV_PERIOD_LABEL}
              disabled={navigation.previousId === undefined}
              onClick={() => selectPeriod(navigation.previousId)}
              data-testid="bordro-sgk-prev"
            >
              ‹
            </Button>
            <span className="bors-stepper__label" data-testid="bordro-sgk-period-label">
              {periodLabel ?? SGK_EMPTY_TITLE}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="bors-stepper__arrow"
              aria-label={SGK_NEXT_PERIOD_LABEL}
              disabled={navigation.nextId === undefined}
              onClick={() => selectPeriod(navigation.nextId)}
              data-testid="bordro-sgk-next"
            >
              ›
            </Button>
          </div>

          {/* SGK:22 — 🔴 K11: e-Bildirge XML ucu YOK. Düğme SİLİNMEZ; devre
              dışı basılır ve gerekçe öğenin kendi alanından okunur. */}
          <DisabledAction
            label={SGK_XML_LABEL}
            disabledReason={SGK_XML_DISABLED_REASON}
            testId="bordro-sgk-xml"
          />
        </div>
      </div>

      {truncation.isTruncated && (
        <p className="bors-notice" data-testid="bordro-sgk-truncation">
          {listTruncationMessage(truncation)}
        </p>
      )}

      {periodsError !== undefined && (
        <p className="bors-notice bors-notice--danger" data-testid="bordro-sgk-periods-error">
          {periodsError}
        </p>
      )}
      {summaryError !== undefined && (
        <p className="bors-notice bors-notice--danger" data-testid="bordro-sgk-error">
          {summaryError}
        </p>
      )}
      {periodsError === undefined &&
        summaryError === undefined &&
        !hasNoPeriods &&
        summary === undefined && (
          <p className="bors-notice" data-testid="bordro-sgk-loading">
            {SGK_LOADING_MESSAGE}
          </p>
        )}

      {hasNoPeriods && (
        <Alert variant="info" title={SGK_EMPTY_TITLE} data-testid="bordro-sgk-empty">
          {SGK_EMPTY_BODY}
        </Alert>
      )}

      {summary !== undefined && periodLabel !== undefined && (
        <SgkBody
          summary={summary}
          periodLabel={periodLabel}
          canWrite={canSubmitSgk}
          onSubmit={handleSubmit}
          isSubmitPending={isSubmitPending}
          submitError={submitError}
        />
      )}

      {isLoaded && <span hidden data-testid="bordro-sgk-loaded" />}
    </div>
  );
}

interface DisabledActionProps {
  label: string;
  /** 🔴 Gerekçe ÖĞENİN alanıdır; bileşen metni kendi yazmaz (T2/T3 kanonu). */
  disabledReason: string;
  testId: string;
}

/** Uçsuz eylem: silinmez, devre dışı + görünür gerekçe (K11). */
function DisabledAction({ label, disabledReason, testId }: DisabledActionProps) {
  return (
    <div>
      <Button variant="secondary" disabled data-testid={testId}>
        {label}
      </Button>
      <p className="bors__reason" data-testid={`${testId}-reason`}>
        {disabledReason}
      </p>
    </div>
  );
}

interface SgkBodyProps {
  summary: PayrollSgkSummaryResponse;
  periodLabel: string;
  canWrite: boolean;
  onSubmit: () => void;
  isSubmitPending: boolean;
  submitError: string | null;
}

/**
 * Veri geldikten sonraki gövde. Ayrı bileşen olması, yükleme/hata dallarında
 * `summary`nin `undefined` olabileceğini TİPİN söylemesini sağlar
 * (`PayrollPeriodBody` kanonu).
 */
function SgkBody({
  summary,
  periodLabel,
  canWrite,
  onSubmit,
  isSubmitPending,
  submitError,
}: SgkBodyProps) {
  return (
    <>
      {/* SGK:44-51 */}
      <SgkStatusBand
        summary={summary}
        periodLabel={periodLabel}
        canWrite={canWrite}
        onSubmit={onSubmit}
        isSubmitPending={isSubmitPending}
        submitError={submitError}
      />

      {/* 🔴 K3 — fail-closed sayaçlar. Sıfırdan büyük her sayaç GÖRÜNÜR bir
          bant yakar; oran seti tohumlanmamışken (IK3-SEED) sunucu SIFIR
          döndürür ve bu bant olmadan kullanıcı sıfırları GERÇEK sanardı. */}
      {summary.uncomputed_count > 0 && (
        <Alert
          variant="warning"
          title={SGK_UNCOMPUTED_BAND_TITLE}
          data-testid="bordro-sgk-uncomputed-band"
        >
          {sgkUncomputedBandBody(summary.uncomputed_count)}
        </Alert>
      )}
      {summary.unknown_rate_count > 0 && (
        <Alert
          variant="warning"
          title={SGK_UNKNOWN_RATE_BAND_TITLE}
          data-testid="bordro-sgk-unknown-rate-band"
        >
          {sgkUnknownRateBandBody(summary.unknown_rate_count)}
        </Alert>
      )}

      {/* SGK:54-59 */}
      <SgkKpiStrip summary={summary} />

      {/* SGK:62-93 */}
      <PayrollSgkPremiumTable summary={summary} periodLabel={periodLabel} />

      {/* SGK:96-118 — 🔴 K11: çalışan listesi BASILMAZ. Boş bir tablo çizmek
          "kolon var, veri gelmedi" derdi; oysa `sgk_no` kolonu HİÇ YOKTUR ve
          uç kişi bazlı satır döndürmez. Kartın YERİNE gerekçe basılır. */}
      <Alert
        variant="info"
        title={SGK_PERSONNEL_LIST_TITLE}
        data-testid="bordro-sgk-personnel-omitted"
      >
        {SGK_PERSONNEL_LIST_REASON}
      </Alert>
    </>
  );
}

/**
 * SGK:44-51 — bildirim durumu bandı.
 *
 * 🔴 K3 — mockup YALNIZ "gönderilmedi" hâlini çiziyor. Damga basılmış dönem de
 * gerçek bir sonuçtur ve AYRI, dürüst bir hâli vardır: başarı tonu, damganın
 * günü ve "ikinci damga reddedilir" notu. Aynı bandı iki hâlde de sarı
 * göstermek, bildirimi yapmış kullanıcıya her ay eksik iş varmış gibi
 * gösterirdi.
 */
function SgkStatusBand({
  summary,
  periodLabel,
  canWrite,
  onSubmit,
  isSubmitPending,
  submitError,
}: SgkBodyProps) {
  const stampedAt = summary.sgk_submitted_at;

  if (stampedAt !== null) {
    return (
      <div className="bors-status bors-status--done" data-testid="bordro-sgk-status">
        <Badge variant="success" data-testid="bordro-sgk-status-badge">
          {SGK_SUBMITTED_BADGE}
        </Badge>
        <div className="bors-status__body">
          <p className="bors-status__title">{sgkSubmittedTitle(periodLabel)}</p>
          <p className="bors-status__text" data-testid="bordro-sgk-submitted-at">
            {SGK_SUBMITTED_PREFIX} {formatDateLong(submittedDate(stampedAt))}
          </p>
          <p className="bors-status__note">{SGK_SUBMITTED_NOTE}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bors-status bors-status--pending" data-testid="bordro-sgk-status">
      <Badge variant="warning" data-testid="bordro-sgk-status-badge">
        {SGK_NOT_SUBMITTED_BADGE}
      </Badge>
      <div className="bors-status__body">
        {/* SGK:47 */}
        <p className="bors-status__title">{sgkNotSubmittedTitle(periodLabel)}</p>
        {/* 🔴 SGK:48 son bildirim tarihi UYDURULMAZ — veri yok, eksiklik söylenir. */}
        <p className="bors-status__text">{SGK_DEADLINE_UNKNOWN}</p>
        <p className="bors-status__note">{SGK_SUBMIT_NOTE}</p>
        {!canWrite && (
          <p className="bors-status__note" data-testid="bordro-sgk-submit-reason">
            {SGK_SUBMIT_NO_WRITE_REASON}
          </p>
        )}
        {submitError !== null && (
          <p className="bors-status__error" data-testid="bordro-sgk-submit-error">
            {submitError}
          </p>
        )}
      </div>

      {/* SGK:50 — 🔴 K7: `isPending` boyunca kilitli; çift tıklama TEK istek. */}
      <Button
        variant="warning"
        onClick={onSubmit}
        disabled={!canWrite || isSubmitPending}
        data-testid="bordro-sgk-submit"
      >
        {SGK_SUBMIT_LABEL}
      </Button>
    </div>
  );
}

interface SgkKpiStripProps {
  summary: PayrollSgkSummaryResponse;
}

/** SGK:54-59 — DÖRT kartlık özet şeridi (`repeat(4,1fr)`, 12px boşluk). */
function SgkKpiStrip({ summary }: SgkKpiStripProps) {
  const isHidden = useCategoryHidden(PAYROLL_HIDDEN_CATEGORIES);
  return (
    <div className="bors-kpis" data-testid="bordro-sgk-kpis">
      {/* SGK:55 — sayı, para DEĞİL. */}
      <KpiCard
        label={SGK_KPI_PERSONNEL_LABEL}
        value={String(summary.declared_personnel_count)}
        hint={SGK_KPI_PERSONNEL_HINT}
        tone="count"
        testId="bordro-sgk-kpi-personnel"
      />
      {/* SGK:56 */}
      <KpiCard
        label={SGK_KPI_BASE_LABEL}
        value={formatCurrencyTight(summary.sgk_base_total)}
        mark={<MaskedMark isHidden={isHidden} values={[summary.sgk_base_total]} />}
        tone="plain"
        testId="bordro-sgk-kpi-base"
      />
      {/* SGK:57 */}
      <KpiCard
        label={SGK_KPI_PREMIUM_LABEL}
        value={formatCurrencyTight(summary.sgk_premium_total)}
        mark={<MaskedMark isHidden={isHidden} values={[summary.sgk_premium_total]} />}
        hint={SGK_KPI_PREMIUM_HINT}
        tone="premium"
        testId="bordro-sgk-kpi-premium"
      />
      {/* SGK:58 */}
      <KpiCard
        label={SGK_KPI_UNEMPLOYMENT_LABEL}
        value={formatCurrencyTight(summary.unemployment_total)}
        mark={<MaskedMark isHidden={isHidden} values={[summary.unemployment_total]} />}
        tone="plain"
        testId="bordro-sgk-kpi-unemployment"
      />
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  mark,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  /** IZN-F4c.2 — değerin yanına maske kilidi (yalnız maskeli değer + kategori gizliyken içerik basar). */
  mark?: React.ReactNode;
  tone: "plain" | "count" | "premium";
  testId: string;
}) {
  return (
    <article className={`bors-kpi bors-kpi--${tone}`} data-testid={testId}>
      <h2 className="bors-kpi__label">{label}</h2>
      <p className="bors-kpi__value" data-testid={`${testId}-value`}>
        {value}
        {mark}
      </p>
      {hint !== undefined && <p className="bors-kpi__hint">{hint}</p>}
    </article>
  );
}
