"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button/Button";
import { ErrorCard, Skeleton, SkeletonRows } from "@/components/earned-value/common/state";
import { AnchoredPopover } from "@/components/ui/popover/AnchoredPopover";
import { RestrictedEmptyNotice } from "@/components/ui/restricted-empty-notice";
import { useDisciplineScope } from "@/lib/auth/useDisciplineScope";
import { downloadWeeklyXlsx, useWeeklyReport } from "@/lib/api/hooks/useEvReports";
import { backendErrorMessage } from "@/lib/api/error-message";
import { formatDateDots } from "@/lib/format";
import { formatPf, formatUnitRate, weeklyReportFailure } from "@/lib/earned-value";
import type { EvQurrReport, EvQurrTotal } from "@/lib/api/models";

import { cx } from "@/lib/cx";

import { TreeTable, type TreeTableColumn, type TreeTableHeaderGroup } from "../../common/tree-table/TreeTable";
import { PfBandCell } from "../kit/PfBandCell";
import { ReportDateNav } from "../kit/ReportDateNav";
import { formatWeekRangeShort } from "../kit/report-date-format";
import type { ReportScreenProps } from "../kit/report-screen";
import { QurrPrintView } from "./QurrPrintView";
import {
  QURR_COLUMNS,
  formatPacalDeviation,
  isPacalDeviationUp,
  qurrCellBand,
  qurrCellRaw,
  qurrCellText,
  qurrChangedColumns,
  qurrNodeCode,
  type QurrColumnKey,
} from "./qurr-columns";
import { buildQurrTree, type QurrTreeNodeData } from "./qurr-tree";
import { nextWeekSearch, parseWeekParam, WEEK_PARAM } from "./qurr-url";
import "./qurr-screen.css";

type QurrView = "screen" | "print";

/**
 * LİDER DENETİMİ (madde 1/2/3, KÖK NEDEN): tek `{span:2}` "İş kalemi"
 * hücresi (`colSpan=2`) `table-layout:fixed`in TEK genişlik referansı olan
 * İLK satırdaydı — tarayıcı colspan'lı bir hücrenin genişliğini kapsadığı
 * kolonlara EŞİT böler (78/176 yerine 127/127 çıktı, sticky `left` ofseti
 * gerçek kolon sınırıyla UYUŞMADI — metin kaymış/kırpılmış GÖRÜNDÜ, gerçek
 * bir `text-align`/flex kusuru DEĞİLDİ). Çözüm: SPAN KULLANMA — Kod ve İş
 * tipi için AYRI AYRI `span:1` girdi (ikisi de aynı koyu zemini taşıyan
 * `.tree-table__head.qurr-code-cell`/`.qurr-item-cell` sınıflarını kullanır);
 * her ikisi de artık kendi row-1 hücresinden KENDİ genişliğini (78px/176px)
 * doğrudan bildirir.
 *
 * LİDER DENETİMİ (4. TUR, ÖLÇÜLDÜ): yukarıdaki "görsel olarak TEK bar gibi
 * birleşir" varsayımı YANLIŞ çıktı — ekran görüntüsünde iki hücre arasında
 * (a) ortak tree-table.css'in `.tree-table__group-head + .tree-table__group-
 * head { border-left }` kuralından gelen GÖRÜNÜR bir ayraç çizgisi vardı,
 * (b) etiket yalnız "item" hücresinin İÇİNDE ortalandığından mockup'taki
 * gibi KOD'un altına kadar sola yaslı değildi. Düzeltme qurr-screen.css'te:
 * ayraç `border-left:none` ile kaldırıldı; etiket "code" hücresine taşındı
 * (`text-align:left` + `overflow:visible` + `white-space:nowrap`, KOD'un
 * kendi sol dolgusuyla aynı hizadan başlar) ve iki hücre AYNI koyu zemini
 * taşıdığından (`qurr-group--dark`) taşan metin komşu hücrenin üstünde
 * kesintisiz görünür — ayrı `<th>` olmaları artık GÖRSEL fark yaratmıyor.
 */
/**
 * Renk sırası Q:161-166: İş kalemi(koyu)·Miktar(açık)·Adam-saat(koyu)·Birim
 * oran(açık)·Performans(koyu). Grup sayısı 4'ten 6'ya çıkınca (`code`/`item`
 * ayrıldı) `.tree-table__group-head:nth-child(even)` OTOMATİK alternasyonu
 * KAYAR (paritesi değişir) — bu yüzden HER girdi KENDİ rengini `qurr-group--
 * dark`/`--alt` (`!important`) ile AÇIKÇA taşır, nth-child'a GÜVENİLMEZ.
 */
