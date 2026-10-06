"use client";

import { useState } from "react";

import {
  shiftPeriod,
} from "@/components/accounting/accounting-labels";
import { AccessDenied } from "@/components/settings/AccessDenied";
import { Button, Select } from "@/components/ui";
import { backendErrorMessage } from "@/lib/api/error-message";
import type { IncomeStatementResponse } from "@/lib/api/hooks/useIncomeStatement";
import { useIncomeStatement } from "@/lib/api/hooks/useIncomeStatement";
import { isForbidden } from "@/lib/api/unwrap";
import { ACCOUNTING_VIEW } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { pendingModuleLabel } from "@/lib/pending-modules";

import {
  INCOME_STATEMENT_EXPORT_REASON,
  PERFORMANCE_SUMMARY_REASON,
  PROJECT_FILTER_REASON,
  PROJECT_PROFITABILITY_REASON,
  defaultIncomeStatementPeriod,
  incomeStatementRangeLabel,
  isLatestIncomeStatementPeriod,
} from "./income-statement";
import { FinancialStatementsSegments } from "./FinancialStatementsSegments";
import { IncomeStatementBanner } from "./IncomeStatementBanner";
import { IncomeStatementTable } from "./IncomeStatementTable";
import {
  FINANCIAL_NAV_HEADING,
  FINANCIAL_STATEMENTS_URL,
} from "./shell/financial-statements-nav-config";
import "./financial-statements.css";

/**
 * E11 · `/mali-tablolar` KÖK ekranı = **GELİR TABLOSU** ekranı — mockup
 * `Ekran 11 - Mali Tablo.dc.html`. Yorumlardaki sayılar O dosyanın SATIR
 * numaralarıdır.
 *
 * 🔴 F-MT2 K3 — EKRAN KÖKTE KALIR. Mockup Gelir Tablosu'nu `/mali-tablolar`
 * olarak çiziyor; ayrı bir `/mali-tablolar/gelir-tablosu` rotası AÇILMAZ.
 * Sonucu: sub-nav'daki `Gelir Tablosu` satırı bir bağlantı değil, üst öğeyi
 * YANSITAN işaretçidir (ikinci bir bağlantı sayfada iki `aria-current` doğurur).
 *
 * 🔴 DRILL SIDEBAR HİÇBİR MALİ TABLO EKRANINDA YOKTUR (kullanıcı kararı
 * 2026-08-27). Yapraklardaki drill sidebar global kabuk sidebar'ıyla AYNI
 * konum/genişlikteydi (`fixed; left: 0; 220px; z-index: 90`) ve ana menüyü
 * ÖRTÜYORDU; kullanıcı ana menünün üç ekranda da SABİT kalmasını istedi.
 * E11:36-58 zaten TAM kabuk menüsünü çizer. Yaprak geçişi `SegmentedControl`e
 * (`FinancialStatementsSegments`) taşındı ve artık üç ekranda da basılır.
 *
 * 🔴 K2 — KAYNAKSIZ YÜZEYLER SİLİNMEZ, devre dışı basılır (F-TH kanonu) ve
 * gerekçeleri ÖĞENİN YANINA YAZILMAZ: `pending-modules` kaydından TÜRER
 * (F-PRJTAB kanonu). Kaynaksız olanlar: `PDF İndir` (E11:71), proje süzgeci
 * (E11:82), `Performans Özeti` (E11:151-167), `Proje Bazlı Karlılık`
 * (E11:169-189) ve gelir kalemlerinin TREND sütunu (E11:99).
 *
 * 🔴 EKRAN SALT-OKURDUR: uç yalnız `GET` tanımlar; hiçbir mutasyon yoktur.
 *
 * 🔴 Dönem URL'de TAŞINMAZ (bileşen state'i) ⇒ `useSearchParams` yoktur ve
 * `Suspense` sarmalayıcısı GEREKMEZ (`muhasebe/page.tsx` kanonu).
 */
