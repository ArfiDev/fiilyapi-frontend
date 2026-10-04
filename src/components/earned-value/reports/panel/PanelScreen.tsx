"use client";

import Link from "next/link";

import { AccessDenied } from "@/components/settings/AccessDenied";
import { ErrorCard, ReadOnlyStrip } from "@/components/earned-value/common/state";
import { Select } from "@/components/ui/select/Select";
import { Segmented, type SegmentedOption } from "@/components/ui/segmented/Segmented";
import { ReportDateNav } from "../kit/ReportDateNav";
import { TreeTable } from "../../common/tree-table/TreeTable";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { useModulePermission } from "@/lib/auth/useModulePermission";
import { EV_BUDGET_EDIT } from "@/lib/auth/page-gates";
import { useButtonGate } from "@/lib/auth/usePagePermission";
import { usePanel, type ContractorFilter, type PanelRange } from "@/lib/api/hooks/useEvReports";
import { isForbidden } from "@/lib/api/unwrap";
import { bandsFromReport, DEFAULT_PF_BANDS } from "@/lib/earned-value";
import { EMPTY_CELL, formatDateDots, formatDecimal } from "@/lib/format";
import type { ReportScreenProps } from "../kit/report-screen";

import { usePanelUrlState } from "./panel-url-state";
import { panelScreenState } from "./panel-screen-state";
import { PanelLoadingSkeleton } from "./PanelLoadingSkeleton";
import { PanelBaselineEmptyState } from "./PanelBaselineEmptyState";
import { PanelNoFieldDataState } from "./PanelNoFieldDataState";
import { PanelKpiRow } from "./PanelKpiRow";
import { PanelWarningsCard } from "./PanelWarningsCard";
import { PanelSCurveChart } from "./PanelSCurveChart";
import { PanelDailyBarsChart } from "./PanelDailyBarsChart";
import { PanelPfTrendChart } from "./PanelPfTrendChart";
import { PanelHistogramChart } from "./PanelHistogramChart";
import { PANEL_COLUMNS } from "./panel-columns";
import { buildPanelTree, panelDefaultExpanded } from "./panel-tree";
import "./panel-screen.css";

const RANGE_OPTIONS: readonly SegmentedOption<PanelRange>[] = [
  { value: "4w", label: "4 hafta" },
  { value: "3m", label: "3 ay" },
  { value: "all", label: "Tümü" },
];

const RANGE_LABEL: Record<PanelRange, string> = { "4w": "son 4 hafta", "3m": "son 3 ay", all: "tüm süre" };

type OwnerValue = ContractorFilter | "all";
const OWNER_OPTIONS: readonly SegmentedOption<OwnerValue>[] = [
  { value: "own", label: "Kendi" },
  { value: "subcon", label: "Taşeron" },
  { value: "all", label: "Hepsi" },
];
const OWNER_LABEL: Record<OwnerValue, string> = { own: "Kendi", subcon: "Taşeron", all: "Kendi + Taşeron" };

/**
 * PLN-F3.3 · Planlama Paneli — Panel:79-448. URL durumu `?tarih&aralik&
 * disiplin&yuklenici` (kök ikizde + `?site=`, `useEvSiteParam` çağıranda).
 * Disiplin/kendi-taşeron filtresi BACKEND'e query olarak
 * gider (`usePanel`) — istemci hiçbir satırı/uyarıyı KENDİSİ süzmez, S8
 * görünürlük süzgeci BİLE zaten-filtrelenmiş `report.rows`e göre çalışır.
 */