const HEADER_GROUPS: readonly TreeTableHeaderGroup[] = [
  { key: "code", label: "İş kalemi", span: 1, className: cx("qurr-code-cell", "qurr-group--dark") },
  { key: "item", label: "", span: 1, className: cx("qurr-item-cell", "qurr-group--dark") },
  { key: "qty", label: "Miktar", span: 5, className: "qurr-group--alt" },
  { key: "mhr", label: "Adam-saat", span: 7, className: "qurr-group--dark" },
  { key: "rate", label: "Birim oran · a-s/birim", span: 4, className: "qurr-group--alt" },
  { key: "pf", label: "Performans", span: 2, className: "qurr-group--dark" },
];

/**
 * `qurr-columns.ts/qurrCellText`in üstüne yalnız `changed` (sarı) bilgisini
 * ekler — biçim/tehlike hesabı EKRAN VE YAZDIRMADA AYNI fonksiyondan gelir
 * (CEO bulgusu; bkz. `qurrCellText` dokümantasyonu).
 */
function cellText(node: QurrTreeNodeData, key: QurrColumnKey): { text: string; changed: boolean; danger: boolean } {
  const changed = node.kind === "row" && qurrChangedColumns(node.row).has(key);
  const { text, danger } = qurrCellText(node, key);
  return { text, changed, danger };
}

function QurrCell({ node, columnKey }: { node: QurrTreeNodeData; columnKey: QurrColumnKey }) {
  if (columnKey === "q" || columnKey === "r") {
    const raw = qurrCellRaw(node, columnKey);
    const band = qurrCellBand(node, columnKey);
    return <PfBandCell as="span" value={raw === null ? null : formatPf(raw)} band={band ?? "none"} />;
  }
  const { text, changed, danger } = cellText(node, columnKey);
  return (
    <span className={changed ? "qurr-cell--changed" : danger ? "qurr-cell--danger" : undefined}>{text}</span>
  );
}

/**
 * Q:172-182 — kolon başlığı TIKLANABİLİR (formül tooltip'i açar/kapatır);
 * yalnız BİR tooltip açık kalır (`openColumn`, mockup `state.tip`).
 */
function QurrHeaderCell({
  col,
  open,
  onToggle,
}: {
  col: (typeof QURR_COLUMNS)[number];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <span className="qurr-head-cell-anchor">
      <button
        type="button"
        className={cx("qurr-head-cell", open && "qurr-head-cell--open")}
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`${col.full} — formülü göster`}
      >
        {/* LİDER DENETİMİ (madde 6): mockup ekran başlığı `c.label` (TAM
            metin, "Önceki rev.") basar — `c.short` ("Önc. rev") YALNIZ
            YAZDIRMA kompakt tablosunundur (`QurrPrintView` zaten `col.short`
            kullanıyor, doğru). Burada yanlışlıkla `short` kullanılıyordu. */}
        <span>{col.label}</span>
        <span className="qurr-head-cell__code">({col.key})</span>
      </button>
      {open && (
        <AnchoredPopover label={`(${col.key}) ${col.full}`} onClose={onToggle} escapeOverflow className="qurr-formula-pop">
          <span className="qurr-formula-pop__title">
            ({col.key}) {col.full}
          </span>
          <span className="qurr-formula-pop__formula">{col.formula}</span>
          <span className="qurr-formula-pop__note">{col.note}</span>
        </AnchoredPopover>
      )}
    </span>
  );
}

function qurrColumns(openColumn: QurrColumnKey | null, onToggleColumn: (key: QurrColumnKey) => void): TreeTableColumn<QurrTreeNodeData>[] {
  return QURR_COLUMNS.map(
    (col): TreeTableColumn<QurrTreeNodeData> => ({
      key: col.key,
      header: <QurrHeaderCell col={col} open={openColumn === col.key} onToggle={() => onToggleColumn(col.key)} />,
      align: "right",
      mono: true,
      render: (node) => <QurrCell node={node.data} columnKey={col.key} />,
    }),
  );
}