export function FinancialStatementsHomeView() {
  const canViewAccounting = useButtonGate({ pages: ACCOUNTING_VIEW, need: "view" });

  // 🔴 "Bugün" BİR KEZ okunur: her render'da `new Date()` çağırmak, gece
  // yarısını geçen bir oturumda `›` okunu sessizce açar/kapatır ve kareyi
  // deterministik olmaktan çıkarırdı.
  const [today] = useState(() => new Date());
  // 🔴 VARSAYILAN DÖNEM İSTEMCİNİN KARARIDIR: sunucu "bugün"ü hiç okumaz.
  const [period, setPeriod] = useState(() =>
    defaultIncomeStatementPeriod(new Date()),
  );

  const statementQuery = useIncomeStatement(period.year, period.month);

  if (!canViewAccounting || isForbidden(statementQuery.error))
    return <AccessDenied />;

  const data = statementQuery.data;
  const errorMessage = statementQuery.isError
    ? backendErrorMessage(statementQuery.error, "Gelir tablosu yüklenemedi.")
    : undefined;

  return (
    <div className="fs mali-tablolar-content">
      {/* E11:62 — üst etiket; BL:33'ün aksine BAĞLANTI DEĞİLDİR (burası kök). */}
      <p className="fs__eyebrow" data-testid="mt-eyebrow">
        {FINANCIAL_NAV_HEADING}
      </p>

      <div className="fs__head">
        {/* E11:64 */}
        <h1 className="fs__title">Mali Tablolar</h1>
        <div className="fs__actions">
          {/* E11:66-70 — geçiş denetimi ÜÇ ekranda ORTAKtır (paylaşıma
              çıkarıldı, kullanıcı kararı 2026-08-27). Kökte CURRENT olan
              `Gelir Tablosu`dur: bu ekran ODUR. */}
          <FinancialStatementsSegments currentHref={FINANCIAL_STATEMENTS_URL} />
          {/* 🔴 K2 · E11:71 — ucu YOK; silinmez, devre dışı + gerekçesi EKRANDA. */}
          <Button variant="secondary" disabled data-testid="mt-export-pdf">
            PDF İndir
          </Button>
        </div>
      </div>

      <p className="fs-notice" data-testid="mt-export-reason">
        “PDF İndir”: {pendingModuleLabel(INCOME_STATEMENT_EXPORT_REASON)}.
      </p>

      {/* E11:76-83 — dönem gezgini + proje süzgeci. */}
      <div className="fs-mt-filters">
        <div className="fs-mt-period" data-testid="mt-period">
          {/* E11:78/80 — `‹`/`›` (U+2039/U+203A) `fonts.css`in `u+2000-206f`
              alt kümesindedir; `PeriodPicker` emsalinde olduğu gibi HTML
              varlığı olarak yazılır. */}
          <button
            type="button"
            className="fs-mt-period__arrow"
            aria-label="Önceki dönem"
            data-testid="mt-period-prev"
            onClick={() => setPeriod((current) => shiftPeriod(current, -1))}
          >
            &lsaquo;
          </button>
          {/* E11:79 — BİRİKİMLİ aralık (`Ocak–Temmuz 2026`). Mockup'ın sabit
              tarihi KOPYALANMAZ: dönemden türer. */}
          <span className="fs-mt-period__label" data-testid="mt-period-label">
            {incomeStatementRangeLabel(period)}
          </span>
          {/* 🔴 İleri ok, içinde bulunulan aydan SONRASINA kapalıdır: birikimli
              bir gelir tablosunun geleceği yoktur ve uç yapısal olarak SIFIR
              bir tablo döndürürdü ("bu ay hiç gelir yok" YALANI). */}
          <button
            type="button"
            className="fs-mt-period__arrow"
            aria-label="Sonraki dönem"
            data-testid="mt-period-next"
            disabled={isLatestIncomeStatementPeriod(period, today)}
            onClick={() => setPeriod((current) => shiftPeriod(current, 1))}
          >
            &rsaquo;
          </button>
        </div>

        {/* 🔴 K2 · E11:82 — uç `project_id` parametresi ALMAZ. Ham `<select>`
            YASAK, `ui` primitive'i kullanılır. Tek seçenek bırakılır:
            mockup'ın ikinci seçeneği (`Güneşkent A-Blok`) uçta KARŞILIĞI
            OLMAYAN bir vaat olurdu. */}
        <Select
          size="row"
          disabled
          defaultValue="all"
          aria-label="Proje süzgeci"
          data-testid="mt-project-filter"
        >
          <option value="all">Tüm Projeler</option>
        </Select>
      </div>

      <p className="fs-notice" data-testid="mt-project-filter-reason">
        “Proje süzgeci”: {pendingModuleLabel(PROJECT_FILTER_REASON)}.
      </p>

      {errorMessage !== undefined && (
        <p className="fs-notice fs-notice--danger" data-testid="mt-error">
          {errorMessage}
        </p>
      )}
      {errorMessage === undefined && data === undefined && (
        <p className="fs-notice" data-testid="mt-loading">
          Gelir tablosu yükleniyor…
        </p>
      )}

      {data !== undefined && <IncomeStatementBody data={data} />}

      {/* Görsel spec'in "yüklendi" iddiasının damgası (`bl-*`/`na-*` ailesi). */}
      {data !== undefined && <span hidden data-testid="mt-loaded" />}
    </div>
  );
}

