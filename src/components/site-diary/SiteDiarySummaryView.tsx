"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { SiteDetailTabs } from "@/components/site-detail/SiteDetailTabs";
import { useProgressPayments, useProgressPaymentSummary } from "@/lib/api/hooks/useProgressPayments";
import { useSite } from "@/lib/api/hooks/useSites";
import { useSiteDiarySummary } from "@/lib/api/hooks/useSiteDiary";
import { useSiteSubcontractorPayments } from "@/lib/api/hooks/useSiteSubcontractorPayments";
import { isForbidden } from "@/lib/api/unwrap";
import { EMPLOYER_PAYMENT_EDIT, SITE_DIARY_VIEW_PAGES } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { formatPeriod } from "@/lib/format";

import { DiaryModeSwitch } from "./DiaryModeSwitch";
import { DiaryMonthNav } from "./DiaryMonthNav";
import { DiarySummaryAccrualTable } from "./DiarySummaryAccrualTable";
import { DiarySummaryKpiStrip } from "./DiarySummaryKpiStrip";
import { DiarySummaryProfitPanel } from "./DiarySummaryProfitPanel";
import { DiarySummaryTrendCard } from "./DiarySummaryTrendCard";
import { isoDate, isoPeriod, shiftPeriod } from "./derive";
import { computeDiaryAccrual } from "./payment-accrual";
import { computeDiarySummaryKpis } from "./summary-kpis";
import "@/components/site-detail/site-detail.css";
import "./site-diary.css";
import "./site-diary-summary.css";
import { routes } from "@/lib/routes";

/**
 * "Hakediş Özeti" modu — mockup `Şantiye - Hakediş Özeti.dc.html` (HÖ).
 *
 * Rota: `.../santiyeler/[siteId]/gunluk-kayit/ozet`. Kabuk/sekme şeridi/başlık
 * deseni "Kayıt Gir" (T2) ile AYNIDIR; sayfa kendi layout'unu kurmaz (drill
 * sidebar `[projectId]/layout.tsx`ten gelir).
 *
 * Veri kaynakları (hepsi ay süzmeli):
 *   - HÖ127-171 tablo → `GET /sites/{id}/diary/summary?year&month` (yalnız `submitted`)
 *   - HÖ101/106/111 KPI + HÖ175-230 panel → iki hakediş listesi, T3'ün
 *     `computeDiaryAccrual`ıyla AYNI türev (ay süzmesi istemcide)
 *   - HÖ116-119 kümülatif → `GET /projects/{id}/progress-payments/summary`
 *   - HÖ234-258 trend → PENDING kart; EK SORGU YOKTUR (spec §6 S4)
 */