/**
 * "Kod" kolonu — LİDER DÜZELTMESİ (Q:162/169/187): mockup'ta Kod (78px) ve
 * İş tipi (176px) İKİ AYRI yapışkan kolondur, tek kolonda birleştirilMEZ.
 * Ara toplam satırlarında da `QurrTotal.code` basılır (Q:187 `r.code` her
 * satır türünde dolu — HD/SB/TOT hepsinde).
 */
const CODE_COLUMN: TreeTableColumn<QurrTreeNodeData> = {
  key: "code",
  header: "Kod",
  className: "qurr-code-cell",
  render: (node) => qurrNodeCode(node.data) ?? "—",
};

/**
 * LİDER DENETİMİ (madde 3): disiplin satırı Kendi/Taşeron (`total.
 * contractor_mix`, backend verisi), alt grup satırı sabit "alt grup"
 * (mockup Q:170/339 `u:'alt grup'` — DATA DEĞİL, `kind==="group"` sunum
 * metni; her alt grup için AYNI sabit dizeyi backend'in ayrıca göndermesi
 * gerekmez). Σ D / Σ D+DL (`direct_total`/`all_total`) etiket TAŞIMAZ
 * (mockup TOT satırının `u` alanı boş).
 */
function totalContractorLabel(total: EvQurrTotal): string | null {
  if (total.kind === "group") return "alt grup";
  if (total.kind === "discipline") return total.contractor_mix ?? null;
  return null;
}

const ITEM_COLUMN: TreeTableColumn<QurrTreeNodeData> = {
  key: "item",
  tree: true,
  header: "İş tipi",
  className: "qurr-item-cell",
  render: (node) => {
    const label = node.data.kind === "row" ? node.data.row.name : node.data.total.name;
    const uom = node.data.kind === "row" ? node.data.row.uom : null;
    const indirect = node.data.kind === "row" && node.data.row.is_direct === false;
    const contractorLabel = node.data.kind === "total" ? totalContractorLabel(node.data.total) : null;
    // LİDER DENETİMİ (kırpılma turu — son iş): kırpılabilen `qurr-item__name`
    // (Σ D/Σ D+DL etiketleri dâhil, `label` HER satır türünde tam adı taşır)
    // `title` alır — fare üstüne gelince tam metin görünür. Görseli
    // DEĞİŞTİRMEZ (`title` ekran çıktısı basmaz), yalnız erişilebilirlik/
    // ipucu katmanı.
    return (
      <span className="qurr-item">
        <span className="qurr-item__name" title={label}>
          {label}
        </span>
        {uom !== null && <span className="qurr-item__uom">{uom}</span>}
        {contractorLabel !== null && <span className="qurr-item__contractor">{contractorLabel}</span>}
        {indirect && <span className="qurr-item__badge">dolaylı</span>}
      </span>
    );
  },
};

function nodeLabel(node: { data: QurrTreeNodeData }): string {
  return node.data.kind === "row" ? node.data.row.name : node.data.total.name;
}

function rowClassName(node: { data: QurrTreeNodeData }): string | undefined {
  if (node.data.kind !== "total") return undefined;
  if (node.data.total.kind === "all_total") return "qurr-row--all-total";
  if (node.data.total.kind === "direct_total") return "qurr-row--direct-total";
  return undefined;
}

function QurrSkeleton({ weekNo }: { weekNo: number }) {
  return (
    <Skeleton label={`Hafta ${weekNo} raporu hazırlanıyor`} className="qurr-skeleton">
      <div className="qurr-skeleton__cards">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="qurr-skeleton__card" aria-hidden="true" />
        ))}
      </div>
      <SkeletonRows columns="78px 176px repeat(8, 1fr)" count={8} primaryColumn={1} density="sm" />
    </Skeleton>
  );
}

/**
 * PLN-F3.5 · Haftalık QURR ekranı. `?hafta=` URL durumunu KENDİSİ yönetir (`useBudgetUrlState`
 * deseni): ilk açılışta parametre yoksa `useWeeklyReport(siteId, null)` ile
 * backend'in bugünün haftasını ister, dönen `week_no`yu URL'e YAZAR (S1).
 */