/**
 * Veri geldikten sonraki gövde. Ayrı bir bileşen olması, yükleme/hata
 * dallarında `data`nın `undefined` olabileceğini TİPİN KENDİSİNİN söylemesini
 * sağlar (`BalanceSheetView` emsali) — isteğe bağlı zincir yerine.
 */
function IncomeStatementBody({ data }: { data: IncomeStatementResponse }) {
  return (
    <>
      {/* 🔴 K1 — mutabakat şeridi. Mockup ÇİZMİYOR (özdeşliği varsayıyor);
          ONAYLI SAPMA, gerekçesi `IncomeStatementBanner`ın başındadır. */}
      <IncomeStatementBanner data={data} />

      {/* E11:85 — iki sütunlu ızgara. */}
      <div className="fs-mt-grid" data-testid="mt-grid">
        {/* E11:87-147 — tablo kartı. */}
        <section className="fs-mt-card" data-testid="mt-income-statement">
          <div className="fs-mt-card__head">
            {/* E11:89 — kartın ADI; sunucuda karşılığı YOKTUR (uç bölüm/kalem
                etiketleri döndürür, kart başlığı döndürmez). */}
            <h2 className="fs-mt-card__title">Gelir Tablosu</h2>
            {/* 🔴 E11:90 — dönem SUNUCUNUN yanıtından okunur, istemcinin
                isteğinden DEĞİL: hangi dönemin görüldüğünün tek kanıtı budur. */}
            <p className="fs-mt-card__sub" data-testid="mt-is-period-label">
              {incomeStatementRangeLabel({
                year: data.year,
                month: data.month,
              })}
            </p>
          </div>
          <IncomeStatementTable data={data} />
        </section>

        {/* E11:150 — sağ sütun: iki özet kartı, 14px aralıkla. */}
        <div className="fs-mt-aside">
          {/* 🔴 K2 · E11:151-167 */}
          <PendingCard
            testId="mt-performance"
            title="Performans Özeti"
            reasonKey={PERFORMANCE_SUMMARY_REASON}
          />
          {/* 🔴 K2 · E11:169-189 */}
          <PendingCard
            testId="mt-profitability"
            title="Proje Bazlı Karlılık"
            reasonKey={PROJECT_PROFITABILITY_REASON}
          />
        </div>
      </div>
    </>
  );
}

interface PendingCardProps {
  readonly testId: string;
  readonly title: string;
  /** 🔴 Metin DEĞİL, ANAHTAR: gerekçe kayıttan TÜRER (F-PRJTAB kanonu). */
  readonly reasonKey: string;
}

/**
 * E11:151 · E11:169 — sağ sütunun İKİ devre dışı kartı.
 *
 * `CashProjectionCard` emsali: `aria-disabled` KULLANILMAZ (`<section>`ın
 * örtük `region` rolü onu desteklemez) ve kartta tıklanabilir öğe yoktur —
 * "devre dışı"lığı taşıyan şey GÖRÜNÜR gerekçedir, `title`daki bir ipucu
 * değil.
 */
function PendingCard({ testId, title, reasonKey }: PendingCardProps) {
  return (
    <section className="fs-mt-card fs-mt-card--disabled" data-testid={testId}>
      <div className="fs-mt-card__head">
        <h2 className="fs-mt-card__title">{title}</h2>
      </div>
      <p className="fs-notice" data-testid={`${testId}-reason`}>
        {pendingModuleLabel(reasonKey)}.
      </p>
    </section>
  );
}
