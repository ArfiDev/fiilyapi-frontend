"use client";

import Link from "next/link";
import { useState } from "react";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button } from "@/components/ui";
import { downloadTrialBalanceExport } from "@/lib/api/accounting-export-client";
import { backendErrorMessage } from "@/lib/api/error-message";
import { useTrialBalance } from "@/lib/api/hooks/useTrialBalance";
import { isForbidden } from "@/lib/api/unwrap";
import { ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { pendingModuleLabel } from "@/lib/pending-modules";

import {
  ACCOUNTING_REASONS,
  ACCOUNTING_URL,
  currentPeriod,
  type Period,
} from "./accounting-labels";
import { AccountingTabs } from "./shell/AccountingTabs";
import { PeriodPicker } from "./PeriodPicker";
import { trialBalanceRangeLabel } from "./trial-balance";
import { TrialBalanceBanner } from "./TrialBalanceBanner";
import { TrialBalanceTable } from "./TrialBalanceTable";
import "./accounting.css";

/**
 * MZ · `/muhasebe/mizan` — mockup `Muhasebe - Mizan.dc.html`. Yorumlardaki
 * sayılar O dosyanın SATIR numaralarıdır.
 *
 * Mockup'ın üst barı (MZ:18-26) ve sol menüsü (MZ:28-37) BASILMAZ: üst bar
 * kabuk canon'udur; MODÜL sekmeleri ise sol menüde DEĞİL, sayfa içi
 * `AccountingTabs` şeridindedir (F-MUP · KK-10 ile drill-in sidebar kalktı).
 *
 * 🔴 EKRAN SALT-OKURDUR: burada hiçbir `POST/PATCH/PUT/DELETE` yoktur.
 * Dönem kapatma/açma uçları (`accounting-periods`) MU-2 ile canlıdadır ama
 * MZ hiçbir kapat/aç düğmesi ÇİZMEZ ⇒ bu dilimde ekrana BAĞLANMAZ (K5).
 *
 * 🔴 Süzgeç URL'de TAŞINMAZ (bileşen state'i) — bu yüzden `useSearchParams`
 * yoktur ve `Suspense` sarmalayıcısı GEREKMEZ (`muhasebe/page.tsx` kanonu).
 */
export function TrialBalanceView() {
  const canViewAccounting = useButtonGate({ pages: ACCOUNTING_VIEW, need: "view" });

  // 🔴 K4 · varsayılan dönem YEREL takvimden (`currentPeriod`); `toISOString()`
  // UTC'ye çevirir ve TR saatinde ayın ilk/son gününde dönemi kaydırırdı (TB5).
  const [period, setPeriod] = useState<Period>(() => currentPeriod(new Date()));
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const trialBalanceQuery = useTrialBalance(period.year, period.month);

  /**
   * 🔴 EXPORT-XLSX · SIZINTI KURALI — dosya EKRANIN GÖRDÜĞÜ pencereden geniş
   * OLAMAZ. Bu ekranın TEK süzgeci dönem gezginidir ve `period` hem
   * `useTrialBalance`e hem buraya AYNI nesneden gider; ayrı bir "dışa aktarma
   * dönemi" state'i YOKTUR, olsaydı sessizce bayatlayabilirdi.
   *
   * `AuditLogScreen`/`PayrollMonthlyView` kanonu: uçuş sırasında düğme kilitli,
   * hata YUTULMAZ (sunucunun Türkçe `detail` metni ekrana basılır).
   */
  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      await downloadTrialBalanceExport({ year: period.year, month: period.month });
    } catch (error) {
      setExportError(backendErrorMessage(error, "Mizan Excel dosyası indirilemedi."));
    } finally {
      setIsExporting(false);
    }
  }

  if (!canViewAccounting || isForbidden(trialBalanceQuery.error)) {
    return <AccessDenied />;
  }

  const data = trialBalanceQuery.data;
  const errorMessage = trialBalanceQuery.isError
    ? backendErrorMessage(trialBalanceQuery.error, "Mizan yüklenemedi.")
    : undefined;

  return (
    <div className="mu">
      {/* MZ:39 — kabuğun breadcrumb'ı yerine mockup'ın geri bağlantısı. */}
      <p className="mu__eyebrow">
        <Link href={ACCOUNTING_URL} className="mu__back" data-testid="mz-back">
          ← Muhasebe
        </Link>
      </p>

      <div className="mu__head">
        {/* MZ:41 */}
        <h1 className="mu__title">Mizan</h1>
        <div className="mu__actions">
          {/* 🔴 MZ:43-47 — gezgin BİRİKİMLİ ARALIĞI adlandırır (`Ocak–Temmuz
              2026`), tek ayı DEĞİL: uç `year`+`month` alır ama pencere
              "1 Ocak → seçilen ayın son günü"dür. Etiket bu yüzden AÇIKÇA
              geçilir. Ok düğmelerinde ÜST SINIR YOKTUR — mockup sınır
              çizmiyor, ileri gidilebilir ve veri boş gelir (K4). */}
          <PeriodPicker
            period={period}
            onChange={setPeriod}
            label={trialBalanceRangeLabel(period)}
          />
          {/* 🔴 MZ:48 — EXPORT-XLSX ile GERÇEK: `GET /trial-balance/export.xlsx`. */}
          <Button
            variant="secondary"
            data-testid="mz-export-excel"
            disabled={isExporting}
            onClick={handleExport}
          >
            Excel
          </Button>
          {/* MZ:49 — PDF ucu HÂLÂ YOK ve AYRI BİR DİLİMDİR; düğme SİLİNMEZ
              (F-TH kanonu), devre dışı + gerekçesi EKRANDA (`title`da
              SAKLANMAZ). */}
          <Button variant="secondary" disabled data-testid="mz-export-pdf">
            PDF
          </Button>
        </div>
      </div>

      {/* F-MUP T1 — MP:105-112 modül sekmeleri; drill-in sidebar'ın YERİNE.
          Şerit sayfa BAŞLIĞININ ALTINDADIR (MP:103 → MP:105). */}
      <AccountingTabs />

      <p className="mu-notice" data-testid="mz-export-reason">
        “PDF”: {pendingModuleLabel(ACCOUNTING_REASONS.trialBalancePdfExport)}.
      </p>
      {exportError !== null && (
        <p className="mu-notice mu-notice--danger" data-testid="mz-export-error">
          {exportError}
        </p>
      )}

      {/* MZ:54-57 — kontrol banner'ı. Veri gelmeden BASILMAZ: `is_balanced`
          bilinmezken "dengede" demek de "dengesiz" demek de uydurma olurdu. */}
      {data !== undefined && (
        <TrialBalanceBanner isBalanced={data.is_balanced} totals={data.totals} />
      )}

      {/* MZ:59-173 — tablo kartı. */}
      <section className="mu-panel" aria-label="Mizan">
        <TrialBalanceTable
          rows={data?.rows}
          totals={data?.totals}
          isLoading={trialBalanceQuery.isLoading}
          errorMessage={errorMessage}
        />
      </section>

      {/* Görsel spec (T6) "yüklendi" iddiasını KAYNAĞA bağlar — damga "veri
          geldi" der, "ekrana bastı" DEMEZ (gerçek rakam ayrıca ölçülür). */}
      {data !== undefined && <span hidden data-testid="mz-loaded" />}
    </div>
  );
}
