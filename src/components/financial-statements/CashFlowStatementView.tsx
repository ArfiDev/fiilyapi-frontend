"use client";

import Link from "next/link";
import { useState } from "react";

import { ACCOUNTING_PERMISSION_MODULE } from "@/components/accounting/accounting-labels";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Select } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { CashFlowStatementResponse } from "@/lib/api/hooks/useCashFlowStatement";
import { useCashFlowStatement } from "@/lib/api/hooks/useCashFlowStatement";
import { isForbidden } from "@/lib/api/unwrap";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { pendingModuleLabel } from "@/lib/pending-modules";

import {
  CASH_FLOW_EXPORT_REASON,
  cashFlowPeriodOptions,
  cashFlowPeriodValue,
  defaultCashFlowPeriod,
  parseCashFlowPeriod,
} from "./cash-flow-statement";
import { CashFlowKpiStrip } from "./CashFlowKpiStrip";
import { CashFlowTable } from "./CashFlowTable";
import { CashProjectionCard } from "./CashProjectionCard";
import { MonthlyCashChart } from "./MonthlyCashChart";
import { FinancialStatementsSegments } from "./FinancialStatementsSegments";
import {
  CASH_FLOW_URL,
  FINANCIAL_STATEMENTS_URL,
} from "./shell/financial-statements-nav-config";
import "./financial-statements.css";

/**
 * NA · `/mali-tablolar/nakit-akisi` — mockup `Mali Tablo - Nakit Akışı.dc.html`.
 * Yorumlardaki sayılar O dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın üst barı (NA:14-22) BASILMAZ: kabuk canon'udur.
 *
 * 🔴 SOL MENÜ (NA:24-31) DA BASILMAZ — 🔴 ONAYLI SAPMA (kullanıcı kararı
 * 2026-08-27). Mockup NA:24-31 bu menüyü ÇİZER; kullanıcı birebir şunu
 * söyledi: «biliyorum bu mockupta öyle ama sen dediğimi yap». Yani bu
 * mockup-birebir kuralından BİLİNÇLİ, ONAYLI bir sapmadır — SONRAKİ TUR
 * "mockup çiziyor" DİYE GERİ ALMASIN. Drill
 * sidebar global kabuk sidebar'ıyla aynı konum/genişlikteydi ve ana menüyü
 * ÖRTÜYORDU; kullanıcı ana menünün sabit kalmasını istedi. Yaprak geçişi
 * `FinancialStatementsSegments`e taşındı (bkz. `BalanceSheetView`).
 *
 * 🔴 Segment etiketi `Nakit Akışı`dır (NA:30) ama sayfa başlığı
 * `Nakit Akış Tablosu`dur (NA:35) — ikisi BİLEREK farklıdır, hizalanmaz.
 *
 * 🔴 EKRAN SALT-OKURDUR: uç yalnız `GET` tanımlar; hiçbir mutasyon yoktur.
 *
 * 🔴 Süzgeç URL'de TAŞINMAZ (bileşen state'i) ⇒ `useSearchParams` yoktur ve
 * `Suspense` sarmalayıcısı GEREKMEZ (`muhasebe/page.tsx` kanonu).
 */