// 🔴 `siteName`/`companyName`/`projectName` KULLANILMAZ: `ReportScreenProps`
// ortak sözleşmesinin parçası (GİR/QURR eyebrow'unda TÜKETİLİR), Panel
// mockup'ta o alt satırı BASMAZ — kırıntı zaten aynı bilgiyi taşır.
export function PanelScreen({ siteId, siteCompleted, links, picker }: ReportScreenProps) {
  const permission = useModulePermission("earned_value");
  const url = usePanelUrlState();
  const report = usePanel(siteId, {
    date: url.date,
    range: url.range,
    disciplineId: url.disciplineId,
    contractorType: url.contractorType,
  });

  const state = panelScreenState({
    siteId,
    isForbidden: isForbidden(report.error),
    isError: report.isError,
    isLoading: report.isLoading,
    hasBaseline: report.data?.has_baseline,
    hasFieldData: report.data?.has_field_data,
  });

  const ownerValue: OwnerValue = url.contractorType ?? "all";
  const scope = useDisciplineScope();
  // IZN-F2.x · saat dağıtımı bağlantısı = adam-saat bütçesi/ayarlar.planlama Düzenler (VEYA).
  const canWriteAllocation = useButtonGate({ pages: EV_BUDGET_EDIT, need: "edit", fallback: permission.canWrite });
  const canDistribute = canWriteAllocation && !siteCompleted;
  // Küm./hafta PF (KPI 2/3 + uyarılar kartı) AYNI eşik kümesini paylaşır —
  // `bandsFromReport` API'nin `cumulative` alanını kod tarafının `weekly`
  // anahtarına eşler (bkz. `bands-adapter.ts`); tek kaynaktan hesaplanır.
  const pfRange = bandsFromReport(report.data?.pf_bands ?? null)?.weekly ?? DEFAULT_PF_BANDS.weekly;

  return (
    <div className="ev-panel">
      {/*
       * 🔴 PLN-F3.6b LİDER DENETİMİ KUSURU: mockup'ta başlığın altında firma ·
       * proje · şantiye alt satırı YOK — bu bilgiyi kabuğun ÜST kırıntısı
       * (breadcrumb) zaten taşır, ekran onu TEKRAR ETMEZ.
       */}
      <div className="ev-panel__head">
        <h1 className="ev-panel__title">Planlama Paneli</h1>
        {picker}
      </div>

      {siteCompleted && (
        <ReadOnlyStrip variant="compact">Görüntüleyici · yalnız okuma</ReadOnlyStrip>
      )}

      {/*
       * LİDER TALEBİ (2026-09-26, S32 turu) — mockup Panel.dc.html:353-355
       * TEK satır DEĞİL, İKİ satırlı bir düzen: 1. satır gezgin + aralık +
       * disiplin; 2. satır Kendi/Taşeron/Hepsi solda, Baseline çipi sağda.
       * Önceki tur (F3.6b 8-madde) yalnız "sarmıyor mu" bekçiledi, satır
       * SAYISINI DEĞİL — bu ayrım (i) kod kusuru sayıldı, aşağıda düzeltildi.
       */}
      {state === "site" ? null : (
        <div className="ev-panel__toolbar">
          <div className="ev-panel__toolbar-row">
            <ReportDateNav
              mode="day"
              day={url.date}
              dayNo={report.data?.day_no ?? null}
              weekNo={report.data?.week_no ?? null}
              min={report.data?.calendar_start ?? null}
              max={report.data?.calendar_end ?? null}
              onChange={url.setDate}
            />
            <Segmented aria-label="Zaman aralığı" options={RANGE_OPTIONS} value={url.range} onChange={url.setRange} />
            {/*
             * 🔴 LİDER DENETİMİ KUSURU: `Select` gövdesi (`select-wrap`)
             * `width:100%` TAŞIR (form alanı varsayılanı) — flex satırda bu,
             * kalan TÜM genişliği yutar. Mockup kompakt bir açılır liste
             * gösterir; sarmalayıcı DAR bir genişlik verir (primitive'in
             * KENDİSİ değiştirilmedi — başka yüzeylerde `width:100%` DOĞRU
             * varsayılandır).
             * LİDER DENETİMİ KUSURU (3. tur) — mockup Panel:117 "DİSİPLİN"
             * küçük gri büyük harf öneki kutu İÇİNDE basar; `<span
             * aria-hidden>` GÖRSEL öneki taşır (erişilebilir isim `Select`in
             * `aria-label`inden ZATEN gelir, öneki EKRAN OKUYUCUYA TEKRAR
             * ETMEZ).
             */}
            <div className="ev-panel__toolbar-select">
              <span className="ev-panel__toolbar-select-label" aria-hidden="true">
                Disiplin
              </span>
              <Select
                aria-label="Disiplin"
                value={url.disciplineId ?? ""}
                onChange={(event) => url.setDisciplineId(event.target.value === "" ? null : event.target.value)}
              >
                <option value="">Tüm disiplinler</option>
                {(report.data?.disciplines ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="ev-panel__toolbar-row">
            <Segmented
              aria-label="Kendi / Taşeron"
              options={OWNER_OPTIONS}
              value={ownerValue}
              onChange={(value) => url.setContractorType(value === "all" ? null : value)}
            />
            {report.data?.revision && (
              <span className="ev-panel__baseline-chip">
                Baseline: <b>Rev {report.data.revision.number}</b>
                {report.data.revision.frozen_at !== null && (
                  <span className="ev-panel__baseline-chip-date">{formatDateDots(report.data.revision.frozen_at.slice(0, 10))}</span>
                )}
              </span>
            )}
          </div>
        </div>
      )}

      {state === "site" && <p className="ev-panel__pending">Şantiye seçilmedi.</p>}
      {state === "forbidden" && <AccessDenied />}
      {state === "error" && (
        <ErrorCard title="Panel verisi alınamadı" description="Hesaplama servisi yanıt vermedi. Girilen veriler kaybolmadı." onRetry={() => void report.refetch()} retrying={report.isFetching} />
      )}
      {state === "loading" && <PanelLoadingSkeleton />}
      {state === "no-baseline" && <PanelBaselineEmptyState budgetHref={links.budget} />}
      {state === "no-field-data" && report.data && <PanelNoFieldDataState sCurve={report.data.s_curve} />}

      {state === "loaded" && report.data && (
        <>
          <PanelKpiRow
            kpi={report.data.kpi}
            weekNo={report.data.week_no}
            distributeHref={links.diary(report.data.day)}
            canDistribute={canDistribute}
            pfRange={pfRange}
            reportDay={report.data.day}
          />

          <div className="ev-panel__row">
            <PanelSCurveChart
              sCurve={report.data.s_curve}
              revisionNumber={report.data.revision?.number ?? null}
              dayNo={report.data.day_no}
              range={url.range}
            />
            <PanelWarningsCard
              warnings={report.data.warnings}
              visibleRows={report.data.rows}
              links={links}
              pfRedBelow={pfRange.redBelow}
              kpi={report.data.kpi}
            />
          </div>

          <div className="ev-panel__charts-grid">
            <PanelDailyBarsChart bars={report.data.bars} />
            <PanelPfTrendChart
              pfTrend={report.data.pf_trend}
              pfBands={report.data.pf_bands ?? null}
              rangeLabel={RANGE_LABEL[url.range]}
              reportDay={report.data.day}
            />
            <PanelHistogramChart histogram={report.data.histogram} rangeLabel={RANGE_LABEL[url.range]} actualBasis={report.data.actual_basis} />
          </div>

          <div className="ev-panel__table-card">
            <div className="ev-panel__table-head">
              <span className="ev-panel__table-title">Disiplin tablosu</span>
              <span className="ev-panel__table-note">
                {formatDateDots(report.data.day)} · {url.disciplineId === null ? "tüm disiplinler" : ((report.data.disciplines ?? []).find((d) => d.id === url.disciplineId)?.name ?? "")} · {OWNER_LABEL[ownerValue]} · tolerans ±{report.data.tolerance_points === null ? EMPTY_CELL : formatDecimal(report.data.tolerance_points, 1)} puan
              </span>
              <Link href={links.dailyReport(report.data.day)} className="ev-panel__table-link">
                Günlük İlerleme Raporu →
              </Link>
            </div>
            {/*
             * 🔴 PLN-F3.6b LİDER DÜZELTMESİ (Panel.dc.html:454
             * `open: { KAB: true }` — görsel spec turunda ölçüldü):
             * `defaultExpanded` HİÇ verilmiyordu → TreeTable'ın varsayılanı
             * "none", disiplin/iş tipi satırlarının TAMAMI kapalı
             * başlıyordu. Mockup yalnız İLK disiplinin (süzgeç yoksa) ya da
             * SEÇİLİ disiplinin (süzgeç varsa) iş tiplerini açık basar —
             * `panelDefaultExpanded` bu kuralı hesaplar. `key` disiplin
             * süzgeci değiştiğinde tabloyu YENİDEN MONTE eder: TreeTable
             * `defaultExpanded`i yalnız İLK render'da okur (kontrolsüz
             * durum), `key` olmadan süzgeç değişince açıklık kümesi
             * BAYATLARDI. `collapsible` KALDI (kullanıcı isterse kapatır).
             */}
            <TreeTable
              key={url.disciplineId ?? "all"}
              nodes={buildPanelTree(report.data.rows)}
              columns={PANEL_COLUMNS}
              getLabel={(node) => node.data.name}
              variant="panel"
              ariaLabel="Disiplin tablosu"
              emptyText={
                scope.isRestricted && url.disciplineId === null && ownerValue === "all" ? (
                  // Süzgeçsiz (tüm disiplinler + tüm iş sahipleri) boşluk = backend
                  // disiplin süzmesi (DSC-F1.3); süzgeçli boşluk eski metni korur.
                  <RestrictedEmptyNotice names={scope.names} />
                ) : (
                  `Seçilen filtrede kalem yok · ${url.disciplineId === null ? "Tüm disiplinler" : ((report.data.disciplines ?? []).find((d) => d.id === url.disciplineId)?.name ?? "")} disiplini ${OWNER_LABEL[ownerValue]} ile yapılmıyor.`
                )
              }
              collapsible
              defaultExpanded={panelDefaultExpanded(report.data.rows, url.disciplineId)}
              // LİDER TALEBİ (2026-09-26, S32 turu) — mockup Panel:542
              // `bt: '1.5px dashed #cbd5e1'`: `non_direct` satırının ÜST
              // kenarlığı kesikli (diğer satırlar düz `1px solid`).
              rowClassName={(node) => (node.data.scope === "non_direct" ? "ev-panel-table__row--non-direct" : undefined)}
            />
          </div>
        </>
      )}
    </div>
  );
}