export function SiteDiarySummaryView() {
  // 🔴 URL-3 — rota parametreleri "slug VEYA UUID"dur; ADRES anahtarlaridir.
  const { projectId: projectKey, siteId: siteKey } = useParams<{
    projectId: string;
    siteId: string;
  }>();

  // IZN-F2.x · Hakediş Oluştur = işveren hakediş ailesi Düzenler (IZN-F5b, HI).
  const canCreatePayment = useButtonGate({
    pages: EMPLOYER_PAYMENT_EDIT,
    need: "edit",
    projectId: projectKey,
  });
  // IZN-F5-ön · görüntüleme kapısı = günlük kayıt sayfaları Görür (VEYA); grant yoksa modül izni.
  const canViewDiary = useButtonGate({ pages: SITE_DIARY_VIEW_PAGES, need: "view", projectId: projectKey });
  const siteQuery = useSite(siteKey, { project: projectKey });
  // 🔴 SLUG -> KANONIK KIMLIK GECIS NOKTASI (bkz. `routes.ts` YOL/SORGU kurali).
  const siteId = siteQuery.data?.id ?? "";
  const projectId = siteQuery.data?.project.id ?? "";


  // Varsayılan dönem: içinde bulunulan GERÇEK ay (mockup'ın "Temmuz 2026"
  // sabiti KOPYALANMAZ — tarih artefaktı istisnası, spec başlığı).
  const [period, setPeriod] = useState<{ year: number; month: number }>(() =>
    isoPeriod(isoDate(new Date())),
  );

  const summaryQuery = useSiteDiarySummary(siteId, period);
  // İşveren hakedişi PROJE düzeyi bir kayıttır (F-TH kararı S4) → `site_id`
  // süzmesi kullanılmaz; taşeron tarafı U2'de SUNUCUDA süzülür. T3'le AYNI
  // sorgu anahtarları → ek ağ isteği doğmaz, önbellek paylaşılır.
  const employerPaymentsQuery = useProgressPayments({ project_id: projectId });
  const subcontractorPayments = useSiteSubcontractorPayments(projectId, siteId);
  const paymentSummaryQuery = useProgressPaymentSummary(projectId);

  if (!canViewDiary) return <AccessDenied />;
  if (isForbidden(siteQuery.error) || isForbidden(summaryQuery.error)) return <AccessDenied />;

  const site = siteQuery.data;
  // YOL baglantisi ADRESTEKI anahtarlarla kurulur — kanonik UUID gecirilseydi
  // kullanicinin okunur adresi bir tikta UUID'ye geri duserdi.
  //
  // Sekme şeridi "Günlük Kayıt" sekmesini AKTİF gösterir: özet, o sekmenin bir
  // alt görünümüdür (mod anahtarı ikisini birbirine bağlar).
  const siteParams = { projectId: projectKey, siteId: siteKey };
  const entryHref = routes.projects.sites.diary(siteParams);

  const accrual = computeDiaryAccrual({
    employerItems: employerPaymentsQuery.data?.items ?? [],
    isEmployerLoading: employerPaymentsQuery.isLoading,
    isEmployerError: employerPaymentsQuery.isError,
    subcontractorItems: subcontractorPayments.items,
    isSubcontractorLoading: subcontractorPayments.isLoading,
    isSubcontractorError: subcontractorPayments.isError,
    subcontractorTruncation: subcontractorPayments.truncation,
    year: period.year,
    month: period.month,
  });

  const kpis = computeDiarySummaryKpis({
    accrual,
    contractAmount: paymentSummaryQuery.data?.contract_amount ?? null,
    cumulativeGross: paymentSummaryQuery.data?.cumulative_gross ?? null,
    progressPct: paymentSummaryQuery.data?.progress_pct ?? null,
    isSummaryLoading: paymentSummaryQuery.isLoading,
    isSummaryError: paymentSummaryQuery.isError,
  });

  function handleShiftMonth(delta: number) {
    setPeriod((previous) => shiftPeriod(previous, delta));
  }

  return (
    <div className="diary">
      <SiteDetailTabs projectKey={projectKey} siteKey={siteKey} activePath={entryHref} />

      {/* HÖ77-81 */}
      <DiaryModeSwitch
        active="summary"
        entryHref={entryHref}
        planningHref={routes.projects.sites.diaryPlanning(siteParams)}
        summaryHref={routes.projects.sites.diarySummary(siteParams)}
      />

      {/* HÖ83-96 */}
      <div className="diary__head">
        <div>
          <h1 className="diary__title">
            Hakediş Özeti{site ? ` — ${site.name}` : ""}
          </h1>
          <p className="diary__subtitle">
            Günlük kayıtlardan otomatik hesaplanan · {formatPeriod(period.year, period.month)}
          </p>
        </div>
        <div className="diary__head-actions">
          <DiaryMonthNav year={period.year} month={period.month} onShift={handleShiftMonth} />
          {/* HÖ94 — yazma izni yoksa öğe SİLİNMEZ, gerekçesiyle devre dışı basılır */}
          {canCreatePayment ? (
            <Link className="diary-summary__cta" href={routes.progressPayments.new({ projectId })}>
              Hakediş Oluştur →
            </Link>
          ) : (
            <span
              className="diary-summary__cta diary-summary__cta--disabled"
              aria-disabled="true"
              title="İşveren hakediş sayfalarında Düzenler yetkisi gerekir"
            >
              Hakediş Oluştur →
            </span>
          )}
        </div>
      </div>

      {/* Zarif düşüş bildirimi (CLAUDE.md + T3 ile aynı cümle gerekçesi):
          işveren hakedişi PROJE düzeyinde tutulur, şantiye başına ayrı bir
          işveren toplamı uçtan gelmez. */}
      <p className="diary__notice">
        İşveren hakedişi ve kümülatif tutar proje düzeyinde tutulur; bu kartlar projenin tamamını
        kapsar. Taşeron ödemeleri ise bu şantiyeye süzülmüştür.
      </p>

      {/* HÖ99-121 */}
      <DiarySummaryKpiStrip kpis={kpis} />

      {/* HÖ123-231 — iki eşit sütun */}
      <div className="diary-summary__grid">
        <DiarySummaryAccrualTable
          summary={summaryQuery.data}
          isLoading={summaryQuery.isLoading}
          isError={summaryQuery.isError}
        />
        <DiarySummaryProfitPanel
          kpis={kpis}
          subcontractorPaymentsHref={routes.progressPayments.subcontractor.list()}
          employerPaymentsHref={routes.progressPayments.list()}
        />
      </div>

      {/* HÖ234-259 */}
      <DiarySummaryTrendCard siteName={site?.name ?? null} />
    </div>
  );
}