export function WeeklyQurrScreen({ siteId, siteName, companyName, projectName, links, picker }: ReportScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlWeek = parseWeekParam(searchParams.get(WEEK_PARAM));

  const goToWeek = useCallback(
    (week: number | null) => {
      const params = nextWeekSearch(searchParams, week);
      const query = params.toString();
      router.replace(query ? `?${query}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  const report = useWeeklyReport(siteId, urlWeek);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<QurrView>("screen");
  const [pendingPrint, setPendingPrint] = useState(false);
  const [openColumn, setOpenColumn] = useState<QurrColumnKey | null>(null);
  const toggleColumn = useCallback(
    (key: QurrColumnKey) => setOpenColumn((current) => (current === key ? null : key)),
    [],
  );

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  // Q:361 `pdf()`: view'ı 'print'e alır; window.print() DOM güncellenip
  // print görünümü ekrana BASILDIKTAN sonra çağrılır (LİDER EK: buton
  // yazdırma görünümünü açıp window.print() çağırsın).
  useEffect(() => {
    if (pendingPrint && view === "print") {
      setPendingPrint(false);
      window.print();
    }
  }, [pendingPrint, view]);

  const scope = useDisciplineScope();
  const columns = useMemo(
    () => [CODE_COLUMN, ITEM_COLUMN, ...qurrColumns(openColumn, toggleColumn)],
    [openColumn, toggleColumn],
  );
  const tree = useMemo(
    () => (report.data ? buildQurrTree(report.data.rows, report.data.totals) : []),
    [report.data],
  );

  const resolvedWeekNo = report.data?.week_no ?? null;
  useEffect(() => {
    // İlk açılış: `?hafta=` yoksa backend bugünün haftasını döner; o hafta URL'e yazılır (§2).
    if (urlWeek === null && resolvedWeekNo !== null) goToWeek(resolvedWeekNo);
  }, [urlWeek, resolvedWeekNo, goToWeek]);

  const handleExcel = useCallback(async () => {
    if (urlWeek === null && report.data === undefined) return;
    const week = report.data?.week_no ?? urlWeek;
    if (week === null || week === undefined) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadWeeklyXlsx(siteId, week);
      setToast(`QURR-H${week}.xlsx hazırlandı`);
    } catch (error) {
      setDownloadError(backendErrorMessage(error, "Excel indirilemedi."));
    } finally {
      setDownloading(false);
    }
  }, [siteId, urlWeek, report.data]);

  // §7 S16 (CEO kararı, mockup Q:104'ü EZER): "Yazdır / PDF" düğmesi yazdırma
  // görünümünü açar VE window.print() çağırır.
  const handlePdf = useCallback(() => {
    setView("print");
    setPendingPrint(true);
  }, []);

  if (siteId.length === 0) {
    return <div className="qurr-screen">{picker}</div>;
  }

  if (report.isPending) {
    return (
      <div className="qurr-screen">
        {picker}
        <QurrSkeleton weekNo={urlWeek ?? 0} />
      </div>
    );
  }

  if (report.isError) {
    const failure = weeklyReportFailure(report.error);
    if (failure === "no_baseline") {
      return (
        <div className="qurr-screen">
          {picker}
          <ErrorCard
            title="Şantiyede aktif baseline yok"
            description="QURR, dondurulmuş (aktif) bir bütçe baseline'ı gerektirir. Adam-Saat Bütçesi'nde bir revizyonu dondurun."
            onRetry={() => report.refetch()}
          />
        </div>
      );
    }
    if (failure === "no_week") {
      return (
        <div className="qurr-screen">
          {picker}
          <ErrorCard
            title="Hafta proje takviminde yok"
            description="İstenen hafta şantiyenin takvim aralığının dışında."
            onRetry={() => goToWeek(null)}
            retryLabel="Güncel haftaya dön"
          />
        </div>
      );
    }
    if (failure === "forbidden") {
      return (
        <div className="qurr-screen">
          {picker}
          <ErrorCard title="Bu rapora erişim yetkiniz yok" onRetry={() => report.refetch()} />
        </div>
      );
    }
    return (
      <div className="qurr-screen">
        {picker}
        <ErrorCard
          title="QURR raporu alınamadı"
          description={backendErrorMessage(report.error, "Sunucu hatası.")}
          onRetry={() => report.refetch()}
        />
      </div>
    );
  }

  const data: EvQurrReport = report.data;

  return (
    <div className="qurr-screen">
      {picker}
      <header className="qurr-screen__head qurr-no-print">
        <h1 className="qurr-screen__title">Haftalık Miktar &amp; Birim Oran Raporu</h1>
        <p className="qurr-screen__subtitle">
          QURR · önceki revizyon <b>{data.previous_revision?.name ?? `Rev ${data.previous_revision?.number ?? "?"}`}</b>
          {data.previous_revision?.frozen_at !== null && data.previous_revision?.frozen_at !== undefined && (
            <> ({formatDateDots(data.previous_revision.frozen_at.slice(0, 10))})</>
          )}
          {" "}→ güncel <b>{data.revision.name ?? `Rev ${data.revision.number}`}</b>
          {data.revision.frozen_at !== null && <> ({formatDateDots(data.revision.frozen_at.slice(0, 10))})</>}
        </p>
      </header>

      <div className="qurr-screen__toolbar qurr-no-print">
        <ReportDateNav
          mode="week"
          weekNo={data.week_no}
          weekStart={data.week_start}
          weekEnd={data.week_end}
          minWeek={1}
          maxWeek={data.last_week_no ?? null}
          onChange={(week) => goToWeek(week)}
        />
        {/* Q:97-101 — Ekran / Yazdırma önizlemesi segmentli anahtar. */}
        <div className="qurr-segment" role="tablist" aria-label="Görünüm">
          <button
            type="button"
            role="tab"
            aria-selected={view === "screen"}
            className={cx("qurr-segment__item", view === "screen" && "qurr-segment__item--active")}
            onClick={() => setView("screen")}
          >
            Ekran
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "print"}
            className={cx("qurr-segment__item", view === "print" && "qurr-segment__item--active")}
            onClick={() => setView("print")}
          >
            Yazdırma önizlemesi
          </button>
        </div>
        <div className="qurr-screen__actions">
          <Button variant="secondary" size="sm" onClick={handleExcel} disabled={downloading || !data.has_field_data}>
            {/* Q:103 — yeşil belge ikonu. */}
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2.5" y="2" width="11" height="12" rx="1.5" stroke="#16a34a" strokeWidth="1.4" />
              <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#16a34a" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Excel indir
          </Button>
          <Button variant="secondary" size="sm" onClick={handlePdf} disabled={!data.has_field_data}>
            Yazdır / PDF
          </Button>
        </div>
      </div>

      {toast !== null && (
        <div role="status" className="qurr-screen__toast qurr-screen__toast--success qurr-no-print">
          {toast}
        </div>
      )}
      {downloadError !== null && (
        <div role="alert" className="qurr-screen__toast qurr-screen__toast--danger qurr-no-print">
          {downloadError}
        </div>
      )}

      {!data.has_field_data ? (
        <div className="qurr-screen__empty qurr-no-print">
          {/* Q:124 — kesikli takvim glifi, dekoratif. */}
          <svg width="28" height="28" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="2" y="3" width="12" height="11" rx="2" stroke="var(--color-text-subtle)" strokeWidth="1.3" strokeDasharray="2 2" />
            <path d="M2 7h12" stroke="var(--color-text-subtle)" strokeWidth="1.3" />
          </svg>
          <p className="qurr-screen__empty-title">Hafta {data.week_no} için veri yok</p>
          <p className="qurr-screen__empty-body">
            Bu haftaya ait gönderilmiş günlük yok. İlk günlük gönderildiğinde QURR kendiliğinden üretilir.
          </p>
          {data.last_week_no !== null && data.last_week_no !== undefined && data.last_week_no !== data.week_no && (
            <Button variant="secondary" size="sm" onClick={() => goToWeek(data.last_week_no ?? null)}>
              ← Hafta {data.last_week_no}&apos;e dön
            </Button>
          )}
        </div>
      ) : view === "print" ? (
        <QurrPrintView data={data} tree={tree} companyName={companyName} projectName={projectName} siteName={siteName} />
      ) : (
        <>
          <section className="qurr-cards qurr-no-print" aria-label="Performans ve paçal kartları">
            {data.kpis.map((kpi) => {
              const own = kpi.scope === "overall_own";
              return (
                <div key={kpi.scope} className="qurr-card">
                  <div className="qurr-card__head">
                    <span>{own ? "Kendi" : "Taşeron"} PF</span>
                    {/* Q:135 — etiket rozeti chipBg/chipFg (own=mavi, subcon=gri). */}
                    <span className={cx("qurr-card__chip", own ? "qurr-card__chip--own" : "qurr-card__chip--subcon")}>
                      {own ? "Kendi" : "Taşeron"}
                    </span>
                  </div>
                  <div className="qurr-card__grid">
                    <div className={cx("qurr-card__stat", `pf-band-cell--${kpi.pf_cum_band ?? "none"}`)}>
                      <span className="qurr-card__label">Bugüne kadar</span>
                      <span className="qurr-card__value">{kpi.pf_cum === null ? "—" : formatPf(kpi.pf_cum)}</span>
                    </div>
                    <div className={cx("qurr-card__stat", `pf-band-cell--${kpi.pf_week_band ?? "none"}`)}>
                      <span className="qurr-card__label">Bu hafta</span>
                      <span className="qurr-card__value">{kpi.pf_week === null ? "—" : formatPf(kpi.pf_week)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {data.composites.map((composite) => (
              <div key={composite.id} className="qurr-card qurr-card--pacal">
                <div className="qurr-card__head">
                  <span>Paçal</span>
                </div>
                <p className="qurr-card__pacal-label">{composite.name}</p>
                <div className="qurr-card__pacal-row">
                  <span className="qurr-card__pacal-actual">{formatUnitRate(composite.actual)}</span>
                  <span className="qurr-card__pacal-planned">
                    planlı <b>{formatUnitRate(composite.planned)}</b>
                  </span>
                  {composite.deviation !== null && (
                    <span
                      className={
                        isPacalDeviationUp(composite.deviation)
                          ? "qurr-card__pacal-dev qurr-card__pacal-dev--up"
                          : "qurr-card__pacal-dev qurr-card__pacal-dev--down"
                      }
                    >
                      {formatPacalDeviation(composite.deviation)}
                    </span>
                  )}
                </div>
                {composite.numerator_names !== undefined && composite.denominator_name !== undefined && (
                  <p className="qurr-card__pacal-def">
                    ({composite.numerator_names.join(" + ")} harcanan) ÷ {composite.denominator_name}
                  </p>
                )}
              </div>
            ))}
          </section>

          <section className="qurr-table-card qurr-no-print" aria-label="QURR tablosu">
            <div className="qurr-table-card__head">
              <span className="qurr-table-card__title">QURR tablosu · Hafta {data.week_no}</span>
              <span className="qurr-table-card__hint">
                Kod ve İş tipi kolonları yatay kaydırmada sabit · başlığa tıklayınca formül
              </span>
              <span className="qurr-table-card__legend">
                <span className="qurr-legend__swatch qurr-legend__swatch--red" />&lt; 0,95
                <span className="qurr-legend__swatch qurr-legend__swatch--amber" />0,95–1,00
                <span className="qurr-legend__swatch qurr-legend__swatch--green" />1,00 ve üstü
              </span>
            </div>
            <div className="qurr-table-card__scroll">
              <div className="qurr-table-card__inner">
                <TreeTable
                  nodes={tree}
                  columns={columns}
                  getLabel={nodeLabel}
                  variant="qurr"
                  ariaLabel={`QURR tablosu, Hafta ${data.week_no}`}
                  emptyText={
                    // Disiplini atanmış kullanıcıda backend süzmesi satırları boşaltabilir (DSC-F1.3).
                    scope.isRestricted ? <RestrictedEmptyNotice names={scope.names} /> : "Bu hafta için satır yok."
                  }
                  collapsible={false}
                  headerGroups={HEADER_GROUPS}
                  rowClassName={rowClassName}
                />
              </div>
            </div>
            <div className="qurr-table-card__foot">
              <span>
                Değişen revizyon hücreleri <span className="qurr-legend__chip">sarı</span>
              </span>
              <span>Gerçek oran güncel orandan yüksekse kırmızı yazı</span>
              <span>Sıfıra bölmede &quot;–&quot;</span>
            </div>
          </section>

          <p className="qurr-screen__footnote qurr-no-print">
            {data.generated_at !== null && data.generated_at !== undefined
              ? `Üretim ${formatDateDots(data.generated_at.slice(0, 10))}`
              : "Üretim —"}
            {" · "}
            Kaynak: Günlük İlerleme Raporları {formatWeekRangeShort(data.week_start, data.week_end)}
            {data.draft_diary_dates.length > 0 && (
              <> ({data.draft_diary_dates.map((d) => formatDateDots(d)).join(" ve ")} taslak)</>
            )}
            {" · "}
            <Link href={links.dailyReport(data.week_end)}>Günlük İlerleme Raporu →</Link>
          </p>
        </>
      )}
    </div>
  );
}