export function CashFlowStatementView() {
  const permission = useModulePermission(ACCOUNTING_PERMISSION_MODULE);
  const canViewAccounting = useButtonGate({ pages: ACCOUNTING_VIEW, need: "view", fallback: permission.canView });

  // 🔴 K10 — VARSAYILAN DÖNEM İSTEMCİNİN KARARIDIR: sunucu "bugün"ü hiç
  // okumaz. Yerel takvimden türer (`toISOString()` UTC'ye çevirir ve TR
  // saatinde ay sonunda dönemi bir ay kaydırırdı — TB5 dersi).
  const [periodOptions] = useState(() => cashFlowPeriodOptions(new Date()));
  const [period, setPeriod] = useState(() => defaultCashFlowPeriod(new Date()));

  const statementQuery = useCashFlowStatement(period.year, period.month);

  if (!canViewAccounting || isForbidden(statementQuery.error)) {
    return <AccessDenied />;
  }

  const data = statementQuery.data;
  const errorMessage = statementQuery.isError
    ? backendErrorMessage(
        statementQuery.error,
        "Nakit akış tablosu yüklenemedi.",
      )
    : undefined;

  return (
    <div className="fs mali-tablolar-content">
      {/* NA:33 — `←` (U+2190) `fonts.css` kapsamındadır ve
            `symbol-subset-guard`da ONAYLIDIR. */}
      <p className="fs__eyebrow">
        <Link
          href={FINANCIAL_STATEMENTS_URL}
          className="fs__back"
          data-testid="na-back"
        >
          ← Mali Tablolar
        </Link>
      </p>

      <div className="fs__head">
        {/* NA:35 — segment etiketinden (NA:30 `Nakit Akışı`) FARKLI. */}
        <h1 className="fs__title">Nakit Akış Tablosu</h1>
        <div className="fs__actions">
          {/* Yaprak geçişi (kullanıcı kararı 2026-08-27) — CURRENT bu
                ekrandır. */}
          <FinancialStatementsSegments currentHref={CASH_FLOW_URL} />
          {/* 🔴 NA:37 — BİRİKİMLİ ARALIK seçicisi (bilançonun nokta-zamanından
                FARKLI). Ham `<select>` YASAK, `ui` primitive'i kullanılır. */}
          <Select
            size="row"
            value={cashFlowPeriodValue(period)}
            onChange={(event) =>
              setPeriod((current) =>
                parseCashFlowPeriod(event.target.value, current),
              )
            }
            aria-label="Nakit akışı dönemi"
            data-testid="na-period"
          >
            {periodOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {/* NA:38 — düğmenin UCU YOK; SİLİNMEZ (K8/F-TH kanonu), devre dışı
                + gerekçesi EKRANDA (`title`da SAKLANMAZ). */}
          <Button variant="secondary" disabled data-testid="na-export-pdf">
            PDF
          </Button>
        </div>
      </div>

      <p className="fs-notice" data-testid="na-export-reason">
        “PDF”: {pendingModuleLabel(CASH_FLOW_EXPORT_REASON)}.
      </p>

      {errorMessage !== undefined && (
        <p className="fs-notice fs-notice--danger" data-testid="na-error">
          {errorMessage}
        </p>
      )}
      {errorMessage === undefined && data === undefined && (
        <p className="fs-notice" data-testid="na-loading">
          Nakit akış tablosu yükleniyor…
        </p>
      )}

      {data !== undefined && <CashFlowStatementBody data={data} />}

      {/* Görsel spec'in "yüklendi" iddiasının damgası. */}
      {data !== undefined && <span hidden data-testid="na-loaded" />}
    </div>
  );
}

/**
 * Veri geldikten sonraki gövde. Ayrı bir bileşen olması, yükleme/hata
 * dallarında `data`nın `undefined` olabileceğini TİPİN KENDİSİNİN söylemesini
 * sağlar (`BalanceSheetView` emsali) — isteğe bağlı zincir yerine.
 */
function CashFlowStatementBody({ data }: { data: CashFlowStatementResponse }) {
  return (
    <>
      {/* NA:43-60 */}
      <CashFlowKpiStrip data={data} />

      {/* NA:62 — `1fr 380px`, 20px boşluk. */}
      <div className="fs-cf-grid">
        {/* NA:65-112 */}
        <CashFlowTable data={data} />

        {/* NA:116-160 — sağ sütun: grafik + (devre dışı) projeksiyon. */}
        <div className="fs-cf-aside">
          {/* NA:117-141 */}
          <MonthlyCashChart series={data.monthly_cash} />
          {/* NA:143-159 — K8 */}
          <CashProjectionCard />
        </div>
      </div>
    </>
  );
}
